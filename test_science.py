"""Semantic tests against the interval engine embedded in the delivered notebook.

The fixtures below are intentionally synthetic and are never notebook data.
Run with Python's standard library: python test_science.py
"""
import itertools
import pathlib
import random
import textwrap
import types
import unittest

NOTEBOOK = pathlib.Path(__file__).with_name("notebook.py" if pathlib.Path(__file__).with_name("notebook.py").exists() else "missing_molecules.py")
source = NOTEBOOK.read_text(encoding="utf-8")
core_text = textwrap.dedent(source.split("# CORE_START:", 1)[1].split("\n", 1)[1].split("    # CORE_END", 1)[0])
core = types.ModuleType("tested_notebook_core")
exec(compile(core_text, str(NOTEBOOK), "exec"), core.__dict__)


def record(compound_id, ksol="20", hlm="20", papp="2", efflux="1"):
    return {"id": compound_id, "smiles": "CCO", "measurements": {key: core.apply_domain(core.parse_measurement(value), key) for key, value in zip(core.ENDPOINTS, [ksol, hlm, papp, efflux])}}


class IntervalSemantics(unittest.TestCase):
    def assert_status(self, raw, direction, threshold, expected):
        self.assertEqual(core.classify_measurement(core.parse_measurement(raw), direction, threshold), expected)

    def test_exact_inclusive_boundary(self):
        self.assert_status("10", "min", 10, "pass")
        self.assert_status("10", "max", 10, "pass")

    def test_open_upper_boundary(self):
        self.assert_status("<10", "min", 10, "fail")
        self.assert_status("<=10", "min", 10, "unresolved")

    def test_open_lower_boundary(self):
        self.assert_status(">10", "max", 10, "fail")
        self.assert_status(">=10", "max", 10, "unresolved")

    def test_censored_values_can_prove_pass(self):
        self.assert_status(">100", "min", 10, "pass")
        self.assert_status("<5", "max", 10, "pass")

    def test_censored_values_can_prove_failure(self):
        self.assert_status("<5", "min", 10, "fail")
        self.assert_status(">100", "max", 10, "fail")

    def test_threshold_can_change_certainty(self):
        self.assert_status("<20", "min", 30, "fail")
        self.assert_status("<20", "min", 10, "unresolved")

    def test_unicode_and_scientific_notation(self):
        self.assert_status("≥ 1e2", "min", 100, "pass")
        self.assert_status("≤ .5", "max", .5, "pass")

    def test_separate_modifier(self):
        m = core.parse_measurement("100", ">")
        self.assertEqual(m["kind"], "censored")
        self.assertEqual(core.classify_measurement(m, "min", 10), "pass")

    def test_missing_and_invalid_never_certify(self):
        for raw in [None, "", "NaN", "NA", "NULL", "garbage", "~10", "1e999", "Infinity"]:
            self.assert_status(raw, "min", 0, "unresolved")
        for raw in ["-1", "<0"]:
            m = core.apply_domain(core.parse_measurement(raw), "ksol")
            self.assertEqual(m["kind"], "invalid")
            self.assertEqual(core.classify_measurement(m, "min", 0), "unresolved")

    def test_bad_direction_and_threshold_rejected(self):
        for direction, t in [("bad", 10), ("min", float("nan")), ("max", float("inf"))]:
            with self.assertRaises(ValueError):
                core.classify_measurement(core.parse_measurement("10"), direction, t)

    def test_ambiguous_qualifier_rejected(self):
        for value, mod in [("<5", ">"), ("5", "approx"), ("5", "?")]:
            self.assertEqual(core.parse_measurement(value, mod)["kind"], "unparsed")

    def test_physical_domain_intersects_censored_interval(self):
        m = core.apply_domain(core.parse_measurement("<5"), "ksol")
        self.assertEqual((m["lo"], m["lo_open"], m["hi"], m["hi_open"]), (0, False, 5, True))
        self.assertEqual(core.classify_measurement(m, "min", 0), "pass")
        self.assertEqual(core.stringify_interval(m), "[0, 5)")

    def test_domain_boundary_does_not_create_an_exact_observation(self):
        m = core.apply_domain(core.parse_measurement("<=0"), "ksol")
        self.assertEqual(m["kind"], "censored")
        self.assertEqual((m["lo"], m["hi"]), (0, 0))
        self.assertEqual(core.classify_measurement(m, "max", 0), "pass")
        self.assertEqual(core.apply_domain(core.parse_measurement("<0"), "ksol")["kind"], "invalid")

    def test_positive_bound_preserves_open_lower_endpoint(self):
        m = core.apply_domain(core.parse_measurement(">0"), "ksol")
        self.assertTrue(m["lo_open"])
        self.assertEqual(core.classify_measurement(m, "max", 0), "fail")

    def test_qualifier_around_zero_respects_the_physical_domain(self):
        m = core.apply_domain(core.parse_measurement(">-1"), "ksol")
        self.assertEqual((m["lo"], m["lo_open"]), (0, False))
        self.assertEqual(core.classify_measurement(m, "min", 0), "pass")

    def test_finite_witnesses_agree_with_interval_certificates(self):
        # Independent sampled witnesses check that a claimed certificate cannot
        # contradict a value inside an exact or bounded evidence set.
        probes = [-1, 0, .5, 1, 4.99, 5, 5.01, 10, 20, 100]
        for raw in ["0", "5", "<5", "<=5", ">5", ">=5"]:
            m = core.apply_domain(core.parse_measurement(raw), "ksol")
            witnesses = [x for x in probes if
                         (x > m["lo"] or (x == m["lo"] and not m["lo_open"])) and
                         (x < m["hi"] or (x == m["hi"] and not m["hi_open"]))]
            for direction in ["min", "max"]:
                for threshold in [0, 1, 5, 10]:
                    status = core.classify_measurement(m, direction, threshold)
                    outcomes = [x >= threshold if direction == "min" else x <= threshold for x in witnesses]
                    if status == "pass":
                        self.assertTrue(all(outcomes), (raw, direction, threshold))
                    if status == "fail":
                        self.assertTrue(not any(outcomes), (raw, direction, threshold))


class PopulationSemantics(unittest.TestCase):
    def setUp(self):
        self.thresholds = {key: spec["default"] for key, spec in core.ENDPOINTS.items()}
        self.keys = list(core.ENDPOINTS)
        self.records = [record("A"), record("B", ksol="<5"), record("C", hlm=""),
                        record("D", ksol=">100", hlm="<20"), record("E", ksol="", hlm=">100"),
                        record("F", ksol="", hlm="", papp="")]

    def test_all_gate_logic_and_denominator(self):
        r = core.evaluate_records(self.records, self.keys, self.thresholds)
        self.assertEqual([x["status"] for x in r], ["pass", "fail", "unresolved", "pass", "fail", "unresolved"])
        self.assertEqual(core.summarize(r), {"n": 6, "pass": 2, "fail": 2, "unresolved": 2, "lower": 2, "upper": 4, "complete_decisions": 4})

    def test_one_failure_overrides_missing(self):
        r = core.evaluate_records([record("X", ksol="", hlm=">100")], self.keys, self.thresholds)
        self.assertEqual(r[0]["status"], "fail")

    def test_order_cannot_change_final_decision(self):
        baseline = core.evaluate_records(self.records, self.keys, self.thresholds)
        for order in itertools.permutations(self.keys):
            permuted = core.evaluate_records(self.records, list(order), self.thresholds)
            self.assertEqual([r["status"] for r in baseline], [r["status"] for r in permuted])
            attribution = core.first_failure_attribution(permuted, list(order))
            self.assertEqual(sum(x["first_fail"] for x in attribution), core.summarize(permuted)["fail"])

    def test_order_changes_attribution_for_multi_failure(self):
        r = core.evaluate_records([record("X", ksol="1", hlm="100")], ["ksol", "hlm"], self.thresholds)
        self.assertEqual(core.first_failure_attribution(r, ["ksol", "hlm"])[0]["first_fail"], 1)
        self.assertEqual(core.first_failure_attribution(r, ["hlm", "ksol"])[0]["first_fail"], 1)

    def test_information_loss_only_widens_bounds(self):
        rng = random.Random(42)
        raw_options = ["", "1", "10", "100", "<5", "<20", ">100", ">=10", "<=50"]
        records = [record(str(i), **dict(zip(self.keys, [rng.choice(raw_options) for _ in self.keys]))) for i in range(400)]
        for size in range(1, 5):
            for keys in itertools.combinations(self.keys, size):
                exact = core.summarize(core.evaluate_records(records, list(keys), self.thresholds, True))
                interval = core.summarize(core.evaluate_records(records, list(keys), self.thresholds))
                self.assertLessEqual(exact["lower"], interval["lower"])
                self.assertGreaterEqual(exact["upper"], interval["upper"])
                self.assertGreaterEqual(exact["unresolved"], interval["unresolved"])

    def test_adding_gates_never_creates_a_new_pass(self):
        for size in range(1, 4):
            for keys in itertools.combinations(self.keys, size):
                old = {r["id"] for r in core.evaluate_records(self.records, list(keys), self.thresholds) if r["status"] == "pass"}
                for key in set(self.keys) - set(keys):
                    new = {r["id"] for r in core.evaluate_records(self.records, list(keys) + [key], self.thresholds) if r["status"] == "pass"}
                    self.assertTrue(new <= old)

    def test_only_blocker_counts(self):
        result = core.evaluate_records(self.records, self.keys, self.thresholds)
        counts = {r["endpoint"]: r for r in core.assay_priority(result, self.keys)}
        self.assertEqual(counts["hlm"]["single_blocker"], 1)
        self.assertEqual(counts["hlm"]["any_blocker"], 2)
        self.assertEqual(counts["ksol"]["any_blocker"], 1)

    def test_empty_gate_set_rejected(self):
        with self.assertRaises(ValueError):
            core.evaluate_records(self.records, [], self.thresholds)

    def test_duplicate_and_unknown_gates_rejected(self):
        for keys in [["ksol", "ksol"], ["invented_endpoint"]]:
            with self.assertRaises(ValueError):
                core.evaluate_records(self.records, keys, self.thresholds)

    def test_adding_gate_can_only_shrink_compatible_shortlist(self):
        for size in range(1, 4):
            for keys in itertools.combinations(self.keys, size):
                old = core.summarize(core.evaluate_records(self.records, list(keys), self.thresholds))
                for key in set(self.keys) - set(keys):
                    new = core.summarize(core.evaluate_records(self.records, list(keys) + [key], self.thresholds))
                    self.assertLessEqual(new["lower"], old["lower"])
                    self.assertLessEqual(new["upper"], old["upper"])

    def test_single_blocker_is_subset_of_any_blocker(self):
        result = core.evaluate_records(self.records, self.keys, self.thresholds)
        for row in core.assay_priority(result, self.keys):
            self.assertLessEqual(row["single_blocker"], row["any_blocker"])


class SourceSchema(unittest.TestCase):
    HEADER = "Molecule Name,SMILES,KSOL,HLM CLint,Caco-2 Permeability Papp A>B,Caco-2 Permeability Efflux"

    def test_direct_qualifiers_preserved(self):
        records, diag = core.records_from_csv(self.HEADER + "\nE-1,CCO,>100,<5,2,1\n")
        self.assertEqual(records[0]["measurements"]["ksol"]["kind"], "censored")
        self.assertEqual(diag["raw_rows"], 1)

    def test_separate_qualifier_columns(self):
        records, _ = core.records_from_csv(self.HEADER + ",KSOL Modifier\nE-1,CCO,100,5,2,1,>\n")
        self.assertEqual(records[0]["measurements"]["ksol"]["raw"], ">100")

    def test_identical_duplicates_explicitly_counted(self):
        row = "E-1,CCO,20,20,2,1\n"
        records, diag = core.records_from_csv(self.HEADER + "\n" + row + row)
        self.assertEqual(len(records), 1)
        self.assertEqual(diag["identical_rows_removed"], 1)

    def test_conflicting_ids_fail_closed(self):
        with self.assertRaises(ValueError):
            core.records_from_csv(self.HEADER + "\nE-1,CCO,20,20,2,1\nE-1,CCO,30,20,2,1\n")

    def test_unrecognized_schema_fail_closed(self):
        with self.assertRaises(ValueError):
            core.records_from_csv("id,SMILES,unexpected\nE-1,CCO,3\n")

    def test_short_and_long_rows_fail_closed(self):
        for row in ["E-1,CCO,20,20,2\n", "E-1,CCO,20,20,2,1,extra\n"]:
            with self.assertRaises(ValueError):
                core.records_from_csv(self.HEADER + "\n" + row)

    def test_duplicate_headers_fail_closed(self):
        with self.assertRaises(ValueError):
            core.records_from_csv(self.HEADER + ",KSOL\nE-1,CCO,20,20,2,1,100\n")

    def test_ambiguous_normalized_headers_fail_closed(self):
        with self.assertRaises(ValueError):
            core.records_from_csv(self.HEADER + ",K-SOL\nE-1,CCO,20,20,2,1,100\n")

    def test_utf8_bom_and_stereochemical_smiles_preserved(self):
        smiles = "F/C=C/[C@H](O)C.[Na+]"
        data = ("\ufeff" + self.HEADER + "\nE-1," + smiles + ",20,20,2,1\n").encode("utf-8")
        records, _ = core.records_from_csv(data)
        self.assertEqual(records[0]["smiles"], smiles)

    def test_missing_identifier_rejected(self):
        with self.assertRaises(ValueError):
            core.records_from_csv(self.HEADER + "\n,CCO,20,20,2,1\n")


if __name__ == "__main__":
    unittest.main(verbosity=2)
