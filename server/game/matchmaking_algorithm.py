"""
KHAAOS RUN — Skill-Based Matchmaking Algorithm (Python)
=======================================================
Fila por ELO + janela de rating que cresce com o tempo.
Greedy oldest-first + soft-fill após maxWait.

Uso:
    mm = MatchmakingAlgorithm(on_match=lambda players: print(players))
    mm.enqueue(user_id="a", rating=1000, mode="solo")
    mm.tick()   # ou mm.start()
"""

from __future__ import annotations

import time
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional

QueueMode = Literal["solo", "duo", "squad"]


@dataclass
class QueueEntry:
    user_id: str
    rating: float
    mode: QueueMode
    enqueued_at: float
    current_delta: float
    display_name: str = ""
    meta: Any = None

    def __post_init__(self) -> None:
        if not self.display_name:
            self.display_name = self.user_id


@dataclass
class MatchmakingConfig:
    min_players: int = 2
    max_players: int = 50
    initial_delta: float = 100.0
    delta_growth_per_second: float = 15.0
    max_delta: float = 600.0
    max_wait_ms: float = 45_000.0
    soft_min_players: int = 2
    tick_interval_s: float = 2.0


class MatchmakingAlgorithm:
    """Matcher skill-based com janela de ELO expansível."""

    def __init__(
        self,
        config: Optional[MatchmakingConfig] = None,
        on_match: Optional[Callable[[list[QueueEntry]], None]] = None,
        on_update: Optional[Callable[[str, dict], None]] = None,
    ) -> None:
        self.config = config or MatchmakingConfig()
        self.on_match = on_match or (lambda _players: None)
        self.on_update = on_update or (lambda _uid, _ev: None)
        self._queue: dict[str, QueueEntry] = {}
        self._timer: Optional[threading.Timer] = None
        self._running = False

    # ── Public API ──────────────────────────────────────────────────────────

    def enqueue(
        self,
        user_id: str,
        rating: float = 1000.0,
        mode: QueueMode = "solo",
        display_name: str = "",
        meta: Any = None,
    ) -> QueueEntry:
        entry = QueueEntry(
            user_id=user_id,
            rating=rating,
            mode=mode,
            enqueued_at=time.time(),
            current_delta=self.config.initial_delta,
            display_name=display_name or user_id,
            meta=meta,
        )
        self._queue[user_id] = entry
        self.on_update(
            user_id,
            {
                "type": "queue_joined",
                "position": self.position_of(user_id),
                "rating": entry.rating,
                "mode": entry.mode,
            },
        )
        return entry

    def dequeue(self, user_id: str) -> bool:
        if user_id not in self._queue:
            return False
        del self._queue[user_id]
        self.on_update(user_id, {"type": "queue_left"})
        return True

    def is_queued(self, user_id: str) -> bool:
        return user_id in self._queue

    @property
    def size(self) -> int:
        return len(self._queue)

    def start(self) -> None:
        """Inicia ticks periódicos em background thread."""
        if self._running:
            return
        self._running = True
        self._schedule_tick()

    def stop(self) -> None:
        self._running = False
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None

    def _schedule_tick(self) -> None:
        if not self._running:
            return
        self._timer = threading.Timer(self.config.tick_interval_s, self._tick_loop)
        self._timer.daemon = True
        self._timer.start()

    def _tick_loop(self) -> None:
        try:
            self.tick()
        finally:
            self._schedule_tick()

    # ── Core algorithm ──────────────────────────────────────────────────────

    def tick(self) -> list[list[QueueEntry]]:
        """
        Um passo do matcher.
        Retorna a lista de matches formados neste tick.
        """
        if not self._queue:
            return []

        now = time.time()
        self._grow_windows(now)
        self._broadcast_updates()

        formed: list[list[QueueEntry]] = []
        remaining = sorted(self._queue.values(), key=lambda e: e.enqueued_at)

        while remaining:
            seed = remaining[0]
            wait_ms = (now - seed.enqueued_at) * 1000.0
            soft = wait_ms >= self.config.max_wait_ms
            need = (
                self.config.soft_min_players if soft else self.config.min_players
            )

            # Candidatos: mesmo mode + janela mútua de rating
            candidates = [
                e
                for e in remaining
                if e.mode == seed.mode
                and abs(e.rating - seed.rating)
                <= max(seed.current_delta, e.current_delta)
            ]

            if len(candidates) < need:
                remaining = [e for e in remaining if e.user_id != seed.user_id]
                continue

            # Preferir ELO mais próximo da semente
            candidates.sort(key=lambda e: abs(e.rating - seed.rating))
            matched = candidates[: self.config.max_players]
            matched_ids = {m.user_id for m in matched}

            for m in matched:
                self._queue.pop(m.user_id, None)
            remaining = [e for e in remaining if e.user_id not in matched_ids]

            formed.append(matched)
            self._emit_match(matched)

        return formed

    # ── Internals ───────────────────────────────────────────────────────────

    def _grow_windows(self, now: float) -> None:
        cfg = self.config
        for entry in self._queue.values():
            wait_sec = now - entry.enqueued_at
            entry.current_delta = min(
                cfg.max_delta,
                cfg.initial_delta + wait_sec * cfg.delta_growth_per_second,
            )

    def _broadcast_updates(self) -> None:
        for entry in self._queue.values():
            self.on_update(
                entry.user_id,
                {
                    "type": "queue_update",
                    "position": self.position_of(entry.user_id),
                    "estimated_wait_sec": self._estimate_wait(entry),
                    "current_delta": round(entry.current_delta),
                    "players_in_queue": len(self._queue),
                },
            )

    def _estimate_wait(self, entry: QueueEntry) -> int:
        in_range = sum(
            1
            for o in self._queue.values()
            if o.user_id != entry.user_id
            and o.mode == entry.mode
            and abs(o.rating - entry.rating) <= entry.current_delta
        )
        if in_range + 1 >= self.config.min_players:
            return 5
        if in_range + 1 >= self.config.soft_min_players:
            return 15
        return max(10, 40 - in_range * 5)

    def position_of(self, user_id: str) -> int:
        ordered = sorted(self._queue.values(), key=lambda e: e.enqueued_at)
        for i, e in enumerate(ordered):
            if e.user_id == user_id:
                return i + 1
        return 0

    def _emit_match(self, matched: list[QueueEntry]) -> None:
        try:
            self.on_match(matched)
        except Exception as err:  # noqa: BLE001 — re-queue on consumer failure
            print(f"[Matchmaking] on_match failed, re-queuing: {err}")
            for m in matched:
                self._queue[m.user_id] = m


# ── Demo ────────────────────────────────────────────────────────────────────

def demo() -> None:
    print("=== Matchmaking Algorithm Demo (Python) ===\n")

    def on_match(players: list[QueueEntry]) -> None:
        avg = sum(p.rating for p in players) / len(players)
        names = ", ".join(f"{p.display_name}({p.rating:.0f})" for p in players)
        print(f"✓ MATCH ({len(players)}p, avg ELO {avg:.0f}): {names}")

    mm = MatchmakingAlgorithm(
        config=MatchmakingConfig(
            min_players=2,
            max_players=4,
            initial_delta=100,
            max_wait_ms=45_000,
        ),
        on_match=on_match,
    )

    mm.enqueue("1", rating=1000, display_name="Alpha")
    mm.enqueue("2", rating=1080, display_name="Bravo")
    mm.enqueue("3", rating=1500, display_name="Charlie")
    mm.enqueue("4", rating=1020, display_name="Delta")
    mm.enqueue("5", rating=1490, display_name="Echo")

    print(f"Fila: {mm.size} jogadores\n")
    print("--- Tick 1 (janela ainda apertada) ---")
    mm.tick()
    print(f"Restam na fila: {mm.size}")

    # Simula 60s de espera para quem sobrou
    for e in mm._queue.values():
        e.enqueued_at = time.time() - 60.0

    print("\n--- Tick 2 (após 60s simulados, janela larga) ---")
    mm.tick()
    print(f"Restam na fila: {mm.size}")


if __name__ == "__main__":
    demo()
