# Missing Molecules — final video and narration

**Optional production notes.** This file records the narration and its verified scientific anchors; it is not required to run the notebook.

[Download the final narrated MP4](https://github.com/01Harsh-Pandey/missing-molecules/releases/download/missing-molecules-final-video-2026-10-05/Missing_Molecules_Final_Indian_English.mp4): **4:05, 1920 × 1080**, H.264 video with AAC audio. The narrator is Microsoft's standard synthetic Indian English voice `en-IN-PrabhatNeural`. The voice is not a clone of Harsh Pandey, and the closing narration discloses its synthetic origin.

The video demonstrates genuine interactions with the reviewed published notebook in native Python. Chapter labels and the cursor highlight are recording annotations. Adding narration preserves the original video stream. All fourteen speech segments were checked for timing and overlap; the encoded final audio was independently transcribed and its scientific claims reviewed. Audio-level checks and full decoding passed. Sampled frames from all chapters were inspected. The publicly downloaded MP4 was checked against the reviewed file's SHA-256 and decoded in full.

The [release](https://github.com/01Harsh-Pandey/missing-molecules/releases/tag/missing-molecules-final-video-2026-10-05) includes the final verification report. These checks cover the video; they do not establish a fix for the hosted molab editor/presentation limitations documented in [COMPETITION_REVIEW.md](COMPETITION_REVIEW.md). No domain-expert review is claimed.

Use the [permanent molab notebook](https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py) for the competition entry. No competition entry has been submitted by this automation.

## Verified numerical anchor

The full validation ran with Python **3.13.11**, marimo **0.25.1**, RDKit **2026.3.6**, anywidget **0.9.18**, and traitlets **5.14.3**. `verified_findings.json` has `validation_mode="full"`, chemistry `PASSED`, and full-data logic `PASSED`. Its denominator is **7,618 valid, nonempty RDKit-parsed published molecule IDs**; zero structures were excluded. The earlier raw-ID counts survived unchanged because every published ID passed this structural audit.

Keep **KSOL ≥10 µM, HLM clearance ≤50 mL/min/kg, Papp A→B ≥1 ×10⁻⁶ cm/s**, with efflux disabled:

| Evidence policy | Established passes | Established failures | Unresolved IDs | Compatible shortlist |
|---|---:|---:|---:|---:|
| Keep exact values and assay bounds | 1,844 | 2,548 | 3,226 | 1,844–5,070 |
| Discard every censored measurement | 1,682 | 2,448 | 3,488 | 1,682–5,170 |

**Keeping bounds settles 262 additional decisions: 162 passes and 100 failures, or 3.4% of these valid-structure IDs.** These are logical decisions under the displayed illustrative goals, not predictions, clinical certification, or an estimate of outcomes from unperformed assays. The default three gates already show the effect; no threshold optimization is needed.

The 7,618 IDs represent **7,617 distinct canonical isomeric structures**. The duplicate structure group is **E-0001829 / E-0014119**, which remains two published IDs. There are no multi-fragment IDs in this release; no salt stripping or tautomer merging was performed. RDKit flags specified atom stereochemistry in 2,054 IDs, specified bond stereochemistry in 9, and unassigned potential atom stereocenters in 232. There are 549 nonisomeric groups containing multiple isomeric SMILES. These audit diagnostics do not imply independent samples or assign unpublished stereochemistry.

## Final narration

The timestamps are cue windows in the finished narrated MP4.

| Time | Chapter | Narration |
| --- | --- | --- |
| 0:00–0:20 | The question | The Missing Molecules is an interactive notebook by Harsh Pandey. When an ADMET measurement is missing, or reported only as a bound, can we still decide whether a molecule meets our goals? Let's explore Expansion R X data from Expansion Therapeutics and Open ADMET. |
| 0:20–0:45 | The same screening goals | These are editable teaching goals: solubility at least ten, clearance at most fifty, and permeability at least one, in the displayed units. Every enabled gate must pass. Green establishes a pass, red a failure, and amber remains unresolved. The range is a logical bound, not a confidence interval. |
| 0:45–1:12 | A bound can establish a pass | This molecule's clearance is reported below four point five, rather than exactly four point five. Every possible nonnegative value below that limit passes our fifty clearance gate. Its solubility and permeability pass too. These observations establish an all-gates pass without filling in a missing value. |
| 1:12–1:21 | Clearance at fifty | Here, clearance is below eight point six. With only the clearance gate enabled, it passes at fifty. |
| 1:21–1:29 | Clearance at five | At five, that same bound spans passing and failing possibilities. The evidence becomes unresolved. |
| 1:29–1:38 | Observation versus requirement | The measurement stayed the same. Our requirement changed. Let's restore the original three goals. |
| 1:38–1:52 | An established failure | This molecule has solubility below one point five six. That fails our ten-micromolar goal, even though permeability is missing. One established failure is enough. |
| 1:52–2:08 | Missing remains unresolved | This molecule instead has missing solubility and permeability, with acceptable clearance. Its status remains unresolved. Missing does not mean failing. |
| 2:08–2:24 | Discarding assay limits | Return to the same three goals. Now discard every censored observation. Those assay bounds can no longer establish a decision. More molecules remain unresolved, even though our screening goals are unchanged. |
| 2:24–2:43 | 262 additional decisions | Keeping the limits establishes two hundred and sixty-two additional decisions: one hundred and sixty-two passes and one hundred failures. Across seven thousand six hundred and eighteen valid molecule IDs, the compatible shortlist becomes narrower. This uses existing evidence, without predicting missing measurements. |
| 2:43–2:55 | More than one failed gate | This molecule fails both solubility and clearance. The first-failure table initially credits solubility. Both failures are still present in the evidence. |
| 2:55–3:18 | Order changes the accounting | The table credits the first failed gate. Move clearance earlier: the attribution changes, but the final shortlist stays fixed. Reordering tells an accounting story. It does not tell us which assay caused the molecule's liabilities. |
| 3:18–3:40 | Save the question and its evidence | For unresolved IDs, this table counts assays that are the only unresolved gate. Resolving one could settle that ID either way. These are opportunities for decisive evidence, rather than probabilities of success. The downloadable record preserves the goals, policy, decisions for each molecule, ordering, and assay opportunities. |
| 3:40–4:05 | Provenance and limitations | These counts refer to published IDs. One structure appears under two IDs. Structures and assay bounds are preserved. These teaching goals cannot establish clinical safety. ChatGPT and Codex assisted with development and testing; this narration is synthetic. Preserve the evidence before deciding what it rules in or out. |
