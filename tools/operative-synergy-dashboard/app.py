"""FastAPI app for the Khaaos Run operative synergy dashboard."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from simulator import DEFAULT_LINEUP, OPERATIVES, simulate

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
PUBLIC_DIR = BASE_DIR / "public"

app = FastAPI(
    title="Khaaos Run — Operative Synergy Lab",
    description="Temporal overlap explorer for the canonical operative skill model.",
    version="1.0.0",
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/manus-routes.json", include_in_schema=False)
def routes_manifest() -> FileResponse:
    return FileResponse(PUBLIC_DIR / "manus-routes.json", media_type="application/json")


@app.get("/api/healthz", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/roster")
def roster() -> dict[str, object]:
    return {
        "count": len(OPERATIVES),
        "operatives": [
            {
                "id": op.operative_id,
                "name": op.name,
                "ability": op.ability,
                "effect": op.effect,
                "details": op.details,
                "cooldownSeconds": op.cooldown_s,
                "durationSeconds": op.duration_s,
                "interactionWindowSeconds": op.interaction_s,
            }
            for op in OPERATIVES
        ],
        "defaultLineup": list(DEFAULT_LINEUP),
    }


@app.get("/api/simulation")
def simulation(
    horizon: float = Query(default=180, gt=0, le=3600, description="Simulation horizon in seconds"),
    lineup: str = Query(default=",".join(DEFAULT_LINEUP), description="Two to four comma-separated canonical operative IDs"),
) -> dict[str, object]:
    lineup_ids = [token.strip() for token in lineup.split(",") if token.strip()]
    try:
        return simulate(horizon, lineup_ids)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
