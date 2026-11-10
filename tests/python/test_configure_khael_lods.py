import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "ue5"))

fake_unreal = types.ModuleType("unreal")
fake_unreal.SkeletalMesh = type("SkeletalMesh", (), {})
fake_unreal.EditorAssetLibrary = types.SimpleNamespace()
fake_unreal.log = lambda _message: None
fake_unreal.log_warning = lambda _message: None
sys.modules["unreal"] = fake_unreal

import configure_khael_lods


class ReflectedObject:
    def __init__(self, properties=None, fail_set=(), ignore_set=()):
        self.properties = dict(properties or {})
        self.fail_set = set(fail_set)
        self.ignore_set = set(ignore_set)
        self.set_calls = []

    def get_editor_property(self, name):
        if name not in self.properties:
            raise AttributeError(name)
        return self.properties[name]

    def set_editor_property(self, name, value):
        self.set_calls.append((name, value))
        if name in self.fail_set:
            raise AttributeError(name)
        if name not in self.ignore_set:
            self.properties[name] = value

    def get_name(self):
        return "TestAsset"

    def get_path_name(self):
        return "/Game/TestAsset"


class ConfigureKhaelLodsTest(unittest.TestCase):
    def make_mesh(self, lod_count=4, fail_set=(), ignore_set=()):
        lod_info = [
            ReflectedObject({"screen_size": 0.5, "lod_hysteresis": 0.0})
            for _ in range(lod_count)
        ]
        return ReflectedObject(
            {
                "lod_info": lod_info,
                "enable_per_poly_skeletal_mesh_lod": False,
                "support_uniformly_distributed_sampling": False,
            },
            fail_set=fail_set,
            ignore_set=ignore_set,
        )

    def test_apply_sets_and_verifies_each_lod_value(self):
        mesh = self.make_mesh()
        self.assertEqual(configure_khael_lods.configure_lod_info(mesh, apply=True), 4)
        for index, info in enumerate(mesh.properties["lod_info"]):
            self.assertAlmostEqual(
                info.properties["screen_size"], configure_khael_lods.LOD_SCREEN_SIZES[index]
            )
            self.assertAlmostEqual(
                info.properties["lod_hysteresis"], configure_khael_lods.LOD_HYSTERESIS[index]
            )
        self.assertIn("lod_info", [name for name, _ in mesh.set_calls])

    def test_dry_run_does_not_mutate_lod_entries(self):
        mesh = self.make_mesh()
        original = [dict(info.properties) for info in mesh.properties["lod_info"]]
        self.assertEqual(configure_khael_lods.configure_lod_info(mesh, apply=False), 4)
        self.assertEqual([info.properties for info in mesh.properties["lod_info"]], original)
        self.assertEqual(mesh.set_calls, [])

    def test_reflection_setter_failure_is_fatal(self):
        mesh = self.make_mesh()
        mesh.properties["lod_info"][1].fail_set.add("screen_size")
        with self.assertRaises(configure_khael_lods.LodConfigError):
            configure_khael_lods.configure_lod_info(mesh, apply=True)

    def test_silent_reflection_noop_is_detected_by_readback(self):
        mesh = self.make_mesh()
        mesh.properties["lod_info"][0].ignore_set.add("screen_size")
        with self.assertRaises(configure_khael_lods.LodConfigError):
            configure_khael_lods.configure_lod_info(mesh, apply=True)

    def test_lod_array_persistence_failure_is_fatal(self):
        mesh = self.make_mesh(fail_set=("lod_info",))
        with self.assertRaises(configure_khael_lods.LodConfigError):
            configure_khael_lods.configure_lod_info(mesh, apply=True)

    def test_save_failure_is_fatal_and_forces_requested_apply_save(self):
        asset = ReflectedObject()
        calls = []
        fake_unreal.EditorAssetLibrary.save_loaded_asset = (
            lambda target, only_if_is_dirty: calls.append((target, only_if_is_dirty)) or False
        )
        with self.assertRaises(configure_khael_lods.LodConfigError):
            configure_khael_lods.save_asset(asset, apply=True)
        self.assertEqual(calls, [(asset, False)])


if __name__ == "__main__":
    unittest.main()
