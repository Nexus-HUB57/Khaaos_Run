// Khaaos Run — trilha de auditoria append-only.
//
// `AuditLog` mantém um ring buffer em memória (ids monotônicos) e, opcionalmente,
// delega persistência a um store (ex.: `PostgresAuditStore`). Toda decisão de
// autorização relevante do runtime gera um evento: allow E deny.
export class AuditLog {
  constructor({ capacity = 5000, store = null } = {}) {
    this.capacity = capacity;
    this.store = store;
    this.events = [];
    this.nextId = 1;
  }

  // Registra um evento; nunca lança (auditoria não pode derrubar o runtime).
  record({ actor, action, resource = null, outcome = 'allow', detail = null }) {
    const event = {
      id: this.nextId++,
      at: Date.now(),
      actor: actor == null ? null : String(actor),
      action: String(action),
      resource: resource == null ? null : String(resource),
      outcome: outcome === 'deny' ? 'deny' : 'allow',
      detail,
    };
    this.events.push(event);
    if (this.events.length > this.capacity) this.events.splice(0, this.events.length - this.capacity);
    if (this.store?.recordEvent) {
      Promise.resolve(this.store.recordEvent(event)).catch(() => {});
    }
    return event;
  }

  // Consulta dos mais recentes para os mais antigos com filtros opcionais.
  query({ sinceId = 0, limit = 100, actor = null, action = null, outcome = null } = {}) {
    const matches = this.events.filter((event) =>
      event.id > sinceId
      && (actor === null || event.actor === actor)
      && (action === null || event.action === action)
      && (outcome === null || event.outcome === outcome));
    return matches.slice(-Math.max(1, Math.min(limit, 1000))).reverse();
  }

  async ready() {
    if (this.store?.ready) await this.store.ready();
    return true;
  }

  async close() {
    if (this.store?.close) await this.store.close();
  }
}
