#!/usr/bin/env python3
# Khaaos Run — adiciona painéis Two-Phase Commit (2PC) ao dashboard Grafana
# de economia (infra/grafana/khaaos-economy-dashboard.json).
#
# O Prometheus já faz scrape de /metrics do economy-api (job khaaos-economy-api,
# monitoring/prometheus.yml); este script acrescenta uma linha "Two-Phase Commit"
# com stats de throughput, escrows abertos, idade do escrow mais antigo, taxa por
# resultado e latência p95 por fase. Idempotente: se a row já existir, nada faz.

import json
import sys

DASHBOARD = "infra/grafana/khaaos-economy-dashboard.json"
ROW_TITLE = "Two-Phase Commit (2PC) — escrow → commit/abort"

def main() -> int:
    with open(DASHBOARD, encoding="utf-8") as f:
        dash = json.load(f)

    panels = dash.get("panels", [])
    if any(p.get("title") == ROW_TITLE for p in panels):
        print("Painéis 2PC já presentes — nada a fazer.")
        return 0

    next_id = max((p.get("id", 0) for p in panels), default=0) + 1
    max_y = max((p.get("gridPos", {}).get("y", 0) + p.get("gridPos", {}).get("h", 0) for p in panels), default=0)
    y = max_y

    def grid(w, h, yy=None, hpos=0):
        nonlocal next_id
        pos = {"h": h, "w": w, "x": hpos, "y": y if yy is None else yy}
        panel_id = next_id
        next_id += 1
        return panel_id, pos

    new_panels = []

    # ── Row ────────────────────────────────────────────────────────────────
    pid, pos = grid(24, 1)
    new_panels.append({
        "id": pid, "type": "row", "title": ROW_TITLE,
        "collapsed": False, "gridPos": pos, "panels": [],
        "datasource": None,
    })

    stat_defs = [
        ("2PC Prepares/s (5m)",
         'sum(rate(khaaos_economy_2pc_requests_total{phase="prepare",result="prepared"}[5m]))',
         "req/s", "green"),
        ("2PC Commits/s (5m)",
         'sum(rate(khaaos_economy_2pc_requests_total{phase="commit",result="committed"}[5m]))',
         "req/s", "blue"),
        ("2PC Aborts+GC/s (5m)",
         'sum(rate(khaaos_economy_2pc_requests_total{phase="abort",result="aborted"}[5m])) + sum(rate(khaaos_economy_2pc_gc_recovered_total[5m]))',
         "req/s", "orange"),
        ("Escrows PREPARED abertos",
         'sum(khaaos_economy_2pc_escrows{status="PREPARED"})',
         "escrows", "purple"),
        ("Escrow mais antigo (s)",
         'khaaos_economy_2pc_oldest_prepared_age_seconds',
         "s", "yellow"),
    ]
    for i, (title, expr, unit, color) in enumerate(stat_defs):
        pid, pos = grid(8 if i < 3 else 12, 4, y + 1, (i % 3) * 8)
        if i >= 3:
            pos = {"h": 4, "w": 12, "x": (i - 3) * 12, "y": y + 5}
        new_panels.append({
            "id": pid, "type": "stat", "title": title,
            "gridPos": pos, "datasource": None,
            "targets": [{"expr": expr, "refId": "A", "instant": True, "range": False}],
            "fieldConfig": {
                "defaults": {
                    "unit": unit,
                    "thresholds": {
                        "mode": "absolute",
                        "steps": [
                            {"color": "red", "value": None},
                            {"color": color, "value": 0},
                        ],
                    },
                },
                "overrides": [],
            },
            "options": {
                "colorMode": "value", "graphMode": "area",
                "justifyMode": "auto", "orientation": "auto",
                "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                "textMode": "auto",
            },
            "pluginVersion": "10.2.0",
        })

    # ── Timeseries: taxa por fase/resultado ────────────────────────────────
    pid, pos = grid(12, 8, y + 9, 0)
    new_panels.append({
        "id": pid, "type": "timeseries", "title": "2PC Taxa por Fase/Resultado (5m)",
        "gridPos": pos, "datasource": None,
        "targets": [{
            "expr": 'sum by (phase, result) (rate(khaaos_economy_2pc_requests_total[5m]))',
            "legendFormat": "{{phase}}/{{result}}", "refId": "A", "range": True,
        }],
        "fieldConfig": {"defaults": {"unit": "req/s", "custom": {"fillOpacity": 15, "lineWidth": 2}}, "overrides": []},
        "options": {"legend": {"displayMode": "list", "placement": "bottom", "showLegend": True},
                    "tooltip": {"mode": "multi", "sort": "desc"}},
        "pluginVersion": "10.2.0",
    })

    # ── Timeseries: latência p95 por fase ──────────────────────────────────
    pid, pos = grid(12, 8, y + 9, 12)
    new_panels.append({
        "id": pid, "type": "timeseries", "title": "2PC Latência p95 por Fase (5m)",
        "gridPos": pos, "datasource": None,
        "targets": [{
            "expr": 'histogram_quantile(0.95, sum by (le, phase) (rate(khaaos_economy_2pc_phase_duration_ms_bucket[5m])))',
            "legendFormat": "p95 {{phase}}", "refId": "A", "range": True,
        }],
        "fieldConfig": {"defaults": {"unit": "ms", "custom": {"fillOpacity": 10, "lineWidth": 2}}, "overrides": []},
        "options": {"legend": {"displayMode": "list", "placement": "bottom", "showLegend": True},
                    "tooltip": {"mode": "multi", "sort": "desc"}},
        "pluginVersion": "10.2.0",
    })

    dash["panels"].extend(new_panels)
    dash["version"] = dash.get("version", 1) + 1
    dash.setdefault("description", "")
    dash["description"] = (
        "KRC Economy + Two-Phase Commit (2PC). Fonte: /metrics do economy-api "
        "(Prometheus job khaaos-economy-api)."
    )

    with open(DASHBOARD, "w", encoding="utf-8") as f:
        json.dump(dash, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"OK: {len(new_panels)} painéis adicionados (row + 5 stats + 2 timeseries), total={len(dash['panels'])}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
