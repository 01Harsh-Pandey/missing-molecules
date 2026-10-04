# Missing Molecules — 4:05 script with full-data findings

**Notebook science, chemistry, execution, browser and actual fresh-session validation passed; recording still pending.** This script now uses the full-mode findings from the Linux Python-backed molab runtime, not the earlier source-only results. RDKit accepted **all 7,618 published IDs as valid, nonempty structures**. Browser synchronization and the actual restarted molab session have passed. Use the validated replacement presentation link in EXECUTION_REPORT.md. Its fresh pinned kernel and live browser checks passed. The original sandbox termination and host editor limitation are documented there. No video has been recorded and no competition submission has been made.

Target duration: **4:05**, with a 3:50–4:20 rehearsal range and at least 40 seconds under the five-minute maximum. Leave time for reactive updates. These timestamps are pacing targets, not a measured recording duration.

## Verified numerical anchor

The full validation ran with Python **3.13.11**, marimo **0.25.1**, RDKit **2026.3.6**, anywidget **0.9.18**, and traitlets **5.14.3**. `verified_findings.json` has `validation_mode="full"`, chemistry `PASSED`, and full-data logic `PASSED`. Its denominator is **7,618 valid, nonempty RDKit-parsed published molecule IDs**; zero structures were excluded. The earlier raw-ID counts survived unchanged because every published ID passed this structural audit.

Keep **KSOL ≥10 µM, HLM clearance ≤50 mL/min/kg, Papp A→B ≥1 ×10⁻⁶ cm/s**, with efflux disabled:

| Evidence policy | Established passes | Established failures | Unresolved IDs | Compatible shortlist |
|---|---:|---:|---:|---:|
| Keep exact values and assay bounds | 1,844 | 2,548 | 3,226 | 1,844–5,070 |
| Discard every censored measurement | 1,682 | 2,448 | 3,488 | 1,682–5,170 |

**Keeping bounds settles 262 additional decisions: 162 passes and 100 failures, or 3.4% of these valid-structure IDs.** These are logical decisions under the displayed illustrative goals, not predictions, clinical certification, or an estimate of outcomes from unperformed assays. The default three gates already show the effect; no threshold optimization is needed.

The 7,618 IDs represent **7,617 distinct canonical isomeric structures**. The duplicate structure group is **E-0001829 / E-0014119**, which remains two published IDs. There are no multi-fragment IDs in this release; no salt stripping or tautomer merging was performed. RDKit flags specified atom stereochemistry in 2,054 IDs, specified bond stereochemistry in 9, and unassigned potential atom stereocenters in 232. There are 549 nonisomeric groups containing multiple isomeric SMILES. These audit diagnostics do not imply independent samples or assign unpublished stereochemistry.

## Validation completed; recording checklist

1. Confirm the final notebook and latest full findings match this denominator, counts, thresholds, and demo IDs. Preserve published structures, units, and inequalities. Retain the duplicate-group disclosure and the three physically inconsistent assay-limit cells as unresolved evidence; valid structure does not imply valid measurement.
2. The final main notebook passed its strict static check, complete HTML/session execution, dependency check, and inspection of all 21 cells with zero exception outputs. The successful Linux dependency lock and execution evidence are included in the final reports.
3. Actual Python↔anywidget browser checks passed for threshold changes, endpoint enable/disable, zero endpoints, censor discard, molecule-ID search, no matching cards, molecule selection, endpoint focus, gate order, and JSON download. Downloaded per-ID decisions and tables agree with the scientific engine. Real RDKit stereochemical drawings, desktop and 390px layouts, table scrolling, and console/cell errors were checked.
4. An actual replacement molab runtime restart (PID 152 → 1726), all-cell execution, full verifier rerun, and fresh browser checks passed. Dependency resolution, structures, reactive controls, and JSON exports were rechecked. The final reports record the unchanged source hash, restart action, and results. Publication and sharing changes remain user actions.
5. Reproduce the timed path below, rehearse, and time the recording. Harsh must review the displayed evidence and narration before recording/submission. Do not claim domain-expert review or completed human review unless it actually occurs. If final repairs change the scientific outputs, revise this script against the new full findings before recording.

## Timed screen path and narration

Start at the hero in the final, fully run notebook. Set **All statuses**, clear search, use 12 cards, keep **discard censored measurements unchecked**, and restore the three default gates in **KSOL → HLM → Papp** order. Efflux stays disabled. Search changes displayed cards only; population metrics always use the full 7,618 valid-ID denominator.

| Time | Reproducible screen action | Narration |
|---|---|---|
| 0:00–0:20 | Show hero/question and source audit. | “I'm Harsh Pandey. Missing Molecules asks how missing and censored ADMET measurements change the shortlist we can certify under the same screening goals. I use the ExpansionRx release, credited to Expansion Therapeutics and the OpenADMET Consortium, to connect each observation with the decision it supports.” |
| 0:20–0:45 | Show default gates and EvidenceBoard metrics/range. | “These are editable, illustrative goals: solubility at least ten, clearance at most fifty, and permeability at least one, in the displayed units. Every enabled gate must pass. Green establishes a pass; red establishes a failure; amber is unresolved. The shortlist range is a logical bound, not a confidence interval.” |
| 0:45–1:12 | Search **E-0018881**, click its card, click HLM's gate name to focus details. Show its audited stereochemical structure. | “Here is E-0018881. Solubility is 242 and permeability is 1.48. Clearance is reported below 4.5, not exactly 4.5. Every possible nonnegative value below that limit passes the fifty clearance gate. Together, these observations establish a pass under all three goals. No missing value was filled in.” |
| 1:12–1:42 | Search/click **E-0002337**. Enable **only HLM**. Move HLM **50 → 5**, then restore **50** and the three default gates. | “The same observation can become inconclusive when the question changes. This ID has clearance below 8.6. With only the clearance gate enabled, it passes at fifty. Tighten the goal to five: some possible values pass, others fail, so the decision becomes unresolved. The measurement stayed the same; our requirement changed.” |
| 1:42–2:08 | With defaults restored, search/click **E-0011215**, then **E-0001829**. | “E-0011215 has solubility below 1.56, so it fails the ten-micromolar goal even though permeability is missing. One established failure is enough. E-0001829 instead has acceptable clearance but missing solubility and permeability. That evidence cannot establish an all-gates pass or a failure. Missing does not mean failing.” |
| 2:08–2:43 | Clear search. Check **discard censored measurements**; show board/comparison/takeaway; then uncheck it. | “Now discard every censored result, keeping the same goals. Across 7,618 IDs with valid structures, keeping limits settles 262 additional decisions: 162 passes and 100 failures. The compatible shortlist tightens from 1,682–5,170 to 1,844–5,070. Removing evidence can widen these bounds or leave them unchanged. These counts describe this release and these goals; they are not predictions.” |
| 2:43–3:18 | Search/click **E-0011211**. Show KSOL `< 1.56` and HLM `148.1`. Move HLM earlier than KSOL with the board arrow; show first-failure table before/after. | “This ID fails two gates: solubility and clearance. Initially, the first-failure table credits solubility. Move clearance earlier and that ID is attributed to clearance instead. Population attribution changes too, but the final shortlist stays fixed. A filtering waterfall tells an accounting story shaped by its order; it does not establish which assay caused the molecule's liabilities.” |
| 3:18–3:40 | Restore KSOL → HLM → Papp. Clear search. Show next-assay table; click Papp's gate name and verify its focus indicator; click **Download this question and its results**. | “For unresolved IDs, this table counts assays that are the only remaining unresolved gate. Resolving one could settle that ID either way. These are opportunities for decisive evidence, not probabilities of success. The JSON saves the goals, evidence policy, per-ID decisions, gate order, first failures, and assay opportunities.” |
| 3:40–4:05 | Open provenance/limitations and AI disclosure accordions. Show duplicate-group audit; end with the question visible. | “We count published IDs: one structure appears under two IDs, so these are not independent samples. Published structures and inequalities are retained. These criteria cannot establish clinical safety. OpenAI ChatGPT and Codex assisted with the concept, code, tests, and explanatory text. Harsh is responsible for final review and submission. Preserve the evidence before deciding what it rules in or out.” |

## Editor's verified cross-checks

- **E-0018881:** KSOL `242` µM, HLM `< 4.5` mL/min/kg → `[0, 4.5)`, Papp `1.48` ×10⁻⁶ cm/s. Defaults pass; discarding bounds makes HLM and the ID unresolved. RDKit confirms three specified atom stereocenters and no unassigned potential atom stereocenters.
- **E-0011215:** KSOL `< 1.56` µM → `[0, 1.56)`, HLM `20.4` mL/min/kg, Papp absent. Defaults fail; discarding bounds makes the ID unresolved.
- **E-0001829:** KSOL absent, HLM `4.7` mL/min/kg, Papp absent. Defaults unresolved. Canonical isomeric structure matches E-0014119; both IDs remain in the denominator.
- **E-0002337:** HLM `< 8.6` mL/min/kg → `[0, 8.6)`. HLM-only ≤50 passes; ≤5 is unresolved. RDKit confirms two specified atom stereocenters. Restore defaults afterwards.
- **E-0011211:** KSOL `< 1.56` µM and HLM `148.1` mL/min/kg both fail defaults; Papp absent. Swapping KSOL and HLM changes its first-failure credit and leaves its final failure unchanged.
- Forward attribution: KSOL **1,329**, HLM **706**, Papp **513**. Fully reversed: Papp **654**, HLM **1,016**, KSOL **878**. Both sum to **2,548** failures. The timed path swaps HLM/KSOL only; do not read fully reversed values for that swap.
- Single-unresolved-gate opportunities: Papp **1,092**, HLM **392**, KSOL **7**. Corresponding any-blocker counts: **2,815**, **2,070**, **115**. These concern unresolved IDs with no established failing gate; they do not promise that a repeated assay becomes uncensored.
- Physically inconsistent evidence: HLM `< 0.0` for **E-0017007**; Papp `< 0.00` for **E-0027111** and **E-0027124**. These remain invalid measurements classified unresolved, distinct from the zero invalid structures.

Source: the raw ExpansionRx/OpenADMET release, pinned revision `6b898ccc43d10d25b230fb09e22a6e30c30022b5`, **CC BY 4.0**, credited to Expansion Therapeutics and the OpenADMET Consortium. Official Hugging Face and Zenodo raw bytes matched MD5 `27fae3d509fb1d9fd97cc94a4c9cccec`; SHA-256 `f674ec74cca1146bc386f832a32d4b8d921d3c312f92cb436cc005901c724a3c`. The finalized notebook embeds those verified bytes. No imputation, model training, or substitution of synthetic observations is involved.

The chemistry/science audit validates these data statements. Depiction quality, live controls, final session execution, and actual fresh-session reproducibility passed their separate checks; evidence is in the final reports. AI assistance is disclosed; no completed human or domain-expert review is claimed by this script.
