"""Check every downloaded decision against the validated published-ID engine."""
import hashlib
import json
import pathlib
import textwrap
import types

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE_ROOT = ROOT / "remote" if (ROOT / "remote").exists() else ROOT
NOTEBOOK = SOURCE_ROOT / ("notebook.py" if (SOURCE_ROOT / "notebook.py").exists() else "missing_molecules.py")
source = NOTEBOOK.read_text(encoding="utf-8")
core = types.ModuleType("browser_export_reference")
core_text = textwrap.dedent(source.split("# CORE_START:", 1)[1].split("\n", 1)[1].split("    # CORE_END", 1)[0])
exec(compile(core_text, "notebook.py", "exec"), core.__dict__)
raw = (ROOT / "data" / "expansion_data_raw.csv").read_bytes()
records, _ = core.records_from_csv(raw)
checks = []
for path in sorted((ROOT / "evidence" / "browser").rglob("*.json")):
    data = json.loads(path.read_text(encoding="utf-8"))
    if "molecule_decisions" not in data:
        continue
    enabled = data["enabled_endpoints"]
    thresholds = {key: value["value"] for key, value in data["thresholds"].items()}
    expected = core.evaluate_records(records, enabled, thresholds, data["discard_censored"])
    assert data["source_sha256"] == hashlib.sha256(raw).hexdigest(), path
    assert data["molecule_decisions"] == expected, path
    assert data["summary"] == core.summarize(expected), path
    assert data["first_failure_attribution"] == core.first_failure_attribution(expected, data["gate_order"]), path
    assert data["assay_opportunity"] == core.assay_priority(expected, enabled), path
    checks.append({"file": str(path.relative_to(ROOT)), "ids_compared": len(expected),
                   "gate_statuses_compared": len(expected) * len(enabled), "status": "PASSED"})
assert checks, "No actual browser downloads found"
report = {"status": "PASSED", "notebook_sha256": hashlib.sha256(NOTEBOOK.read_bytes()).hexdigest(),
          "checks": checks, "scope": "All per-ID statuses, gates, summaries, first failures, and assay opportunities in each downloaded JSON"}
(ROOT / "evidence" / "browser_export_comparison.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({"status": report["status"], "downloaded_files_compared": len(checks), "total_id_decisions_compared": sum(check["ids_compared"] for check in checks)}, indent=2))
