"""Synthetic unit fixtures for analyzer behavior only; never playtest evidence."""

import csv
import importlib.util
import io
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "analyze_weapon_playtests.py"
SPEC = importlib.util.spec_from_file_location("analyze_weapon_playtests", SCRIPT)
ANALYZER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(ANALYZER)

FIELDS = ANALYZER.SCHEMA_V1


def synthetic_row(
    engagement_id,
    *,
    shots_fired="4",
    shots_hit="2",
    damage_applied="20",
    ttk="100",
    eliminated="true",
    distance="10",
    rtt="40",
    weapon="weapon-a",
):
    """Build a small synthetic input fixture for unit tests, not game evidence."""
    return {
        "engagement_id": engagement_id,
        "build_id": "build-test",
        "scenario_id": "scenario-test",
        "mode": "mode-test",
        "weapon_id": weapon,
        "target_armor_class": "armor-test",
        "distance_m": distance,
        "shots_fired": shots_fired,
        "shots_hit": shots_hit,
        "damage_applied": damage_applied,
        "time_to_kill_ms": ttk,
        "eliminated": eliminated,
        "server_rtt_ms": rtt,
    }


class WeaponPlaytestAnalysisTests(unittest.TestCase):
    def write_csv(self, rows, *, header=FIELDS, raw_text=None):
        temp = tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", delete=False)
        self.addCleanup(Path(temp.name).unlink, missing_ok=True)
        if raw_text is not None:
            temp.write(raw_text)
        else:
            writer = csv.DictWriter(temp, fieldnames=header, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        temp.close()
        return Path(temp.name)

    def read_rows(self, rows):
        return ANALYZER.read_engagements(self.write_csv(rows))

    def test_grouping_aggregated_metrics_and_nearest_rank_percentiles(self):
        rows = self.read_rows(
            [
                synthetic_row("e1", shots_fired="2", shots_hit="1", damage_applied="10", ttk="100", distance="10", rtt="20"),
                synthetic_row("e2", shots_fired="3", shots_hit="2", damage_applied="15", ttk="200", distance="20", rtt="40"),
                synthetic_row("e3", shots_fired="5", shots_hit="0", damage_applied="5", ttk="", eliminated="false", distance="30", rtt="60"),
                synthetic_row("e4", weapon="weapon-b", shots_fired="4", shots_hit="0", damage_applied="0", ttk="", eliminated="false", distance="4", rtt="80"),
            ]
        )
        result = ANALYZER.analyze(rows, min_encounters=2)
        self.assertEqual(result["balance_status"], "UNVERIFIED")
        self.assertEqual(result["evidence_scope"], "observed_playtest_descriptive_only")
        first, second = result["groups"]
        self.assertEqual((first["weapon_id"], first["n"]), ("weapon-a", 3))
        self.assertEqual(first["sample_status"], "SUFFICIENT_FOR_REVIEW")
        self.assertAlmostEqual(first["hit_rate"], 3 / 10)
        self.assertAlmostEqual(first["damage_per_shot"], 30 / 10)
        self.assertAlmostEqual(first["damage_per_hit"], 30 / 3)
        self.assertAlmostEqual(first["elim_rate"], 2 / 3)
        self.assertEqual(first["ttk_median_ms"], 150)
        self.assertEqual(first["ttk_p90_ms"], 200)
        self.assertEqual(first["mean_distance_m"], 20)
        self.assertEqual(first["median_server_rtt_ms"], 40)
        self.assertEqual((second["weapon_id"], second["n"]), ("weapon-b", 1))
        self.assertEqual(second["sample_status"], "INSUFFICIENT_SAMPLE")
        self.assertIsNone(second["damage_per_hit"])
        self.assertIsNone(second["ttk_median_ms"])
        self.assertIsNone(second["ttk_p90_ms"])

    def test_threshold_exactly_at_n_is_sufficient(self):
        rows = self.read_rows([synthetic_row("e1"), synthetic_row("e2")])
        report = ANALYZER.analyze(rows, 2)
        self.assertEqual(report["groups"][0]["n"], 2)
        self.assertEqual(report["groups"][0]["sample_status"], "SUFFICIENT_FOR_REVIEW")

    def test_hits_cannot_exceed_fired(self):
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "shots_hit"):
            self.read_rows([synthetic_row("bad-hits", shots_fired="2", shots_hit="3")])

    def test_hits_cannot_be_negative(self):
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "shots_hit"):
            self.read_rows([synthetic_row("bad-hits", shots_hit="-1")])

    def test_ttk_required_and_positive_for_elimination(self):
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "TTK deve ser > 0"):
            self.read_rows([synthetic_row("missing-ttk", ttk="")])
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "TTK deve ser > 0"):
            self.read_rows([synthetic_row("zero-ttk", ttk="0")])

    def test_ttk_must_be_empty_when_not_eliminated(self):
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "TTK deve estar vazio"):
            self.read_rows([synthetic_row("unexpected-ttk", eliminated="false", ttk="1")])

    def test_duplicate_engagement_ids_rejected(self):
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "engagement_id duplicado"):
            self.read_rows([synthetic_row("same"), synthetic_row("same")])

    def test_exact_columns_and_order_required(self):
        path = self.write_csv([], header=FIELDS[:-1])
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "cabeçalho CSV inválido"):
            ANALYZER.read_engagements(path)

    def test_duplicate_header_rejected(self):
        header = list(FIELDS)
        header[-1] = header[0]
        path = self.write_csv([], header=header)
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "coluna.*duplicados"):
            ANALYZER.read_engagements(path)

    def test_malformed_row_column_count_rejected(self):
        path = self.write_csv([], raw_text=",".join(FIELDS) + "\nonly-one-value\n")
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "colunas"):
            ANALYZER.read_engagements(path)

    def test_empty_input_rejected(self):
        path = self.write_csv([], raw_text="")
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "sem cabeçalho ou conteúdo"):
            ANALYZER.read_engagements(path)

    def test_header_only_input_rejected(self):
        path = self.write_csv([])
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "não contém engajamentos"):
            ANALYZER.read_engagements(path)

    def test_non_finite_numeric_rejected(self):
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "finito"):
            self.read_rows([synthetic_row("non-finite", distance="nan")])

    def test_empty_dimension_rejected(self):
        row = synthetic_row("empty-dimension")
        row["weapon_id"] = "  "
        with self.assertRaisesRegex(ANALYZER.AnalysisError, "weapon_id"):
            self.read_rows([row])

    def test_cli_requires_csv_and_positive_threshold_and_reports_errors(self):
        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(SystemExit) as caught:
            ANALYZER.main([])
        self.assertEqual(caught.exception.code, 2)

        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(SystemExit) as caught:
            ANALYZER.main(["input.csv", "--min-encounters", "0"])
        self.assertEqual(caught.exception.code, 2)
        self.assertIn("inteiro positivo", stderr.getvalue())

        empty_path = self.write_csv([], raw_text="")
        stderr = io.StringIO()
        with redirect_stderr(stderr):
            exit_code = ANALYZER.main([str(empty_path), "--min-encounters", "1"])
        self.assertNotEqual(exit_code, 0)
        self.assertIn("erro:", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
