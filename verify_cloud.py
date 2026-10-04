"""Run complete science/chemistry/marimo checks in a compatible Python runtime.

This script never marks browser or fresh-molab validation as passed. It records
evidence and stops on the first failure. Dependencies must already be installed.
"""
import hashlib
import importlib.metadata
import json
import pathlib
import platform
import subprocess
import sys
import importlib.util
import shutil

ROOT = pathlib.Path(__file__).resolve().parent
EVIDENCE = ROOT / "evidence" / "cloud"
EVIDENCE.mkdir(parents=True, exist_ok=True)
REPORT_PATH = ROOT / "CLOUD_EXECUTION_REPORT.json"
NOTEBOOK_NAME = "notebook.py" if (ROOT / "notebook.py").exists() else "missing_molecules.py"
PIP = [sys.executable, "-m", "pip"] if importlib.util.find_spec("pip") else [shutil.which("uv"), "pip"]
PIP_TARGET = [] if importlib.util.find_spec("pip") else ["--python", sys.executable]
report = {"python": sys.version, "platform": platform.platform(), "status": "RUNNING",
          "commands": {}, "browser_validation": "PENDING", "fresh_molab_validation": "PENDING", "submission_ready": False}

def save():
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

def run(name, command):
    process = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    log_path = EVIDENCE / (name + ".log")
    log_path.write_text("COMMAND: " + json.dumps(command) + "\nEXIT CODE: " + str(process.returncode)
                        + "\nSTDOUT:\n" + process.stdout + "\nSTDERR:\n" + process.stderr, encoding="utf-8")
    report["commands"][name] = {"exit_code": process.returncode, "status": "PASSED" if process.returncode == 0 else "FAILED", "log": str(log_path.relative_to(ROOT))}
    save()
    if process.returncode:
        raise RuntimeError(f"{name} failed; inspect {log_path.relative_to(ROOT)}")
    print(name + ": PASSED", flush=True)
    return process.stdout

try:
    run("rdkit_import", [sys.executable, "-c", "from rdkit import Chem; from rdkit.Chem.Draw import rdMolDraw2D; assert Chem.MolFromSmiles('CCO').GetNumAtoms() == 3; print('RDKit import and molecule parse passed')"])
    run("semantic_tests", [sys.executable, "test_science.py"])
    # The active notebook is edited through marimo's runtime API. Its existing
    # embedded source is verified byte-for-byte, without writing the live .py.
    run("full_chemistry_and_data", [sys.executable, "validate_full.py", "--no-embed"])
    findings = json.loads((ROOT / "verified_findings.json").read_text(encoding="utf-8"))
    if findings["validation_mode"] != "full" or findings["chemistry_audit"]["status"] != "PASSED" or findings["full_data_logic_checks"] != "PASSED":
        raise ValueError("Full mode, successful chemistry, and full-data logic are required")
    report["chemistry_audit"] = findings["chemistry_audit"]
    report["analysis_denominator"] = findings["analysis_denominator"]
    report["default_gates"] = findings["settings"]["ksol+hlm+papp"]
    run("marimo_strict_check", [sys.executable, "-m", "marimo", "check", NOTEBOOK_NAME, "--strict"])
    run("dependency_consistency", PIP + ["check"] + PIP_TARGET)
    run("html_export", [sys.executable, "-m", "marimo", "export", "html", NOTEBOOK_NAME, "-o", str(EVIDENCE / "final_notebook_preview.html"), "--no-sandbox", "-f"])
    run("session_export", [sys.executable, "-m", "marimo", "export", "session", NOTEBOOK_NAME, "--no-sandbox", "--force-overwrite"])
    session_path = ROOT / "__marimo__" / "session" / (NOTEBOOK_NAME + ".json")
    session = json.loads(session_path.read_text(encoding="utf-8"))
    errors = [{"cell_id": cell.get("id"), "exception": output.get("ename"), "message": output.get("evalue")}
              for cell in session["cells"] for output in cell.get("outputs", []) if output.get("type") == "error"]
    report["session_inspection"] = {"cell_count": len(session["cells"]), "error_output_count": len(errors), "errors": errors}
    if not session["cells"] or errors:
        raise RuntimeError("Final notebook exported exception outputs or no cells")
    report["notebook_sha256"] = hashlib.sha256((ROOT / NOTEBOOK_NAME).read_bytes()).hexdigest()
    report["packages"] = {p: importlib.metadata.version(p) for p in ["marimo", "rdkit", "anywidget", "traitlets"]}
    freeze = run("freeze_successful_environment", PIP + ["freeze"] + PIP_TARGET)
    (ROOT / "requirements.lock.txt").write_text("# Successful science/chemistry/marimo execution environment.\n# Browser and fresh molab validation are recorded separately.\n# " + platform.platform() + "\n" + freeze, encoding="utf-8")
    report["status"] = "SCIENCE_CHEMISTRY_AND_MARIMO_PASSED_BROWSER_AND_FRESH_SESSION_PENDING"
    save()
    print(json.dumps({"status": report["status"], "valid_ids": findings["analysis_denominator"]["n"],
                      "default_gates": report["default_gates"], "next": "Run the complete notebook in a live browser and then in a fresh Python-backed molab session. Inspect chemical drawings and update the video."}, indent=2))
except Exception as error:
    report["status"] = "FAILED"
    report["failure"] = str(error)
    save()
    raise
