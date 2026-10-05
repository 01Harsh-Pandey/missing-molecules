# Missing Molecules — voice-over guide

**Optional recording notes.** This file is included so narration can follow the verified findings and screen actions. It is not needed to open or run the notebook.

A **4:05 silent walkthrough**, recorded at **1920 × 1080**, is available in the [video pack](https://github.com/01Harsh-Pandey/missing-molecules/actions/runs/37258807307/artifacts/11324072189). It shows genuine browser interactions with the published notebook source in native Python, using the declared dependencies. The chapter labels and cursor highlight are recording annotations. It does not demonstrate that molab's editor startup problems are fixed.

The pack includes the MP4, this timed narration, a CSV timing sheet, chapter subtitles, screenshots from the finished video, and the recording report. The recording had no page or console errors, and its demonstrated decisions and JSON exports were checked against the scientific results.

Record one voice clip per row below and place it at that row's start time in your editor. Listen through the combined video, adjust your pacing, and export the final video under five minutes. Only the on-screen walkthrough has been recorded; no voice track or competition entry has been submitted.

Use the [permanent molab notebook](https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py) for the competition entry. Sign in, select **Server**, and confirm **Run on server** if prompted. The hosted editor/presentation limitations remain documented in [COMPETITION_REVIEW.md](COMPETITION_REVIEW.md).

## Verified numerical anchor

The full validation ran with Python **3.13.11**, marimo **0.25.1**, RDKit **2026.3.6**, anywidget **0.9.18**, and traitlets **5.14.3**. `verified_findings.json` has `validation_mode="full"`, chemistry `PASSED`, and full-data logic `PASSED`. Its denominator is **7,618 valid, nonempty RDKit-parsed published molecule IDs**; zero structures were excluded. The earlier raw-ID counts survived unchanged because every published ID passed this structural audit.

Keep **KSOL ≥10 µM, HLM clearance ≤50 mL/min/kg, Papp A→B ≥1 ×10⁻⁶ cm/s**, with efflux disabled:

| Evidence policy | Established passes | Established failures | Unresolved IDs | Compatible shortlist |
|---|---:|---:|---:|---:|
| Keep exact values and assay bounds | 1,844 | 2,548 | 3,226 | 1,844–5,070 |
| Discard every censored measurement | 1,682 | 2,448 | 3,488 | 1,682–5,170 |

**Keeping bounds settles 262 additional decisions: 162 passes and 100 failures, or 3.4% of these valid-structure IDs.** These are logical decisions under the displayed illustrative goals, not predictions, clinical certification, or an estimate of outcomes from unperformed assays. The default three gates already show the effect; no threshold optimization is needed.

The 7,618 IDs represent **7,617 distinct canonical isomeric structures**. The duplicate structure group is **E-0001829 / E-0014119**, which remains two published IDs. There are no multi-fragment IDs in this release; no salt stripping or tautomer merging was performed. RDKit flags specified atom stereochemistry in 2,054 IDs, specified bond stereochemistry in 9, and unassigned potential atom stereocenters in 232. There are 549 nonisomeric groups containing multiple isomeric SMILES. These audit diagnostics do not imply independent samples or assign unpublished stereochemistry.

## Timed narration

The timestamps below correspond to the finished silent recording.

| Time | Chapter | Suggested narration |
| --- | --- | --- |
| 0:00–0:20 | The question | I'm Harsh Pandey. When an ADMET measurement is missing, or reported only as a bound, can we still decide whether a molecule meets our goals? The Missing Molecules explores that question using real ExpansionRx data. |
| 0:20–0:45 | The same screening goals | These are editable teaching goals: solubility at least ten, clearance at most fifty, and permeability at least one, in the displayed units. Every enabled gate must pass. Green establishes a pass, red a failure, and amber remains unresolved. The range is a logical bound, not a confidence interval. |
| 0:45–1:12 | A bound can establish a pass | This is E-0018881. Its clearance is reported below four point five, rather than exactly four point five. Every possible nonnegative value below that limit passes our fifty clearance gate. Its solubility and permeability pass too. These observations establish an all-gates pass without filling in a missing value. |
| 1:12–1:38 | Same observation, different decision | Now look at E-0002337, with clearance below eight point six. Keep only the clearance gate. It passes at fifty. Tighten the goal to five: some possible values pass and others fail, so the decision becomes unresolved. The measurement stayed the same. Our requirement changed. |
| 1:38–2:08 | Missing does not mean failing | E-0011215 has solubility below one point five six. That establishes a failure against our ten-micromolar goal, even though permeability is missing. One established failure is enough. E-0001829 instead has missing solubility and permeability, with acceptable clearance. Its status remains unresolved. Missing does not mean failing. |
| 2:08–2:43 | 262 decisions already in the evidence | Now discard every censored observation, keeping the same goals. Retaining the limits settles two hundred and sixty-two additional decisions: one hundred and sixty-two passes and one hundred failures. Across seven thousand six hundred and eighteen valid molecule IDs, the compatible shortlist tightens from one thousand six hundred eighty-two to five thousand one hundred seventy, to one thousand eight hundred forty-four to five thousand seventy. These are evidence decisions under these illustrative goals, rather than predictions. |
| 2:43–3:18 | Order changes the accounting | This molecule fails both solubility and clearance. The first-failure table initially credits solubility. Move clearance earlier and its credit changes. The population attribution changes too, but the final shortlist stays fixed. A filtering waterfall tells an accounting story shaped by its order. It does not tell us which assay caused a molecule's liabilities. |
| 3:18–3:40 | Save the question and its evidence | For unresolved IDs, this table counts assays that are the only unresolved gate. Resolving one could settle that ID either way. These are opportunities for decisive evidence, rather than probabilities of success. The JSON preserves the goals, policy, per-ID decisions, ordering, and assay opportunities. |
| 3:40–4:05 | Provenance and limitations | We count published molecule IDs: one structure appears under two IDs, so they are not independent samples. Published structures and inequalities are retained. These goals cannot establish clinical safety. ChatGPT and Codex assisted with development and testing. My takeaway is simple: preserve the evidence before deciding what it rules in or out. |

Review every spoken scientific claim before submitting. No domain-expert review is claimed.
