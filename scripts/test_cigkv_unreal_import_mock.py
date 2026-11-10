#!/usr/bin/env python3
"""Exercise the Unreal import helper control flow with a mocked Editor API.

This test validates script orchestration only; it is not a substitute for an
actual GLB import in Unreal Editor 5.8.
"""
from __future__ import annotations

import runpy
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORT_SCRIPT = ROOT / "scripts/import_cigkv_blockout_in_unreal.py"
IMPORTER = runpy.run_path(str(IMPORT_SCRIPT), run_name="cigkv_importer_under_test")


class FakeStaticMesh:
    def get_editor_property(self, name: str):
        if name == "static_materials":
            return [object() for _ in range(5)]
        raise AssertionError(f"Unexpected StaticMesh property: {name}")

    def get_path_name(self) -> str:
        return f"{IMPORTER['DESTINATION']}/{IMPORTER['ASSET_NAME']}.{IMPORTER['ASSET_NAME']}"


class FakeAssetImportTask:
    instances: list["FakeAssetImportTask"] = []

    def __init__(self) -> None:
        self.properties: dict[str, object] = {}
        self.imported_objects: list[object] = []
        self.instances.append(self)

    def set_editor_property(self, name: str, value: object) -> None:
        self.properties[name] = value

    def get_editor_property(self, name: str):
        if name == "imported_object_paths":
            return self.properties.get(name, [])
        raise AssertionError(f"Unexpected task property: {name}")

    def get_objects(self) -> list[object]:
        return self.imported_objects


class FakeEditorAssetLibrary:
    exists = False
    made_directories: list[str] = []

    @classmethod
    def does_asset_exist(cls, _path: str) -> bool:
        return cls.exists

    @classmethod
    def make_directory(cls, path: str) -> bool:
        cls.made_directories.append(path)
        return True

    @classmethod
    def load_asset(cls, _path: str):
        return None


class FakeAssetTools:
    calls = 0

    def import_asset_tasks(self, tasks: list[FakeAssetImportTask]) -> None:
        self.calls += 1
        if len(tasks) != 1:
            raise AssertionError("Expected exactly one GLB import task")
        task = tasks[0]
        task.imported_objects = [FakeStaticMesh()]
        task.properties["imported_object_paths"] = [task.imported_objects[0].get_path_name()]


class ImporterMockTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_unreal = sys.modules.get("unreal")
        self.tools = FakeAssetTools()
        FakeAssetImportTask.instances = []
        FakeAssetTools.calls = 0
        FakeEditorAssetLibrary.exists = False
        FakeEditorAssetLibrary.made_directories = []

        fake_unreal = types.ModuleType("unreal")
        fake_unreal.Paths = types.SimpleNamespace(
            project_dir=lambda: str(ROOT / "Unreal/KhaaosRun")
        )
        fake_unreal.EditorAssetLibrary = FakeEditorAssetLibrary
        fake_unreal.AssetImportTask = FakeAssetImportTask
        fake_unreal.AssetToolsHelpers = types.SimpleNamespace(
            get_asset_tools=lambda: self.tools
        )
        fake_unreal.StaticMesh = FakeStaticMesh
        fake_unreal.log = lambda _message: None
        sys.modules["unreal"] = fake_unreal

    def tearDown(self) -> None:
        if self.previous_unreal is None:
            sys.modules.pop("unreal", None)
        else:
            sys.modules["unreal"] = self.previous_unreal

    def test_import_configures_safe_task_and_validates_mesh_slots(self) -> None:
        preflight = IMPORTER["read_glb"]()
        result = IMPORTER["import_in_editor"](preflight)
        task = FakeAssetImportTask.instances[-1]

        self.assertEqual(result["status"], "imported_in_unreal_editor")
        self.assertEqual(result["material_slot_count"], 5)
        self.assertEqual(task.properties["filename"], str(IMPORTER["GLB_PATH"]))
        self.assertEqual(task.properties["destination_path"], IMPORTER["DESTINATION"])
        self.assertTrue(task.properties["automated"])
        self.assertTrue(task.properties["save"])
        self.assertFalse(task.properties["replace_existing"])
        self.assertEqual(self.tools.calls, 1)

    def test_existing_target_is_not_overwritten(self) -> None:
        FakeEditorAssetLibrary.exists = True
        with self.assertRaisesRegex(RuntimeError, "Refusing to overwrite"):
            IMPORTER["import_in_editor"](IMPORTER["read_glb"]())
        self.assertEqual(self.tools.calls, 0)
        self.assertEqual(FakeAssetImportTask.instances, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
