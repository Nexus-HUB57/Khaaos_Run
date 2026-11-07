import { Link } from "wouter";
import { ArrowLeft, FileClock, ShieldAlert } from "lucide-react";

export default function TermsStatusPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_35%,rgba(100,20,160,0.2),transparent_55%),radial-gradient(ellipse_at_80%_65%,rgba(180,60,5,0.15),transparent_50%),radial-gradient(circle_at_50%_100%,rgba(60,10,100,0.35),rgba(8,5,15,1)_70%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(200,80,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(200,80,20,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-8">
        <Link
          href="/auth"
          className="inline-flex w-fit items-center gap-2 font-mono text-xs tracking-widest text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> VOLTAR À CONTA
        </Link>

        <article className="my-auto py-12">
          <div className="mb-6 inline-flex items-center gap-2 border border-amber-400/40 bg-amber-400/5 px-4 py-2 font-mono text-xs tracking-[0.2em] text-amber-200">
            <FileClock aria-hidden="true" className="h-4 w-4" /> DOCUMENTO EM REVISÃO
          </div>
          <h1 className="font-display text-4xl font-black tracking-tight text-foreground md:text-6xl">
            Termos de Uso
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            Os Termos de Uso do War&apos;I estão em revisão técnica e jurídica. A identificação completa da operadora e os canais oficiais de contato serão apresentados junto da versão final, após a conclusão desses dados.
          </p>

          <section
            aria-labelledby="terms-status-not-contract"
            className="mt-8 border border-amber-400/35 bg-amber-400/5 p-5 md:p-7"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-amber-200" />
              <div>
                <h2 id="terms-status-not-contract" className="font-display text-xl font-bold">
                  Este aviso não é um contrato nem um aceite
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Esta página não apresenta uma versão final dos Termos, não coleta aceite ou consentimento e não efetiva cadastro de alistamento, pagamento ou inscrição em campanha. A visita ou leitura deste aviso não registra concordância com condições contratuais.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-8 space-y-4 border border-white/10 bg-black/30 p-5 md:p-7">
            <h2 className="font-display text-xl font-bold">O que ainda está sendo definido</h2>
            <ul className="list-disc space-y-3 pl-5 leading-relaxed text-muted-foreground marker:text-primary">
              <li>Identificação jurídica da operadora, endereço e canais de atendimento e privacidade.</li>
              <li>Política de Privacidade, prazos de retenção, atendimento aos direitos dos titulares e regras de elegibilidade.</li>
              <li>Condições de alistamento, cobrança, cancelamento e reembolso, que dependem de aprovação e não são habilitadas por este aviso.</li>
              <li>Uma possível recompensa futura mencionada nos materiais do projeto não constitui oferta atual, promessa ou garantia; eventual campanha exigiria regras oficiais e aprovações próprias antes de ser anunciada ou iniciada.</li>
            </ul>
          </section>

          <p className="mt-7 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Para consultar a conta, cadastro e login, retorne ao portal do jogador. O cadastro de uma conta é separado do alistamento e não confirma pagamento.
          </p>
          <Link
            href="/auth"
            className="mt-5 inline-flex min-h-11 items-center justify-center border border-primary/50 px-5 font-mono text-xs tracking-widest text-primary transition-colors hover:bg-primary/10"
          >
            ABRIR PORTAL DO JOGADOR
          </Link>
        </article>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      </div>
    </main>
  );
}
