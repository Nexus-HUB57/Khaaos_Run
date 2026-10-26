import type { AgentId } from "./orchestration";
import type { WorldTelemetrySnapshot } from "./worldTelemetry";

export interface NarrativeContribution {
  agentId: AgentId;
  role: "lead" | "review" | "draft";
  line: string;
}

export interface SpecialClassNarrativeEvent {
  eventId: string;
  worldId: WorldTelemetrySnapshot["worldId"];
  title: string;
  theme: string;
  trigger: string;
  observedSignals: Array<{ key: "queueCount" | "queueP95Seconds" | "occupancy.percent" | "networkLatencyP95Ms" | "networkLatencySampleCount"; value: number }>;
  contributions: NarrativeContribution[];
  status: "proposal";
  needsHumanReview: true;
  executable: false;
}

/**
 * Narrative rules: only use the server-owned telemetry values listed in observedSignals.
 * Character dialogue is explicitly fictional; it cannot report an unmeasured market,
 * incident, treaty, player identity, reward, or action. These drafts never publish or mutate.
 */
export function buildSpecialClassNarrativeEvents(snapshot: WorldTelemetrySnapshot): SpecialClassNarrativeEvent[] {
  const events: SpecialClassNarrativeEvent[] = [];
  const hasReliableLatency = snapshot.networkLatencyTelemetryAvailable &&
    snapshot.networkLatencySampleCount >= 5 && snapshot.networkLatencyP95Ms !== null;
  if (snapshot.queueCount >= 3) {
    events.push({
      eventId: `KR-QUEUE-${snapshot.worldId}-${snapshot.observedAt}`,
      worldId: snapshot.worldId,
      title: "As Docas em Silêncio",
      theme: "Pressão de acesso e confiança entre os três setores da Classe Especial.",
      trigger: "Fila observada pelo servidor com pelo menos três participantes; isso não comprova incidente nem escassez de mercado.",
      observedSignals: [{ key: "queueCount", value: snapshot.queueCount }],
      contributions: [
        { agentId: "marshal-henricks", role: "review", line: "Henricks pede que a fila seja tratada como sinal de demanda, não como autorização para alterar o ring." },
        { agentId: "king-krapulla", role: "lead", line: "King propõe investigar, dentro da ficção, quem controla a passagem — sem alegar dados de oferta ou preço." },
        { agentId: "ambassador-uryan", role: "draft", line: "Uryan prepara um comunicado de trégua para evitar que a disputa por acesso vire conflito entre facções." },
      ],
      status: "proposal",
      needsHumanReview: true,
      executable: false,
    });
  }
  if (snapshot.queueP95Seconds !== null && snapshot.queueP95Seconds >= 60) {
    events.push({
      eventId: `KR-WAIT-${snapshot.worldId}-${snapshot.observedAt}`,
      worldId: snapshot.worldId,
      title: "O Farol da Espera",
      theme: "Uma negociação narrativa é aberta quando a espera observada se prolonga.",
      trigger: "P95 de espera do matchmaking igual ou superior a 60 segundos, calculado pelo servidor.",
      observedSignals: [{ key: "queueP95Seconds", value: snapshot.queueP95Seconds }],
      contributions: [
        { agentId: "marshal-henricks", role: "lead", line: "Henricks registra o tempo observado e mantém todas as mudanças operacionais em hold." },
        { agentId: "king-krapulla", role: "review", line: "King recusa especular sobre preços ou inventário sem uma fonte econômica conectada." },
        { agentId: "ambassador-uryan", role: "draft", line: "Uryan redige uma convocação ficcional para que as facções negociem uma janela de passagem." },
      ],
      status: "proposal",
      needsHumanReview: true,
      executable: false,
    });
  }
  if (snapshot.occupancy.percent !== null && snapshot.occupancy.percent >= 80) {
    events.push({
      eventId: `KR-RING-${snapshot.worldId}-${snapshot.observedAt}`,
      worldId: snapshot.worldId,
      title: "A Mesa do Anel",
      theme: "Coordenação entre operações, comércio e diplomacia sob ocupação elevada.",
      trigger: "Ocupação calculada a partir de salas ativas igual ou superior a 80% da capacidade observada.",
      observedSignals: [{ key: "occupancy.percent", value: snapshot.occupancy.percent }],
      contributions: [
        { agentId: "marshal-henricks", role: "lead", line: "Henricks solicita revisão humana de capacidade; nenhum operador ou equipe é identificado." },
        { agentId: "king-krapulla", role: "review", line: "King não infere preços, escassez ou transações a partir da ocupação." },
        { agentId: "ambassador-uryan", role: "draft", line: "Uryan prepara uma proposta de diálogo entre facções, sem anunciar tratado ou recompensa." },
      ],
      status: "proposal",
      needsHumanReview: true,
      executable: false,
    });
  }
  if (hasReliableLatency && snapshot.networkLatencyP95Ms! >= 250 && snapshot.networkLatencyP95Ms! < 500) {
    events.push({
      eventId: `KR-LATENCY-WARN-${snapshot.worldId}-${snapshot.observedAt}`,
      worldId: snapshot.worldId,
      title: "O Corredor de Ecos",
      theme: "Os sinais chegam com atraso; os três agentes coordenam uma resposta narrativa cautelosa.",
      trigger: "RTT p95 observado entre 250 ms e 499,9 ms com pelo menos cinco respostas pong recentes do servidor.",
      observedSignals: [
        { key: "networkLatencyP95Ms", value: snapshot.networkLatencyP95Ms! },
        { key: "networkLatencySampleCount", value: snapshot.networkLatencySampleCount },
      ],
      contributions: [
        { agentId: "marshal-henricks", role: "lead", line: "Henricks recomenda cautela narrativa e mantém ordens operacionais em hold enquanto a latência é observada." },
        { agentId: "king-krapulla", role: "review", line: "King não atribui o atraso a mercado, sabotagem ou facção sem evidência independente." },
        { agentId: "ambassador-uryan", role: "draft", line: "Uryan redige uma mensagem ficcional pedindo que as partes aguardem confirmação antes de responder." },
      ],
      status: "proposal",
      needsHumanReview: true,
      executable: false,
    });
  }
  if (hasReliableLatency && snapshot.networkLatencyP95Ms! >= 500) {
    events.push({
      eventId: `KR-LATENCY-CRITICAL-${snapshot.worldId}-${snapshot.observedAt}`,
      worldId: snapshot.worldId,
      title: "A Tempestade de Ecos",
      theme: "A comunicação está severamente atrasada; a Classe Especial propõe pausa narrativa e verificação humana.",
      trigger: "RTT p95 observado igual ou superior a 500 ms com pelo menos cinco respostas pong recentes do servidor.",
      observedSignals: [
        { key: "networkLatencyP95Ms", value: snapshot.networkLatencyP95Ms! },
        { key: "networkLatencySampleCount", value: snapshot.networkLatencySampleCount },
      ],
      contributions: [
        { agentId: "marshal-henricks", role: "lead", line: "Henricks encaminha o sinal de latência elevada para revisão humana; o draft não pausa nem altera partidas." },
        { agentId: "king-krapulla", role: "review", line: "King rejeita teorias de bloqueio comercial: RTT sozinho não revela causa nem responsável." },
        { agentId: "ambassador-uryan", role: "draft", line: "Uryan prepara uma convocação ficcional para confirmar a recepção das mensagens antes de qualquer diálogo." },
      ],
      status: "proposal",
      needsHumanReview: true,
      executable: false,
    });
  }
  return events;
}
