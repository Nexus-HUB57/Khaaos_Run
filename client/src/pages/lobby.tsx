/**
 * KHAAOS RUN — Lobby UI
 * Ready checks, host controls, invite codes, countdown.
 */

import { useState } from "react";
import { useSharedBattleRoom } from "@/hooks/battle-room-context";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CyberCard } from "@/components/cyber-card";
import {
  Users, Crown, Check, X, Play, Square, LogOut, Copy, KeyRound, Plus, Radio,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function LobbyPage() {
  const { user } = useAuth();
  const localId = (user as any)?.id;
  const {
    connected,
    room,
    players,
    countdown,
    lastError,
    setReady,
    startMatch,
    createLobby,
    joinByCode,
    kickPlayer,
    cancelCountdown,
    leave,
  } = useSharedBattleRoom();

  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState(false);

  const me = players.find((p) => p.userId === localId);
  const isHost = me?.isHost || room?.hostId === localId;
  const inLobby =
    room && (room.status === "LOBBY" || room.status === "COUNTDOWN");
  const readyCount = room?.readyCount ?? players.filter((p) => p.isReady).length;
  const allReady =
    players.length >= (room?.minPlayersToStart ?? 2) &&
    readyCount === players.length;

  const copyCode = async () => {
    if (!room?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(room.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-widest flex items-center gap-2">
            <Users className="w-6 h-6 text-cyan-400" />
            LOBBY TÁTICO
          </h1>
          <p className="text-xs font-mono text-muted-foreground tracking-widest mt-1">
            READY CHECK · HOST · CÓDIGO DE CONVITE
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              connected ? "bg-cyan-400 animate-pulse" : "bg-red-500",
            )}
          />
          <span className="text-xs font-mono text-muted-foreground">
            {connected ? "MESH ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {lastError && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300 font-mono">
          {lastError}
        </div>
      )}

      {/* Not in a lobby — create / join */}
      {!inLobby && (
        <div className="grid gap-4 md:grid-cols-2">
          <CyberCard className="border-cyan-500/30">
            <h2 className="font-display tracking-widest text-cyan-300 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" /> CRIAR LOBBY
            </h2>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => createLobby({ private: false, maxPlayers: 16 })}
                className="font-display tracking-wider bg-cyan-600 hover:bg-cyan-500"
              >
                LOBBY PÚBLICO
              </Button>
              <Button
                onClick={() => createLobby({ private: true, maxPlayers: 16 })}
                variant="outline"
                className="font-display tracking-wider border-amber-500/40 text-amber-300"
              >
                LOBBY PRIVADO (CÓDIGO)
              </Button>
            </div>
          </CyberCard>

          <CyberCard className="border-purple-500/30">
            <h2 className="font-display tracking-widest text-purple-300 mb-3 flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> ENTRAR COM CÓDIGO
            </h2>
            <div className="flex gap-2">
              <Input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="font-mono tracking-widest uppercase"
                maxLength={8}
              />
              <Button
                onClick={() => codeInput && joinByCode(codeInput)}
                disabled={!codeInput}
                className="font-display tracking-wider"
              >
                ENTRAR
              </Button>
            </div>
          </CyberCard>
        </div>
      )}

      {/* Active lobby */}
      {inLobby && room && (
        <>
          <CyberCard className="border-cyan-500/40 bg-gradient-to-r from-black/80 to-cyan-950/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    className={cn(
                      "font-mono text-xs",
                      room.status === "COUNTDOWN"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                        : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
                    )}
                  >
                    {room.status}
                  </Badge>
                  {room.isPrivate && (
                    <Badge className="font-mono text-xs bg-purple-500/20 text-purple-300 border-purple-500/40">
                      PRIVADO
                    </Badge>
                  )}
                  <span className="text-xs font-mono text-muted-foreground">
                    {room.id.slice(-8).toUpperCase()}
                  </span>
                </div>
                <p className="text-sm font-mono text-muted-foreground">
                  {readyCount}/{players.length} PRONTOS · min {room.minPlayersToStart} · max{" "}
                  {room.maxPlayers}
                </p>
                {room.inviteCode && (
                  <button
                    onClick={copyCode}
                    className="mt-2 flex items-center gap-2 text-amber-300 font-mono text-sm hover:text-amber-200"
                  >
                    <Copy className="w-3 h-3" />
                    CÓDIGO: {room.inviteCode}
                    {copied && <span className="text-emerald-400 text-xs">COPIADO</span>}
                  </button>
                )}
              </div>

              {room.status === "COUNTDOWN" && countdown != null && (
                <div className="text-4xl font-mono font-bold text-amber-400 tabular-nums">
                  {countdown}s
                </div>
              )}
            </div>
          </CyberCard>

          {/* Player list */}
          <CyberCard>
            <h2 className="font-display tracking-widest text-xs text-muted-foreground mb-3 flex items-center gap-2">
              <Radio className="w-3 h-3" /> OPERATIVOS NA SALA
            </h2>
            <div className="space-y-2">
              {players.map((p) => (
                <div
                  key={p.userId}
                  className={cn(
                    "flex items-center justify-between rounded border px-3 py-2",
                    p.userId === localId
                      ? "border-cyan-500/40 bg-cyan-500/5"
                      : "border-white/10 bg-black/30",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {p.isHost && <Crown className="w-4 h-4 text-amber-400 shrink-0" />}
                    <span className="font-mono text-sm truncate">
                      {p.displayName}
                      {p.userId === localId && (
                        <span className="text-cyan-400 ml-1">(você)</span>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      ELO {p.rating ?? 1000}
                    </span>
                    {!p.isConnected && (
                      <span className="text-[10px] text-red-400">OFFLINE</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.isReady ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px]">
                        <Check className="w-3 h-3 mr-1" /> READY
                      </Badge>
                    ) : (
                      <Badge className="bg-muted/20 text-muted-foreground border-muted/30 text-[10px]">
                        <X className="w-3 h-3 mr-1" /> WAIT
                      </Badge>
                    )}
                    {isHost && p.userId !== localId && room.status === "LOBBY" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] text-red-400 hover:text-red-300"
                        onClick={() => kickPlayer(p.userId)}
                      >
                        KICK
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CyberCard>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {room.status === "LOBBY" && (
              <>
                <Button
                  onClick={() => setReady(!me?.isReady)}
                  className={cn(
                    "font-display tracking-wider",
                    me?.isReady
                      ? "bg-emerald-600/30 border border-emerald-500/50 text-emerald-300"
                      : "bg-cyan-600 hover:bg-cyan-500",
                  )}
                  variant={me?.isReady ? "outline" : "default"}
                >
                  {me?.isReady ? (
                    <>
                      <X className="w-4 h-4 mr-1" /> CANCELAR READY
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-1" /> PRONTO
                    </>
                  )}
                </Button>

                {isHost && (
                  <Button
                    onClick={startMatch}
                    disabled={players.length < 1}
                    className="font-display tracking-wider bg-amber-600 hover:bg-amber-500"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    {allReady ? "INICIAR (TODOS PRONTOS)" : "FORÇAR INÍCIO"}
                  </Button>
                )}
              </>
            )}

            {room.status === "COUNTDOWN" && isHost && (
              <Button
                onClick={cancelCountdown}
                variant="outline"
                className="font-display tracking-wider border-red-500/40 text-red-400"
              >
                <Square className="w-4 h-4 mr-1" /> CANCELAR COUNTDOWN
              </Button>
            )}

            <Button
              onClick={leave}
              variant="outline"
              className="font-display tracking-wider border-white/20"
            >
              <LogOut className="w-4 h-4 mr-1" /> SAIR DO LOBBY
            </Button>

            <Link href="/zona">
              <Button variant="ghost" className="font-display tracking-wider text-cyan-300">
                IR PARA ZONA
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
