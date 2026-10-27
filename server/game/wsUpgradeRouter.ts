import type { Server } from "node:http";
import type { Duplex } from "node:stream";

/**
 * Roteador de upgrade WS — resolve a colisão entre múltiplos WebSocketServer
 * no MESMO httpServer (RoomManager /ws + SpectatorPipeline /ws/spectator).
 *
 * Com `{ server }`, cada instância do ws registra um listener "upgrade" que
 * responde 400 (abortHandshake) a qualquer path que não seja o seu — o
 * listener registrado por último destronava o handshake do primeiro (o
 * verifyClient do RoomManager é async e perde a corrida contra o 400
 * síncrono do espectador). Com `noServer: true` + este roteador, cada pedido
 * é entregue a EXATAMENTE um servidor; paths desconhecidos são destruídos
 * sem resposta (equivalente ao 400 anterior, sem corrupção de socket).
 */

type UpgradeHandler = (req: import("node:http").IncomingMessage, socket: Duplex, head: Buffer) => void;

interface UpgradeRoute {
  /** Path canônico (sem query). Casamento EXATO — mesma semântica do `path` do ws. */
  path: string;
  handler: UpgradeHandler;
}

const installedServers = new WeakSet<Server>();
const routesByServer = new WeakMap<Server, UpgradeRoute[]>();

function pathnameOf(url: string | undefined): string {
  const index = url?.indexOf("?") ?? -1;
  return index === -1 ? (url ?? "") : (url ?? "").slice(0, index);
}

/**
 * Registra um WebSocketServer (noServer) sob um path exato. Idempotente por
 * servidor: rotas repetidas para o MESMO path substituem a anterior.
 */
export function routeWebSocketUpgrade(
  httpServer: Server,
  path: string,
  handler: UpgradeHandler,
): void {
  let routes = routesByServer.get(httpServer);
  if (!routes) {
    routes = [];
    routesByServer.set(httpServer, routes);
  }
  const existing = routes.findIndex((route) => route.path === path);
  if (existing >= 0) routes[existing] = { path, handler };
  else routes.push({ path, handler });

  if (installedServers.has(httpServer)) return;
  installedServers.add(httpServer);
  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = pathnameOf(req.url);
    const route = routes!.find((candidate) => candidate.path === pathname);
    if (!route) {
      socket.destroy();
      return;
    }
    route.handler(req, socket, head);
  });
}

/** Somente testes: limpa as rotas de um servidor. */
export function __resetUpgradeRoutesForTests(httpServer: Server): void {
  routesByServer.delete(httpServer);
  installedServers.delete(httpServer);
}
