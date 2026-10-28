#!/usr/bin/env python3
# KHAAOS RUN — Validação de Monitoramento em Staging (job 13-monitoring)
# ======================================================================
# Valida, contra um servidor Khaaos AO VIVO em staging:
#   1. /healthz (postgres/health) → 200 + database ok
#   2. /metrics → exposição Prometheus parseável
#   3. Fluxo 2PC real prepare → abort com contadores do /metrics movendo
#      (roda antes do contrato: aquece histograma/counters no staging frio)
#   4. Contrato dashboard ↔ métricas: todo identificador khaaos_* referenciado
#      no dashboard Grafana existe na exposição /metrics (amostra, família
#      declarada ou sub-série de histograma)
#
# Uso (CI e rehearsal local — mesmo script):
#   python3 scripts/validate_monitoring_staging.py \
#     --base-url http://127.0.0.1:8787 \
#     --dashboard infra/grafana/khaaos-economy-dashboard.json
#
# Requisitos: python3 stdlib + node (para o seed da wallet via pg).

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

PASS = "[PASS]"
FAIL = "[FAIL]"


def http_get(base_url: str, path: str, timeout: float = 10.0) -> tuple:
    req = urllib.request.Request(base_url + path, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def http_post_json(base_url: str, path: str, payload: dict, timeout: float = 10.0) -> tuple:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base_url + path,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", errors="replace")


def parse_metric_samples(metrics_text: str, family: str) -> list:
    """Valores de todas as amostras de uma família (com ou sem labels)."""
    values = []
    for line in metrics_text.splitlines():
        if line.startswith(family + "{") or line.startswith(family + " "):
            _, _, value = line.rpartition(" ")
            try:
                values.append(float(value))
            except ValueError:
                pass
    return values


def extract_dashboard_metric_names(dashboard: dict) -> set:
    """Todos os identificadores khaaos_* referenciados no dashboard JSON."""
    blob = json.dumps(dashboard)
    return set(re.findall(r"\bkhaaos_[a-z0-9_]+", blob))


def metric_families_declared(metrics_text: str) -> set:
    """Famílias declaradas via # TYPE (histograma declara apenas a base)."""
    return set(re.findall(r"^# TYPE (\S+) ", metrics_text, flags=re.MULTILINE))


def dashboard_metric_covered(name: str, metrics_text: str, declared: set) -> bool:
    """Métrica coberta se tem amostras, está declarada (família sem amostras
    ainda — DB vazio em staging frio) ou é sub-série (_bucket/_sum/_count)
    de um histograma declarado."""
    has_samples = (name + "{") in metrics_text or re.search(
        "^" + re.escape(name) + " ", metrics_text, flags=re.MULTILINE
    )
    if has_samples or name in declared:
        return True
    for suffix in ("_bucket", "_sum", "_count"):
        if name.endswith(suffix) and name[: -len(suffix)] in declared:
            return True
    return False


def seed_wallet(player_id: int, amount: str, attempts: int = 3) -> None:
    """Seed da wallet do ator dev ue5-player-<id> via node+pg (usa DATABASE_URL).

    Com retry: em staging recém-subido o pool do servidor pode estar
    estabelecendo conexões e derrubar a primeira tentativa do seed."""
    actor = "ue5-player-" + str(player_id)
    script = (
        "const { Pool } = require('pg');"
        "const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });"
        "p.query("
        "'INSERT INTO bank_accounts (user_id, weapons_balance) VALUES ($1, $2) "
        "ON CONFLICT (user_id) DO UPDATE SET weapons_balance = $2',"
        "[process.argv[1], process.argv[2]])"
        ".then(() => p.end())"
        ".catch((e) => { console.error(e.message); process.exit(1); });"
    )
    last_error = ""
    for attempt in range(1, attempts + 1):
        result = subprocess.run(
            ["node", "-e", script, actor, amount],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            return
        last_error = result.stderr.strip()
        time.sleep(1.5 * attempt)
    raise RuntimeError("seed da wallet falhou: " + last_error)


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida monitoramento do staging ao vivo")
    parser.add_argument("--base-url", default="http://127.0.0.1:8787")
    parser.add_argument("--dashboard", default="infra/grafana/khaaos-economy-dashboard.json")
    parser.add_argument("--player-id", type=int, default=777)
    parser.add_argument("--skip-2pc", action="store_true", help="pula o fluxo 2PC ao vivo")
    args = parser.parse_args()

    failures = []

    # ── 1. /healthz (postgres/health) ────────────────────────────────────────
    try:
        status, body = http_get(args.base_url, "/healthz")
        health = json.loads(body)
        db_ok = bool(health.get("checks", {}).get("database", {}).get("ok"))
        if status == 200 and health.get("ok") is True and db_ok:
            print(PASS, "/healthz 200 ok=true database.ok=true (service=%s)" % health.get("service"))
        else:
            failures.append("/healthz inesperado: status=%s body=%s" % (status, body[:200]))
    except Exception as exc:  # noqa: BLE001
        failures.append("/healthz inacessivel: %s" % exc)

    # ── 2. /metrics ──────────────────────────────────────────────────────────
    metrics_text = ""
    try:
        status, metrics_text = http_get(args.base_url, "/metrics")
        if status != 200 or "# TYPE" not in metrics_text:
            failures.append("/metrics invalido: status=%s" % status)
        else:
            families = re.findall(r"^# TYPE (\S+) ", metrics_text, flags=re.MULTILINE)
            print(PASS, "/metrics 200 com %d familias Prometheus" % len(families))
    except Exception as exc:  # noqa: BLE001
        failures.append("/metrics inacessivel: %s" % exc)

    declared = metric_families_declared(metrics_text)

    # ── 3. Fluxo 2PC real prepare → abort com contadores movendo ─────────────
    # (antes do contrato: gera tráfego que aquece histograma/counters no frio)
    if not args.skip_2pc:
        try:
            seed_wallet(args.player_id, "1000.00")
            time.sleep(0.2)

            _, metrics_before = http_get(args.base_url, "/metrics")
            baseline = sum(parse_metric_samples(metrics_before, "khaaos_economy_2pc_requests_total"))

            stamp = str(int(time.time() * 1000))[-12:]
            payload = {
                "transactionId": "ci2pc" + stamp + "0" * 30,
                "idempotencyKey": "khaaos-2pc-ci-" + stamp + "a" + stamp + "b",
                "amountKrc": 500,
                "playerId": args.player_id,
                "itemId": "SKN_HURAN_AQUA",
                "description": "Forja do Armeiro - validacao 13-monitoring",
                "coordinatorNodeId": "ci-monitoring-node-01",
                "expiryTimestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 60)),
            }
            status, body = http_post_json(args.base_url, "/api/economy/2pc/prepare", payload)
            prepared = None
            transaction_id = None
            try:
                parsed = json.loads(body)
                prepared = parsed.get("prepared")
                transaction_id = parsed.get("transactionId") or payload["transactionId"]
            except json.JSONDecodeError:
                pass
            if status < 200 or status >= 300 or prepared is not True:
                failures.append("2PC prepare falhou: status=%s body=%s" % (status, body[:200]))
            else:
                print(PASS, "2PC prepare 2xx prepared=true (tx=%s)" % transaction_id)

            abort_payload = {
                "transactionId": transaction_id or payload["transactionId"],
                "playerId": args.player_id,
                "reason": "validacao 13-monitoring: rollback do staging",
            }
            status, body = http_post_json(args.base_url, "/api/economy/2pc/abort", abort_payload)
            if status < 200 or status >= 300:
                failures.append("2PC abort falhou: status=%s body=%s" % (status, body[:200]))
            else:
                print(PASS, "2PC abort 2xx (escrow reembolsado)")

            time.sleep(0.5)  # janela para o contador registrar
            _, metrics_after = http_get(args.base_url, "/metrics")
            after_total = sum(parse_metric_samples(metrics_after, "khaaos_economy_2pc_requests_total"))
            if after_total > baseline:
                print(PASS, "contadores 2PC movem no /metrics (soma %.0f -> %.0f)" % (baseline, after_total))
            else:
                failures.append("contadores 2PC nao moveram: antes=%.0f depois=%.0f" % (baseline, after_total))
        except Exception as exc:  # noqa: BLE001
            failures.append("fluxo 2PC ao vivo: %s" % exc)

    # ── 4. Contrato dashboard ↔ métricas (após o aquecimento do fluxo 2PC) ──
    try:
        _, metrics_text = http_get(args.base_url, "/metrics")
        declared = metric_families_declared(metrics_text)
        with open(args.dashboard, encoding="utf-8") as f:
            dashboard = json.load(f)
        referenced = extract_dashboard_metric_names(dashboard)
        missing = sorted(m for m in referenced if not dashboard_metric_covered(m, metrics_text, declared))
        if missing:
            failures.append("dashboard referencia metricas ausentes em /metrics: %s" % missing)
        else:
            print(PASS, "contrato dashboard<->metrics: %d metricas khaaos_* presentes" % len(referenced))
    except Exception as exc:  # noqa: BLE001
        failures.append("contrato dashboard<->metrics: %s" % exc)

    # ── Resultado ────────────────────────────────────────────────────────────
    if failures:
        for failure in failures:
            print(FAIL, failure)
        print("RESULTADO: %d falha(s)" % len(failures))
        return 1
    print("RESULTADO: staging de monitoramento 100% validado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
