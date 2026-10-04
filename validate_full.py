"""Audit the pinned raw release, test real evidence, and embed verified bytes.

No runtime, browser, molab, publication, or submission claim follows from this
script. Use --no-embed to write findings without modifying the notebook.
Use --source-only only when chemistry cannot run; all counts are then explicitly
raw published-ID counts and full validation remains incomplete.
"""
import argparse
import ast
import base64
import collections
import csv
import hashlib
import importlib.metadata
import io
import itertools
import json
import os
import pathlib
import re
import sys
import textwrap
import types
import urllib.request
import zlib

ROOT = pathlib.Path(__file__).resolve().parent
NOTEBOOK = ROOT / os.environ.get("TEST_NOTEBOOK", "notebook.py" if (ROOT / "notebook.py").exists() else "missing_molecules.py")
SENSITIVITY_GRID = {"ksol": [0, 1, 5, 10, 20, 50, 100, 200],
                    "hlm": [0, 5, 10, 25, 50, 100, 200, 300],
                    "papp": [0, .5, 1, 2, 5, 10, 20],
                    "efflux": [0, .5, 1, 2, 3, 5, 10, 20]}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_core():
    text = NOTEBOOK.read_text(encoding="utf-8")
    core_text = textwrap.dedent(text.split("# CORE_START:", 1)[1].split("\n", 1)[1].split("    # CORE_END", 1)[0])
    core = types.ModuleType("notebook_evidence_core")
    exec(compile(core_text, str(NOTEBOOK), "exec"), core.__dict__)
    return core, text


def load_raw(core):
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    raw_path = data_dir / "expansion_data_raw.csv"
    if raw_path.exists():
        raw = raw_path.read_bytes()
    else:
        request = urllib.request.Request(core.DATA_URL, headers={"User-Agent": "MissingMoleculesValidation/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read()
        require(hashlib.md5(raw).hexdigest() == core.SOURCE_MD5, "Downloaded checksum differs from the published checksum; investigate provenance")
        raw_path.write_bytes(raw)
    require(hashlib.md5(raw).hexdigest() == core.SOURCE_MD5, "Local checksum differs from the published checksum; investigate provenance")
    return raw


def inspect_raw_source(core, raw, audit):
    """Inspect literal source cells independently of the decision classifications."""
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    rows = list(reader)
    schema = audit["schema"]
    identifiers = collections.Counter((row[schema["id"]] or "").strip() for row in rows)
    endpoints = {}
    for key, columns in schema["endpoints"].items():
        values = collections.Counter((row[columns["value"]] or "").strip() for row in rows)
        qualifiers = collections.Counter()
        for value, count in values.items():
            match = re.match(r"^(<=|>=|<|>|=|≤|≥)", value)
            category = "missing" if value.lower() in core.MISSING_TOKENS else (match.group(0) if match else "no_inline_qualifier")
            qualifiers[category] += count
        endpoints[key] = {"literal_qualifier_counts": dict(qualifiers),
                          "censored_literal_values": {v: n for v, n in values.items() if re.match(r"^[<>≤≥]", v)},
                          "separate_modifier_column": columns["modifier"],
                          "separate_modifier_values": dict(collections.Counter(row[columns["modifier"]] for row in rows)) if columns["modifier"] else {}}
    return {"headers": reader.fieldnames, "raw_rows": len(rows), "unique_published_ids": len(identifiers),
            "repeated_ids": {key: n for key, n in identifiers.items() if n > 1},
            "malformed_row_numbers": [i + 2 for i, row in enumerate(rows) if None in row or any(v is None for v in row.values())],
            "endpoints": endpoints,
            "row_policy": "One retained record per published ID; identical full rows removed and conflicting repeated IDs stop execution. No assay averaging."}


def audit_chemistry(records):
    from rdkit import Chem

    valid, invalid_ids, canonical, nonisomeric = [], [], {}, {}
    fragments, specified_atom_ids, specified_bond_ids, unassigned_ids = [], [], [], []
    stereo_by_id = {}
    for record in records:
        mol = Chem.MolFromSmiles(record["smiles"])
        if mol is None or mol.GetNumAtoms() == 0:
            invalid_ids.append(record["id"])
            continue
        iso = Chem.MolToSmiles(mol, isomericSmiles=True)
        noniso = Chem.MolToSmiles(mol, isomericSmiles=False)
        canonical.setdefault(iso, []).append(record["id"])
        nonisomeric.setdefault(noniso, {}).setdefault(iso, []).append(record["id"])
        fragment_count = len(Chem.GetMolFrags(mol))
        if fragment_count > 1:
            fragments.append({"id": record["id"], "fragments": fragment_count, "published_smiles": record["smiles"]})
        assigned_atoms = sum(a.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED for a in mol.GetAtoms())
        assigned_bonds = sum(b.GetStereo() not in (Chem.BondStereo.STEREONONE, Chem.BondStereo.STEREOANY) for b in mol.GetBonds())
        unassigned = sum(label == "?" for _, label in Chem.FindMolChiralCenters(mol, includeUnassigned=True, useLegacyImplementation=False))
        stereo_by_id[record["id"]] = {"specified_atom_stereocenters": assigned_atoms, "specified_stereo_bonds": assigned_bonds,
                                      "unassigned_potential_atom_stereocenters": unassigned}
        if assigned_atoms:
            specified_atom_ids.append(record["id"])
        if assigned_bonds:
            specified_bond_ids.append(record["id"])
        if unassigned:
            unassigned_ids.append(record["id"])
        valid.append(record)
    require(bool(valid), "No nonempty valid structures")
    repeated = [ids for ids in canonical.values() if len(ids) > 1]
    stereo_variants = [variants for variants in nonisomeric.values() if len(variants) > 1]
    chemistry = {"valid_molecule_ids": len(valid), "invalid_ids": invalid_ids,
                 "distinct_isomeric_structures": len(canonical), "repeated_structure_groups": len(repeated),
                 "repeated_structure_id_groups": repeated, "multi_fragment_ids": [row["id"] for row in fragments],
                 "multi_fragment_examples": fragments[:10], "ids_with_specified_atom_stereochemistry": len(specified_atom_ids),
                 "ids_with_specified_bond_stereochemistry": len(specified_bond_ids),
                 "ids_with_unassigned_potential_atom_stereocenters": len(unassigned_ids),
                 "nonisomeric_groups_with_multiple_isomeric_smiles": len(stereo_variants),
                 "stereochemical_variant_examples": [list(variants.values()) for variants in stereo_variants[:8]],
                 "policy": "Keep published structures, stereochemistry, fragments and tautomers unchanged. Canonical groups are diagnostic only; analysis counts remain published IDs. Unassigned stereochemistry is not invented. Multi-fragment alone does not establish a salt identity."}
    return valid, chemistry, stereo_by_id


def evaluate_setting(core, records, keys, thresholds, check_all_orders=False):
    result = core.evaluate_records(records, keys, thresholds)
    dropped = core.evaluate_records(records, keys, thresholds, True)
    summary, dropped_summary = core.summarize(result), core.summarize(dropped)
    require(summary["pass"] + summary["fail"] + summary["unresolved"] == len(records), "Decision counts do not exhaust the valid-ID denominator")
    require(dropped_summary["lower"] <= summary["lower"] <= summary["upper"] <= dropped_summary["upper"], "Discarding evidence narrowed the shortlist bounds")
    changes = []
    for row, exact_row in zip(result, dropped):
        require(row["id"] == exact_row["id"], "Evidence policies changed the ID order")
        if row["status"] != exact_row["status"]:
            require(exact_row["status"] == "unresolved" and row["status"] in {"pass", "fail"}, "Removing censor bounds created a certificate")
            changes.append({"id": row["id"], "using_bounds": row["status"], "discarding_bounds": exact_row["status"]})
    if check_all_orders:
        baseline = [(r["id"], r["status"]) for r in result]
        for order in itertools.permutations(keys):
            reordered = core.evaluate_records(records, list(order), thresholds)
            require([(r["id"], r["status"]) for r in reordered] == baseline, "Gate order changed the final decision")
            require(sum(a["first_fail"] for a in core.first_failure_attribution(result, list(order))) == summary["fail"], "First-failure attribution does not exhaust established failures")
    opportunity = core.assay_priority(result, keys)
    require(all(0 <= r["single_blocker"] <= r["any_blocker"] <= summary["unresolved"] for r in opportunity), "Invalid assay-opportunity denominator")
    return {"interval": summary, "discard_censored": dropped_summary, "changed_decisions": len(changes), "examples": changes[:8],
            "additional_certified_passes": summary["pass"] - dropped_summary["pass"],
            "additional_certified_failures": summary["fail"] - dropped_summary["fail"], "assay_opportunity": opportunity,
            "first_failure_forward": core.first_failure_attribution(result, keys),
            "first_failure_reversed": core.first_failure_attribution(result, keys[::-1])}, result, dropped


def demo_record(core, record, keys, thresholds, stereo_by_id):
    return {"id": record["id"], "published_smiles": record["smiles"], "enabled": keys,
            "thresholds": {key: thresholds[key] for key in keys},
            "using_bounds": core.evaluate_records([record], keys, thresholds)[0],
            "discarding_bounds": core.evaluate_records([record], keys, thresholds, True)[0],
            "evidence": {key: {"raw": record["measurements"][key]["raw"], "kind": record["measurements"][key]["kind"],
                               "interval": core.stringify_interval(record["measurements"][key]), "unit": core.ENDPOINTS[key]["unit"]} for key in keys},
            "stereochemistry": stereo_by_id[record["id"]]}


def select_demo_cases(core, records, thresholds, stereo_by_id):
    keys = ["ksol", "hlm", "papp"]
    results = core.evaluate_records(records, keys, thresholds)
    dropped = core.evaluate_records(records, keys, thresholds, True)
    candidates = list(zip(records, results, dropped))
    # Prefer explicitly specified stereochemistry, then stable published-ID order.
    candidates.sort(key=lambda x: (-bool(stereo_by_id[x[0]["id"]]["specified_atom_stereocenters"] or stereo_by_id[x[0]["id"]]["specified_stereo_bonds"] or stereo_by_id[x[0]["id"]].get("published_smiles_has_stereo_marker")), x[0]["id"]))
    predicates = {"censor_bound_certifies_pass": lambda r, d: r["status"] == "pass" and d["status"] == "unresolved",
                  "censor_bound_certifies_failure": lambda r, d: r["status"] == "fail" and d["status"] == "unresolved",
                  "unresolved_under_defaults": lambda r, d: r["status"] == "unresolved",
                  "fails_multiple_default_gates": lambda r, d: sum(s == "fail" for s in r["gates"].values()) > 1}
    cases = {}
    for name, predicate in predicates.items():
        match = next((record for record, result, exact_result in candidates if predicate(result, exact_result)), None)
        cases[name] = demo_record(core, match, keys, thresholds, stereo_by_id) if match else {"available": False, "reason": "No case satisfies this criterion at the default three gates"}
    transition = None
    for record, _, _ in candidates:
        for key in keys:
            measurement = record["measurements"][key]
            if measurement["kind"] != "censored":
                continue
            options = {t: core.classify_measurement(measurement, core.ENDPOINTS[key]["direction"], t) for t in SENSITIVITY_GRID[key]}
            certificates = [(t, status) for t, status in options.items() if status in {"pass", "fail"}]
            unresolved = [t for t, status in options.items() if status == "unresolved"]
            if certificates and unresolved:
                certified = min(certificates, key=lambda pair: abs(pair[0] - thresholds[key]))
                inconclusive = min(unresolved, key=lambda t: abs(t - thresholds[key]))
                transition = demo_record(core, record, [key], thresholds, stereo_by_id)
                transition.update({"endpoint": key, "reported": measurement["raw"], "certifying_threshold": certified[0],
                                   "certifying_gate_status": certified[1], "inconclusive_threshold": inconclusive, "inconclusive_gate_status": "unresolved",
                                   "interaction": "Enable only this endpoint; move its threshold between these values. Both are on the notebook slider grid."})
                break
        if transition:
            break
    cases["same_observation_threshold_transition"] = transition or {"available": False}
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-embed", action="store_true", help="Write findings without modifying the notebook")
    parser.add_argument("--source-only", action="store_true", help="Audit raw published IDs without claiming a valid-structure denominator")
    parser.add_argument("--chemistry-blocker", default="Not run in explicitly requested source-only mode", help="Document the observed chemistry-runtime blocker")
    args = parser.parse_args()
    core, notebook_text = load_core()
    raw = load_raw(core)
    records, audit = core.records_from_csv(raw)
    raw_audit = inspect_raw_source(core, raw, audit)
    require(not raw_audit["malformed_row_numbers"], "Malformed source rows")
    embedded_match = re.search(r'embedded_raw_b64 = "([A-Za-z0-9+/=]+)"', notebook_text)
    embedded_verified = bool(embedded_match) and zlib.decompress(base64.b64decode(embedded_match.group(1))) == raw
    if args.no_embed:
        require(embedded_verified, "Existing embedded source differs from verified raw bytes")
    if args.source_only:
        population = records
        chemistry = {"status": "BLOCKED" if args.chemistry_blocker != "Not run in explicitly requested source-only mode" else "NOT_RUN",
                     "valid_molecule_ids": None, "invalid_ids": None,
                     "distinct_isomeric_structures": None, "repeated_structure_groups": None,
                     "multi_fragment_ids": None, "reason": args.chemistry_blocker}
        stereo_by_id = {record["id"]: {"specified_atom_stereocenters": None, "specified_stereo_bonds": None,
                                      "unassigned_potential_atom_stereocenters": None,
                                      "published_smiles_has_stereo_marker": any(marker in record["smiles"] for marker in ["@", "/", "\\"]),
                                      "verification": "Raw string inspection only; no RDKit structural or stereochemistry validation"} for record in records}
        population_kind = "raw source published molecule IDs; valid-structure filtering and chemical identity are unverified"
    else:
        population, chemistry, stereo_by_id = audit_chemistry(records)
        chemistry["status"] = "PASSED"
        population_kind = "valid, nonempty RDKit-parsed published molecule IDs"
    thresholds = {key: spec["default"] for key, spec in core.ENDPOINTS.items()}
    settings = {}
    for size in range(1, len(core.ENDPOINTS) + 1):
        for keys in itertools.combinations(core.ENDPOINTS, size):
            keys = list(keys)
            setting, _, _ = evaluate_setting(core, population, keys, thresholds, check_all_orders=True)
            settings["+".join(keys)] = setting
    for keyset, setting in settings.items():
        keys = set(keyset.split("+"))
        for other, expanded in settings.items():
            if keys < set(other.split("+")):
                require(expanded["interval"]["lower"] <= setting["interval"]["lower"] and expanded["interval"]["upper"] <= setting["interval"]["upper"], "Adding gates enlarged a shortlist bound")
    sensitivity = {}
    for key, values in SENSITIVITY_GRID.items():
        keys = ["ksol", "hlm", "papp"] if key != "efflux" else list(core.ENDPOINTS)
        rows = []
        for value in values:
            setting, _, _ = evaluate_setting(core, population, keys, {**thresholds, key: value})
            rows.append({"threshold": value, **{name: setting[name] for name in ["interval", "discard_censored", "additional_certified_passes", "additional_certified_failures"]}})
        sensitivity[key] = {"enabled": keys, "unit": core.ENDPOINTS[key]["unit"], "direction": core.ENDPOINTS[key]["direction"],
                            "other_thresholds": {k: thresholds[k] for k in keys if k != key},
                            "interpretation": "Illustrative one-threshold-at-a-time sensitivity, not optimization or discovered drug-selection targets.", "rows": rows}
    demos = select_demo_cases(core, population, thresholds, stereo_by_id)
    population_kinds = {key: dict(collections.Counter(r["measurements"][key]["kind"] for r in population)) for key in core.ENDPOINTS}
    anomalies = {key: [{"id": r["id"], "raw": r["measurements"][key]["raw"], "reason": r["measurements"][key]["reason"]} for r in records if r["measurements"][key]["kind"] in {"unparsed", "invalid"}][:20] for key in core.ENDPOINTS}
    full_status = "PENDING_VALID_STRUCTURE_DENOMINATOR" if args.source_only else "PASSED"
    findings = {"full_data_logic_checks": full_status, "raw_id_engine_logic_checks": "PASSED",
                "source_verified": "PASSED", "validation_mode": "source_only" if args.source_only else "full",
                "marimo_execution": "PENDING", "browser_validation": "PENDING", "molab_validation": "PENDING",
                "source": {"url": core.DATA_URL, "revision": core.REVISION, "md5": core.SOURCE_MD5, "sha256": audit["sha256"], "bytes": len(raw)},
                "source_audit": audit, "literal_source_audit": raw_audit, "chemistry_audit": chemistry,
                "analysis_denominator": {"kind": population_kind, "n": len(population),
                                         "valid_structure_n": None if args.source_only else len(population),
                                         "measurement_kinds": population_kinds, "source_anomaly_examples": anomalies},
                "thresholds": thresholds, "settings": settings, "threshold_sensitivity": sensitivity, "demo_cases": demos,
                "demo_ids": list(dict.fromkeys(case["id"] for case in demos.values() if "id" in case)),
                "validation_scope": {"endpoint_subsets": len(settings), "all_gate_orders_checked": True,
                                     "censor_removal_monotonicity": "every row and aggregate", "adding_gates_monotonicity": "all nested endpoint subsets",
                                     "assay_opportunity_denominators": "single blocker <= any blocker <= unresolved IDs", "threshold_sensitivity_settings": sum(len(x["rows"]) for x in sensitivity.values())},
                "environment": {"python": sys.version, **{p: importlib.metadata.version(p) for p in ["marimo", "rdkit", "anywidget", "traitlets"]}}}
    if not args.no_embed:
        encoded = base64.b64encode(zlib.compress(raw, level=9)).decode("ascii")
        updated, count = re.subn(r'^    embedded_raw_b64 = "[A-Za-z0-9+/=]*"$', '    embedded_raw_b64 = "' + encoded + '"', notebook_text, count=1, flags=re.MULTILINE)
        require(count == 1, "Could not find the unique source-embedding marker")
        ast.parse(updated)
        NOTEBOOK.write_text(updated, encoding="utf-8")
    findings["embedded_verified_source"] = embedded_verified or not args.no_embed
    findings["data_embedding_this_run"] = "NOT_REQUESTED" if args.no_embed else "PASSED"
    (ROOT / "verified_findings.json").write_text(json.dumps(findings, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({"full_data_logic_checks": full_status, "raw_id_engine_logic_checks": "PASSED", "source_rows": audit["raw_rows"],
                      "analysis_population": population_kind, "analysis_ids": len(population), "valid_molecule_ids": None if args.source_only else len(population),
                      "default_gates": settings["ksol+hlm+papp"], "demo_ids": findings["demo_ids"], "embedded_source_bytes": len(raw) if not args.no_embed else 0,
                      "next": "Run marimo check, execute/export, test real browser interaction, then validate in molab. Those checks remain pending."}, indent=2))


if __name__ == "__main__":
    main()
