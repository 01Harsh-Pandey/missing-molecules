"""Independent local review of downloaded full-cloud evidence; no remote calls."""
import base64
import collections
import csv
import hashlib
import io
import itertools
import json
import pathlib
import re
import textwrap
import types
import zlib
from decimal import Decimal

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE_ROOT = ROOT / "remote" if (ROOT / "remote").exists() else ROOT
NOTEBOOK = SOURCE_ROOT / ("notebook.py" if (SOURCE_ROOT / "notebook.py").exists() else "missing_molecules.py")
text = NOTEBOOK.read_text(encoding="utf-8")
core_text = textwrap.dedent(text.split("# CORE_START:", 1)[1].split("\n", 1)[1].split("    # CORE_END", 1)[0])
core = types.ModuleType("reviewed_cloud_core")
exec(compile(core_text, str(NOTEBOOK), "exec"), core.__dict__)
raw = (ROOT / "data" / "expansion_data_raw.csv").read_bytes()
findings = json.loads((SOURCE_ROOT / "verified_findings.json").read_text(encoding="utf-8"))
live = json.loads((ROOT / "evidence" / "live-baseline.json").read_text(encoding="utf-8"))
export = live["decision_export"]
rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
failures = []


def check(condition, message):
    if not condition:
        failures.append(message)


def independent_measurement(value):
    """Separate Decimal implementation; no notebook parsing/classification calls."""
    value = value.strip()
    if value.lower() in {"", "nan", "na", "n/a", "none", "null", "nd", "not tested", "-", "--"}:
        return {"kind": "missing"}
    match = re.fullmatch(r"(<=|>=|<|>|=)?\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)", value)
    if not match:
        return {"kind": "unparsed"}
    op, number = match.groups()
    op = op or "="
    number = Decimal(number)
    if not number.is_finite():
        return {"kind": "unparsed"}
    low = number if op in {"=", ">", ">="} else Decimal("-Infinity")
    high = number if op in {"=", "<", "<="} else Decimal("Infinity")
    low_open, high_open = op == ">", op == "<"
    if high < 0 or (high == 0 and high_open):
        return {"kind": "invalid"}
    if low < 0:
        low, low_open = Decimal(0), False
    return {"kind": "exact" if op == "=" else "censored", "low": low, "high": high,
            "low_open": low_open, "high_open": high_open}


parsed = {row["Molecule Name"]: {key: independent_measurement(row[spec["column"]]) for key, spec in core.ENDPOINTS.items()} for row in rows}


def independent_decisions(keys, thresholds, discard=False):
    results = []
    for row in rows:
        compound_id = row["Molecule Name"]
        gates = {}
        for key in keys:
            measurement = parsed[compound_id][key]
            threshold = Decimal(str(thresholds[key]))
            if measurement["kind"] not in {"exact", "censored"} or (discard and measurement["kind"] == "censored"):
                status = "unresolved"
            elif core.ENDPOINTS[key]["direction"] == "min":
                status = "pass" if measurement["low"] >= threshold else ("fail" if measurement["high"] < threshold or (measurement["high"] == threshold and measurement["high_open"]) else "unresolved")
            else:
                status = "pass" if measurement["high"] <= threshold else ("fail" if measurement["low"] > threshold or (measurement["low"] == threshold and measurement["low_open"]) else "unresolved")
            gates[key] = status
        overall = "fail" if any(status == "fail" for status in gates.values()) else ("pass" if all(status == "pass" for status in gates.values()) else "unresolved")
        results.append({"id": compound_id, "status": overall, "gates": gates})
    return results


def independent_summary(results):
    counts = collections.Counter(row["status"] for row in results)
    return {"n": len(results), "pass": counts["pass"], "fail": counts["fail"], "unresolved": counts["unresolved"],
            "lower": counts["pass"], "upper": counts["pass"] + counts["unresolved"],
            "complete_decisions": counts["pass"] + counts["fail"]}


check(findings["validation_mode"] == "full" and findings["full_data_logic_checks"] == "PASSED" and findings["chemistry_audit"]["status"] == "PASSED", "Full chemistry/logic status is not passed")
check(hashlib.md5(raw).hexdigest() == findings["source"]["md5"] == "27fae3d509fb1d9fd97cc94a4c9cccec", "Source MD5 differs")
check(hashlib.sha256(raw).hexdigest() == findings["source"]["sha256"] == export["source_sha256"], "Source SHA-256 differs")
embedded = re.search(r'^    embedded_raw_b64 = "([A-Za-z0-9+/=]+)"$', text, re.MULTILINE)
check(bool(embedded) and zlib.decompress(base64.b64decode(embedded.group(1))) == raw, "Embedded bytes differ from the official raw file")
check(len(rows) == len(parsed) == 7618, "Raw source IDs repeat or denominator changed")
cloud_chemistry, live_chemistry = findings["chemistry_audit"], live["chemistry_audit"]
check(cloud_chemistry["valid_molecule_ids"] == live_chemistry["valid_molecule_ids"] == len(rows), "Valid-ID denominator differs")
check(cloud_chemistry["invalid_ids"] == live_chemistry["invalid_structure_ids"] == [], "Structure exclusion IDs differ")
check(cloud_chemistry["multi_fragment_ids"] == live_chemistry["multi_fragment_ids"] == [], "Fragment IDs differ")
for field in ["distinct_isomeric_structures", "repeated_structure_groups"]:
    check(cloud_chemistry[field] == live_chemistry[field], "Live/full chemistry mismatch: " + field)
normalize_groups = lambda groups: sorted(sorted(group) for group in groups)
check(normalize_groups(cloud_chemistry["repeated_structure_id_groups"]) == normalize_groups(live_chemistry["repeated_structure_ids"].values()) == [["E-0001829", "E-0014119"]], "Canonical duplicate groups differ")
check(findings["source_audit"] == live["source_audit"], "Live/full source schema or measurement audit differs")
check(findings["analysis_denominator"]["measurement_kinds"] == {key: dict(collections.Counter(m[key]["kind"] for m in parsed.values())) for key in core.ENDPOINTS}, "Independent source measurement kinds differ")
thresholds = {key: spec["default"] for key, spec in core.ENDPOINTS.items()}
keys = ["ksol", "hlm", "papp"]
expected = independent_decisions(keys, thresholds)
dropped = independent_decisions(keys, thresholds, True)
check(export["enabled_endpoints"] == keys and not export["discard_censored"], "Live baseline controls are not default")
check(export["thresholds"] == {key: {"value": thresholds[key], "unit": core.ENDPOINTS[key]["unit"], "direction": core.ENDPOINTS[key]["direction"]} for key in keys}, "Live threshold values/units/directions differ")
check(expected == export["molecule_decisions"], "At least one live per-ID gate/status differs from independent Decimal evidence logic")
records, _ = core.records_from_csv(raw)
check(expected == core.evaluate_records(records, keys, thresholds), "Notebook core differs from independent Decimal decisions")
check(independent_summary(expected) == live["evidence_summary"] == export["summary"] == findings["settings"]["ksol+hlm+papp"]["interval"], "Live/full default aggregate differs")
check(independent_summary(dropped) == findings["settings"]["ksol+hlm+papp"]["discard_censored"], "Default discard-censored aggregate differs")
attribution = [{"endpoint": key, "first_fail": sum(next((gate for gate in keys if row["gates"][gate] == "fail"), None) == key for row in expected)} for key in keys]
check(attribution == export["first_failure_attribution"], "Live first-failure attribution differs")
opportunity = {key: {"endpoint": key, "single_blocker": 0, "any_blocker": 0} for key in keys}
for row in expected:
    if row["status"] == "unresolved":
        unknowns = [key for key in keys if row["gates"][key] == "unresolved"]
        for key in unknowns:
            opportunity[key]["any_blocker"] += 1
            opportunity[key]["single_blocker"] += len(unknowns) == 1
check(sorted(opportunity.values(), key=lambda row: row["endpoint"]) == sorted(export["assay_opportunity"], key=lambda row: row["endpoint"]), "Live assay opportunities differ")
for name, setting in findings["settings"].items():
    subset = name.split("+")
    for discard, policy in [(False, "interval"), (True, "discard_censored")]:
        check(independent_summary(independent_decisions(subset, thresholds, discard)) == setting[policy], "Independent endpoint-subset mismatch: " + name + "/" + policy)
for key, sensitivity in findings["threshold_sensitivity"].items():
    for row in sensitivity["rows"]:
        selected_thresholds = {**thresholds, key: row["threshold"]}
        for discard, policy in [(False, "interval"), (True, "discard_censored")]:
            check(independent_summary(independent_decisions(sensitivity["enabled"], selected_thresholds, discard)) == row[policy], "Independent sensitivity mismatch: " + key + "/" + str(row["threshold"]) + "/" + policy)
by_id = {row["Molecule Name"]: row for row in rows}
for name, demo in findings["demo_cases"].items():
    if "id" not in demo:
        continue
    for key, evidence in demo["evidence"].items():
        check(by_id[demo["id"]][core.ENDPOINTS[key]["column"]] == evidence["raw"], "Demo published measurement changed: " + name + "/" + key)
    demo_thresholds = {**thresholds, **demo["thresholds"]}
    for discard, policy in [(False, "using_bounds"), (True, "discarding_bounds")]:
        row = next(row for row in independent_decisions(demo["enabled"], demo_thresholds, discard) if row["id"] == demo["id"])
        check(row == demo[policy], "Demo decisions differ: " + name + "/" + policy)
    check(by_id[demo["id"]]["SMILES"] == demo["published_smiles"], "Demo SMILES changed: " + name)
review = {
    "review_status": "PASSED_SCIENCE_AND_LIVE_MODEL_COMPARISON" if not failures else "FAILED",
    "source": findings["source"], "source_metadata_reference": "https://zenodo.org/records/21504733",
    "source_attribution": "Expansion Therapeutics and the OpenADMET Consortium; CC BY 4.0",
    "reviewed_notebook_sha256": hashlib.sha256(NOTEBOOK.read_bytes()).hexdigest(),
    "reviewed_scientific_engine_sha256": hashlib.sha256(core_text.encode()).hexdigest(),
    "verified_findings_sha256": hashlib.sha256((SOURCE_ROOT / "verified_findings.json").read_bytes()).hexdigest(),
    "live_model_evidence_sha256": hashlib.sha256((ROOT / "evidence" / "live-baseline.json").read_bytes()).hexdigest(),
    "independent_numeric_implementation": "Separate Decimal parser/classifier and AND-gate evaluator; no notebook parsing/classification functions used for the reference decisions",
    "source_checksum": "independently recomputed MD5 and SHA-256", "embedded_source_matches_raw_file": True,
    "raw_unique_ids": len(rows), "valid_structure_ids": cloud_chemistry["valid_molecule_ids"],
    "raw_counts_survive_full_chemistry_audit": True,
    "default_gate_counts": {"interval": independent_summary(expected), "discard_censored": independent_summary(dropped)},
    "extra_settled_valid_id_decisions": sum(a["status"] != b["status"] for a, b in zip(expected, dropped)),
    "all_live_exported_per_id_decisions_compared": len(expected), "all_live_exported_per_id_gates_compared": len(expected) * len(keys),
    "live_per_id_and_gate_agreement": expected == export["molecule_decisions"],
    "endpoint_subsets_independently_recomputed": len(findings["settings"]),
    "sensitivity_settings_independently_recomputed": sum(len(x["rows"]) for x in findings["threshold_sensitivity"].values()),
    "live_source_and_chemistry_comparison": {"invalid_ids": [], "multi_fragment_ids": [], "distinct_isomeric_structures": cloud_chemistry["distinct_isomeric_structures"],
                                             "repeated_structure_id_groups": cloud_chemistry["repeated_structure_id_groups"],
                                             "source_audit": "exact equality", "first_failure_and_assay_opportunity": "exact independent agreement"},
    "stereochemistry_evidence": {"source": "Full RDKit audit in the connected Linux molab runtime; not independently rerun on Windows",
                                "ids_with_specified_atom_stereochemistry": cloud_chemistry["ids_with_specified_atom_stereochemistry"],
                                "ids_with_specified_bond_stereochemistry": cloud_chemistry["ids_with_specified_bond_stereochemistry"],
                                "ids_with_unassigned_potential_atom_stereocenters": cloud_chemistry["ids_with_unassigned_potential_atom_stereocenters"],
                                "demo_assigned_atom_centers": {name: case["stereochemistry"]["specified_atom_stereocenters"] for name, case in findings["demo_cases"].items() if "id" in case},
                                "live_separate_stereo_counters": "NOT_PRESENT_IN_BASELINE_EXPORT", "visual_depiction_review": "PENDING"},
    "browser_validation": "PENDING", "fresh_molab_validation": "PENDING", "submission_ready": False,
    "failures": failures,
    "scope_note": "Science/model comparison only. This does not certify browser synchronization, depiction quality, strict static/export completion, or a fresh molab session. Later source edits need matching engine hash or repeat review.",
}
(SOURCE_ROOT / "INDEPENDENT_REVIEW.json").write_text(json.dumps(review, indent=2), encoding="utf-8")
print(json.dumps({key: review[key] for key in ["review_status", "valid_structure_ids", "raw_counts_survive_full_chemistry_audit", "all_live_exported_per_id_decisions_compared", "all_live_exported_per_id_gates_compared", "endpoint_subsets_independently_recomputed", "sensitivity_settings_independently_recomputed", "extra_settled_valid_id_decisions", "failures"]}, indent=2))
if failures:
    raise SystemExit(1)
