from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

DASHBOARD = Path(__file__).resolve().parents[1]
REPOSITORY = DASHBOARD.parents[1]
sys.path.insert(0, str(DASHBOARD))
sys.path.insert(0, str(REPOSITORY))

from app import app  # noqa: E402


class DashboardApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_health_and_route_manifest(self) -> None:
        self.assertEqual(self.client.get("/api/healthz").json(), {"status": "ok"})
        manifest = self.client.get("/manus-routes.json")
        self.assertEqual(manifest.status_code, 200)
        self.assertEqual(manifest.json()["routes"][0]["path"], "/")

    def test_roster_contains_all_sixteen_canonical_operatives(self) -> None:
        response = self.client.get("/api/roster")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 16)
        self.assertEqual(len(payload["operatives"]), 16)
        self.assertEqual(len({operative["id"] for operative in payload["operatives"]}), 16)

    def test_simulation_returns_full_timeline_and_120_pairs(self) -> None:
        payload = self.client.get("/api/simulation?horizon=180").json()
        self.assertEqual(len(payload["timeline"]), 16)
        self.assertEqual(len(payload["pairs"]), 120)
        self.assertEqual(len(payload["composition"]["ids"]), 4)
        self.assertEqual(payload["composition"]["overlapInstances"], 10)
        self.assertEqual(payload["composition"]["pairSeconds"], 16.0)
        self.assertEqual(payload["limits"]["authoritativeCombatResult"], False)

    def test_horizon_and_lineup_are_validated(self) -> None:
        self.assertEqual(self.client.get("/api/simulation?horizon=0").status_code, 422)
        self.assertEqual(self.client.get("/api/simulation?lineup=unknown,unknown2").status_code, 422)
        self.assertEqual(self.client.get("/api/simulation?lineup=OP_MALE_VANGUARD").status_code, 422)

    def test_soraya_effect_window_is_shorter_than_state_duration(self) -> None:
        payload = self.client.get("/api/roster").json()
        soraya = next(item for item in payload["operatives"] if item["name"] == "Soraya Hadd")
        self.assertEqual(soraya["durationSeconds"], 2)
        self.assertEqual(soraya["interactionWindowSeconds"], 1.5)


if __name__ == "__main__":
    unittest.main()
