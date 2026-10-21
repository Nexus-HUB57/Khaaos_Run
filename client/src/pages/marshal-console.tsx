import React, { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Clock3, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CouncilResponse,
  CouncilStatus,
  MarshalConsoleApiError,
  MarshalOverview,
  MarshalProposal,
  MarshalWorldId,
  MARSHAL_WORLDS,
  createMarshalCouncil,
  fetchMarshalCouncil,
  fetchMarshalOverview,
  fetchMarshalProposal,
} from "@/lib/marshal-console-api";

interface CouncilDraft {
  subject: string;
  periodSeconds: string;
}

const INITIAL_DRAFT: CouncilDraft = { subject: "", periodSeconds: "3600" };

const TERMINAL_STATUSES = new Set<CouncilStatus>(["complete", "partial", "failed"]);

function errorMessage(error: unknown): string {
  if (error instanceof MarshalConsoleApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (error.status === 403) return "Este usuário não está autorizado. O acesso é controlado por MARSHAL_CONSOLE_OPERATOR_IDS no servidor.";
    if (error.status === 429) return "Limite de 10 conselhos por minuto atingido. Aguarde antes de tentar novamente.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Não foi possível concluir a solicitação.";
}

function newIdempotencyKey(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Este navegador não oferece uma chave segura para a solicitação.");
  }
  return crypto.randomUUID();
}

function buildCouncilInput(worldId: MarshalWorldId, draft: CouncilDraft) {
  const subject = draft.subject.trim();
  if (subject.length < 2 || subject.length > 120) {
    throw new Error("O assunto precisa ter entre 2 e 120 caracteres.");
  }
  const periodSeconds = Number(draft.periodSeconds);
  if (!Number.isInteger(periodSeconds) || periodSeconds < 60 || periodSeconds > 2_592_000) {
    throw new Error("O período precisa ser um inteiro entre 60 e 2.592.000 segundos.");
  }
  return { subject, scope: { worldId, periodSeconds } };
}

function statusLabel(status: CouncilStatus): string {
  return {
    queued: "NA FILA",
    running: "EM ANDAMENTO",
    complete: "CONCLUÍDO",
    partial: "PARCIAL · REVISÃO HUMANA",
    failed: "FALHOU",
  }[status];
}

function statusClass(status: CouncilStatus): string {
  if (status === "complete") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (status === "partial" || status === "failed") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-200";
}

function prettyCode(value: string): string {
  return value.replaceAll("-", " ").replaceAll("_", " ").toLocaleUpperCase("pt-BR");
}

function AccessDenied({ error }: { error: unknown }) {
  const expired = error instanceof MarshalConsoleApiError && error.status === 401;
  return (
    <section className="mx-auto max-w-3xl space-y-4" data-testid="marshal-console-access-denied">
      <div className="flex items-center gap-3 border border-destructive/40 bg-destructive/5 p-5">
        <ShieldAlert className="h-6 w-6 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-bold">ACESSO RESTRITO</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {expired
              ? "Sua sessão expirou. Entre novamente para acessar o console."
              : "Este usuário não está autorizado a operar o console do Marechal."}
          </p>
        </div>
      </div>
      {!expired && (
        <p className="border border-border/50 bg-black/30 p-4 text-xs font-mono text-muted-foreground">
          A allowlist <span className="text-primary">MARSHAL_CONSOLE_OPERATOR_IDS</span> é configurada no servidor.
          Não envie IDs ou credenciais pelo chat.
        </p>
      )}
    </section>
  );
}

export default function MarshalConsolePage() {
  const [worldId, setWorldId] = useState<MarshalWorldId>("CIGKV");
  const [draft, setDraft] = useState<CouncilDraft>(INITIAL_DRAFT);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [council, setCouncil] = useState<CouncilResponse | null>(null);
  const [councilPath, setCouncilPath] = useState<string | null>(null);
  const [proposals, setProposals] = useState<MarshalProposal[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollPaused, setPollPaused] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);

  const overviewQuery = useQuery<MarshalOverview, Error>({
    queryKey: ["marshal-console-overview", worldId],
    queryFn: () => fetchMarshalOverview(worldId),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!councilPath) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let attempts = 0;
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const latest = await fetchMarshalCouncil(councilPath, controller.signal);
        if (stopped) return;
        setCouncil(latest);
        if (TERMINAL_STATUSES.has(latest.status)) {
          setIsPolling(false);
          setPollPaused(false);
          setRequestKey(null);
          return;
        }
        attempts += 1;
        if (attempts >= 120) {
          setIsPolling(false);
          setPollPaused(true);
          return;
        }
        timer = window.setTimeout(poll, 1000);
      } catch (error) {
        if (controller.signal.aborted || stopped) return;
        setPollError(errorMessage(error));
        setIsPolling(false);
      }
    };

    timer = window.setTimeout(poll, 300);
    return () => {
      stopped = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [councilPath, pollAttempt]);

  useEffect(() => {
    if (council?.status !== "complete" || !council.proposalIds?.length) {
      setProposals([]);
      setProposalLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setProposalLoading(true);
    setProposalError(null);
    Promise.all(council.proposalIds.map((id) => fetchMarshalProposal(id, controller.signal)))
      .then((items) => {
        if (!cancelled) setProposals(items);
      })
      .catch((error) => {
        if (!cancelled && !controller.signal.aborted) setProposalError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setProposalLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [council?.requestId, council?.status]);

  const updateDraft = <K extends keyof CouncilDraft>(key: K, value: CouncilDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setRequestKey(null);
  };

  const submitCouncil = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setPollError(null);
    setProposalError(null);
    setCouncil(null);
    setCouncilPath(null);
    setProposals([]);
    setPollPaused(false);

    const key = requestKey ?? newIdempotencyKey();
    setRequestKey(key);
    setIsSubmitting(true);
    try {
      const input = buildCouncilInput(worldId, draft);
      const response = await createMarshalCouncil(input, key);
      setCouncil(response.council);
      setCouncilPath(response.resourcePath);
      setIsPolling(true);
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (overviewQuery.error instanceof MarshalConsoleApiError && [401, 403].includes(overviewQuery.error.status)) {
    return <AccessDenied error={overviewQuery.error} />;
  }

  const disabled = isSubmitting || isPolling;
  const overview = overviewQuery.data;
  const occupancy = overview?.occupancy.current == null
    ? "Sem telemetria"
    : `${overview.occupancy.current} / ${overview.occupancy.capacity}`;
  const observedAt = overview?.observedAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(overview.observedAt))
    : "—";

  return (
    <div className="space-y-6 pb-8" data-testid="marshal-console-page">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-mono tracking-[0.25em] text-primary">
              OPERAÇÕES · ACESSO RESTRITO
            </span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground">QG-MARECHAL / V1</span>
          </div>
          <h1 className="text-3xl font-black text-foreground md:text-4xl">CONSOLE DO MARECHAL</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Visão operacional consultiva e deliberação por mundo. Nenhuma recomendação executa comandos de jogo.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs font-mono text-emerald-300 md:self-auto">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          SESSÃO OPERADOR
        </div>
      </header>

      <div role="note" className="flex gap-3 border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
        <div>
          <p className="font-display font-bold tracking-wider text-amber-200">DADOS E LIMITES DO CONSOLE</p>
          <p className="mt-1 text-muted-foreground">
            Ocupação e fila vêm do runtime desta instância; incidentes, mercado e diplomacia ainda não têm fontes autoritativas.
            Os adapters são determinísticos e locais — sem LLM ou serviço externo. Propostas exigem revisão humana; não há aprovação nem execução nesta tela.
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-cyan-500/20 bg-card/70">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-cyan-300" aria-hidden="true" />
                VISÃO DO MUNDO
              </CardTitle>
              <CardDescription className="mt-2">Catálogo e última leitura disponível para o operador.</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void overviewQuery.refetch()}
              disabled={overviewQuery.isFetching}
              aria-label="Atualizar visão do mundo"
              className="shrink-0 border-cyan-500/30"
            >
              <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching ? "animate-spin" : ""}`} />
              ATUALIZAR
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="marshal-world" className="block text-xs font-mono tracking-widest text-muted-foreground">
              MUNDO
            </label>
            <select
              id="marshal-world"
              value={worldId}
              onChange={(event) => setWorldId(event.target.value as MarshalWorldId)}
              className="h-10 w-full border border-border/60 bg-black/40 px-3 text-sm font-mono text-foreground outline-none focus:border-primary"
              data-testid="marshal-world-select"
            >
              {MARSHAL_WORLDS.map((world) => (
                <option key={world.id} value={world.id}>{world.id} · {world.name}</option>
              ))}
            </select>

            {overviewQuery.isLoading && (
              <div role="status" className="space-y-3 py-4 text-sm font-mono text-muted-foreground">
                <span className="block h-4 animate-pulse bg-white/5" />
                <span className="block h-4 w-2/3 animate-pulse bg-white/5" />
                CARREGANDO CATÁLOGO...
              </div>
            )}
            {overviewQuery.error && (
              <div role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {errorMessage(overviewQuery.error)}
              </div>
            )}
            {overview && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border border-amber-500/30 bg-amber-500/5 p-3">
                  <span className="text-xs font-mono tracking-widest text-amber-200">SNAPSHOT DO RUNTIME · FONTES PARCIAIS</span>
                  <span className="border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono text-amber-200">
                    {overview.stale ? "DESATUALIZADO" : "ATUAL"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="MUNDO" value={`${overview.worldId} · ${overview.name}`} />
                  <Metric label="ESTADO OPERACIONAL" value={prettyCode(overview.operationalState)} />
                  <Metric label="OCUPAÇÃO / CAPACIDADE" value={`${occupancy}${overview.occupancy.percent == null ? "" : ` · ${overview.occupancy.percent}%`}`} />
                  <Metric label="FILA P95" value={overview.queueP95Seconds == null ? "Sem telemetria" : `${overview.queueP95Seconds}s`} />
                  <Metric label="INCIDENTES" value={overview.activeIncidents == null ? "Sem telemetria" : String(overview.activeIncidents)} />
                  <Metric label="REVISÃO" value={overview.configRevision || "—"} />
                </div>
                <p className="text-[11px] font-mono text-muted-foreground">
                  <Clock3 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  OBSERVADO: {observedAt}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">SOLICITAR PARECER</CardTitle>
            <CardDescription>
              Informe o assunto e o período; o servidor anexa a telemetria atual do runtime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitCouncil} className="space-y-4">
              <fieldset disabled={disabled} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <div className="space-y-2">
                    <label htmlFor="marshal-subject" className="text-xs font-mono tracking-widest text-muted-foreground">
                      ASSUNTO DO CONSELHO
                    </label>
                    <Input
                      id="marshal-subject"
                      value={draft.subject}
                      onChange={(event) => updateDraft("subject", event.target.value)}
                      placeholder="Ex.: revisar janela de entrada"
                      minLength={2}
                      maxLength={120}
                      required
                      data-testid="marshal-subject"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="marshal-period" className="text-xs font-mono tracking-widest text-muted-foreground">
                      PERÍODO (SEGUNDOS)
                    </label>
                    <Input
                      id="marshal-period"
                      type="number"
                      min={60}
                      max={2_592_000}
                      step={1}
                      value={draft.periodSeconds}
                      onChange={(event) => updateDraft("periodSeconds", event.target.value)}
                    />
                  </div>
                </div>

                <div role="note" className="border border-border/40 bg-black/25 p-3 text-xs text-muted-foreground">
                  A deliberação anexará o snapshot calculado pelo servidor. Métricas não são editáveis pelo operador;
                  dados de incidentes, economia e diplomacia permanecem indisponíveis até existir integração autoritativa.
                </div>
              </fieldset>

              {submitError && (
                <div role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {submitError}
                  {requestKey && <span className="mt-1 block text-xs">Se reenviar sem alterar o formulário, a mesma chave idempotente será reutilizada.</span>}
                </div>
              )}
              <Button type="submit" disabled={disabled || overviewQuery.isLoading || !!overviewQuery.error} className="w-full font-display tracking-widest">
                {isSubmitting ? "ENVIANDO..." : isPolling ? "AGUARDANDO CONSELHO..." : "SOLICITAR CONSELHO"}
              </Button>
              <p className="text-[11px] font-mono text-muted-foreground">
                Limite: 10 solicitações por minuto. A mesma chave idempotente é preservada em uma repetição de rede.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      {council && (
        <Card className="border-purple-500/20 bg-card/70" data-testid="marshal-council-result">
          <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">RESULTADO DO CONSELHO</CardTitle>
              <CardDescription className="mt-2">
                {council.scope?.worldId ?? worldId} · {council.requestId}
              </CardDescription>
            </div>
            <span className={`inline-flex w-fit border px-2.5 py-1 text-[10px] font-mono tracking-widest ${statusClass(council.status)}`}>
              {statusLabel(council.status)}
            </span>
          </CardHeader>
          <CardContent className="space-y-5">
            {(council.status === "queued" || council.status === "running") && (
              <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-cyan-200">
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                A API está processando o parecer. Esta tela consulta o resultado sem executar ações.
              </div>
            )}
            {council.status === "partial" && (
              <div role="alert" className="border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100">
                Resultado parcial; revisão humana obrigatória. Agentes com falha: {council.failedAgents?.join(", ") || "não informados"}.
              </div>
            )}
            {council.status === "failed" && (
              <div role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                O conselho não concluiu. Códigos: {council.reasonCodes?.join(", ") || "COUNCIL_UNAVAILABLE"}.
              </div>
            )}
            {pollError && (
              <div role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Não foi possível consultar o resultado: {pollError}
              </div>
            )}
            {pollPaused && (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-sm text-amber-100">A consulta foi pausada após 120 tentativas; o conselho ainda pode estar em andamento.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  setPollError(null);
                  setPollPaused(false);
                  setIsPolling(true);
                  setPollAttempt((current) => current + 1);
                }}>
                  CONTINUAR CONSULTA
                </Button>
              </div>
            )}
            {council.agents && council.agents.length > 0 && (
              <div className="grid gap-3 md:grid-cols-3">
                {council.agents.map((agent) => (
                  <article key={agent.agentId} className="border border-border/50 bg-black/25 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">{agent.name}</h3>
                        <p className="mt-1 text-[10px] font-mono tracking-widest text-muted-foreground">{prettyCode(agent.domain)}</p>
                      </div>
                      <span className="border border-primary/30 px-2 py-0.5 text-[10px] font-mono text-primary">
                        {Math.round(agent.confidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-mono text-accent">{prettyCode(agent.position)}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{agent.rationale}</p>
                  </article>
                ))}
              </div>
            )}
            {council.governance && council.governance.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-mono tracking-[0.2em] text-primary">GOVERNANÇA / PROPOSTAS</h3>
                {council.governance.map((item, index) => (
                  <div key={`${item.reasonCode ?? item.status}-${index}`} className="flex flex-col gap-2 border border-border/50 bg-black/25 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{item.subject ?? "Parecer operacional"}</p>
                      <p className="mt-1 text-xs font-mono text-muted-foreground">
                        {prettyCode(item.status)}{item.preferredAgent ? ` · ${item.preferredAgent}` : ""}
                        {item.reasonCode ? ` · ${prettyCode(item.reasonCode)}` : ""}
                      </p>
                    </div>
                    <span className={`w-fit border px-2 py-1 text-[10px] font-mono ${item.executable ? "border-destructive/40 text-destructive" : "border-amber-500/40 text-amber-200"}`}>
                      {item.executable ? "EXECUTÁVEL" : "NÃO EXECUTÁVEL"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {council.proposalIds && council.proposalIds.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-mono tracking-[0.2em] text-primary">DETALHES DAS PROPOSTAS</h3>
                {proposalLoading && <p role="status" className="text-xs font-mono text-muted-foreground">CARREGANDO DETALHES...</p>}
                {proposalError && <p role="alert" className="text-sm text-destructive">{proposalError}</p>}
                {proposals.map((proposal) => (
                  <article key={proposal.proposalId} className="border border-amber-500/25 bg-amber-500/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{proposal.subject}</p>
                      <span className="border border-amber-500/40 px-2 py-0.5 text-[10px] font-mono text-amber-200">
                        {proposal.executable ? "EXECUTÁVEL" : "APENAS PARA REVISÃO"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-mono text-muted-foreground">
                      {proposal.proposalId} · {prettyCode(proposal.governance.status)}
                      {proposal.governance.preferredAgent ? ` · ${proposal.governance.preferredAgent}` : ""}
                    </p>
                  </article>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/40 pt-4 text-[11px] font-mono text-muted-foreground">
              <span>RODADAS: {council.roundsCompleted ?? "—"}</span>
              <span>REVISÃO DOS DADOS: {council.dataRevision ?? "—"}</span>
              {council.correlationId && <span>CORRELAÇÃO: {council.correlationId}</span>}
              <span className="text-amber-200">SEM APROVAÇÃO OU EXECUÇÃO NESTE CONSOLE</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-border/40 bg-black/25 p-3">
      <p className="text-[10px] font-mono tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
