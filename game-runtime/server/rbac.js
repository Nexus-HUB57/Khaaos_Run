// Khaaos Run — RBAC com permissões por recurso.
//
// Catálogo declarativo de permissões e matriz por papel. `can()` é a única
// fonte de verdade de autorização no runtime:
//   - papel `admin` recebe tudo;
//   - permissões `room:*` são restritas ao recurso próprio (sala do cliente)
//     quando um `resource` é informado — um player não opera sala alheia.
export const PERMISSIONS = {
  'room:join': 'Entrar em sala / matchmaking',
  'room:start': 'Iniciar a partida da própria sala',
  'room:input': 'Enviar inputs de jogo para a própria sala',
  'admin:metrics': 'Ler métricas e estado operacional',
  'keys:rotate': 'Rotacionar/derrubar chaves de assinatura',
  'audit:read': 'Ler a trilha de auditoria',
  'obs:read': 'Ler traces e logs agregados da observabilidade',
  'economy:grant': 'Conceder créditos virtuais KRC (sem valor real)',
  'poj:command': 'Comandar o Protocolo de Ordem de Jogo (Marechal: convocar, encerrar, julgar)',
  'eos:operate': 'Ancorar/operar sessões EOS nativas do dedicated server (M4)',
};

export const ROLE_PERMISSIONS = {
  player: ['room:join', 'room:start', 'room:input'],
  moderator: ['room:join', 'room:start', 'room:input', 'admin:metrics', 'audit:read', 'obs:read'],
  // dedicated server service (papel dedicado à ponte EOS nativa — M4)
  service: ['room:join', 'eos:operate', 'admin:metrics'],
};

const ROOM_SCOPED = new Set(['room:join', 'room:start', 'room:input']);

// identity: payload do token ({ sub, username, role, ... }) ou null.
// resource: escopo opcional (ex.: id da sala) exigido para permissões room:*.
export function can(identity, permission, resource = null) {
  if (!identity?.role) return false;
  if (identity.role === 'admin') {
    // admin global: room:* ainda respeita escopo quando o recurso é conhecido
    // e a identidade carrega sala específica (defesa em profundidade).
    if (resource && ROOM_SCOPED.has(permission) && identity.roomId && identity.roomId !== resource) return false;
    return true;
  }
  const grants = ROLE_PERMISSIONS[identity.role] || [];
  if (!grants.includes(permission)) return false;
  if (resource && ROOM_SCOPED.has(permission) && identity.roomId && identity.roomId !== resource) return false;
  return true;
}

// Lista efetiva de permissões de uma identidade (para diagnóstico/painel).
export function permissionsFor(identity) {
  if (!identity?.role) return [];
  if (identity.role === 'admin') return ['*'];
  return [...(ROLE_PERMISSIONS[identity.role] || [])];
}
