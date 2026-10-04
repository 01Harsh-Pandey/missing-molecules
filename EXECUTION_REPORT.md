# Execution report — molab notebook validation complete

Updated 2026-10-04T16:49:59+00:00. **Notebook technical validation ready: true. Competition entry not submitted.**

The complete chemistry-enabled notebook was validated in the user's authorized [Python-backed molab session](https://sb-292adb2b15a38c98.sb.molab.run/?view-as=present). The Linux runtime imports RDKit, completes the full data audit, passes all scientific/static/dependency checks, and exports a session with **21 cells, 20 data outputs, and zero exception outputs**. The earlier Windows native-library blocker was resolved by using this actual compatible runtime. Windows security policy was not changed. No science blocker remains.

Executed notebook: `/marimo/notebook.py`; delivered as the byte-identical standalone `missing_molecules.py`. Source SHA-256: `de5d29f56c04b0bd87238a8a9774ade19a8fcefad0ec353b531bd95543e3325b`. The normalized executable-cell AST matches the original scientific notebook: `e166861bb993e28eeed6efebbaa7071c26027cb1fbb5e2a1ae3150d10911c279`.

## Checks and evidence

| Check | Result | Evidence |
|---|---|---|
| Native RDKit Chem and drawing imports | PASSED in the connected Linux runtime | evidence/cloud/rdkit_import.log |
| Scientific/parser semantics | PASSED — 37 synthetic semantic/parser tests against the delivered engine | evidence/cloud/semantic_tests.log |
| Full raw-source and chemistry validation | PASSED, `validation_mode="full"` | verified_findings.json; evidence/cloud/full_chemistry_and_data.log |
| Source bytes and embedded copy | PASSED — pinned MD5/SHA-256 recomputed; embedded bytes equal the verified raw file | INDEPENDENT_REVIEW.json |
| Strict marimo static check | PASSED | evidence/cloud/marimo_strict_check.log |
| Runtime dependency consistency | PASSED | evidence/cloud/dependency_consistency.log |
| Whole-notebook HTML/session execution | PASSED — 21 cells, 20 data outputs, 0 errors | CLOUD_EXECUTION_REPORT.json; __marimo__/session/notebook.py.json; evidence/cloud/final_notebook_preview.html |
| Independent full science/model comparison | PASSED — all 7,618 live exported decisions and 22,854 gate statuses agree | INDEPENDENT_REVIEW.json; evidence/live-baseline.json |
| Successful-runtime dependency snapshot | PASSED for science/chemistry/marimo execution | requirements.lock.txt; evidence/cloud/freeze_successful_environment.log |
| Complete notebook browser synchronization | PASSED — initial 18 and fresh 21 checks plus both remaining threshold sliders | evidence/browser/main_fresh/live_browser_report.json; evidence/browser/main_fresh/supplemental_sliders/report.json |
| Real drawings, assigned stereochemistry and desktop/390px layouts | PASSED — actual E-0018881 graph/wedges inspected | evidence/visual_review.json |
| Actual fresh molab runtime/session run | PASSED — replacement PID 152 → 1726, unchanged source/hash, all 21 cells and full verifier rerun | evidence/replacement_final/kernel-validation.json |

The independent Decimal parser/classifier also reproduces both evidence policies for all 15 endpoint subsets and 31 threshold-sensitivity settings. It confirms the live source audit, canonical duplicate groups, fragment/exclusion lists, first-failure attribution, and assay opportunities. It does not substitute for browser interaction or a fresh runtime.

## Runtime and repairs

Actual runtime: **Python 3.13.11**, `Linux-4.19.0-gvisor-x86_64-with-glibc2.41`. The successful versions are marimo **0.25.1**, RDKit **2026.3.6**, anywidget **0.9.18**, and traitlets **5.14.3**. This cloud check used the actual supported Python 3.13 molab kernel, rather than the earlier preferred local Python 3.12 environment.

The notebook persistently declares the four original pinned dependencies. Compatibility constraints `numpy<2.5`, `websockets<17`, and `jedi<0.20` resolved conflicts with the host runtime; the successful installed versions are **2.4.6**, **16.1.1**, and **0.19.2** respectively. The notebook's PEP metadata now targets Python >=3.13. requirements.lock.txt captures the successful Linux environment; browser and fresh-session results are documented separately.

An empty cell introduced during notebook import was removed through the live cell manager. Helper paths were adapted to the actual filename, `notebook.py`. The cloud validator used its no-embed path to verify the already embedded bytes without rewriting them. All original executable cells remain unchanged by AST comparison. The imported marimo wrapper currently uses medium width and automatic HTML download; scientific cell contents and controls are preserved.

## Confirmed scientific findings

The official release contains **7,618 unique published IDs**, and RDKit accepts all **7,618 as nonempty structures**. None is excluded and none has multiple disconnected fragments. There are **7,617 canonical isomeric structures** and **one duplicate-structure group**, E-0001829/E-0014119. Both IDs and their distinct published assays remain separate; no averaging, salt stripping, tautomer merging, or stereoisomer invention is performed.

The full audit identifies **2,054 IDs with specified atom stereochemistry**, **9 with specified bond stereochemistry**, and **232 with unassigned potential atom stereocenters**. There are **549 nonisomeric groups containing multiple isomeric SMILES**. These counts describe RDKit's interpretation of the released structures. Separate visual inspection confirms the actual E-0018881 depiction retains its assigned stereochemical wedge cues.

| Endpoint | Exact | Censored | Missing | Invalid | Unparsed |
|---|---:|---:|---:|---:|---:|
| KSOL | 7,298 | 125 | 195 | 0 | 0 |
| HLM CLint | 4,542 | 279 | 2,796 | 1 | 0 |
| Papp A→B | 3,773 | 31 | 3,812 | 2 | 0 |
| Efflux ratio | 3,777 | 26 | 3,815 | 0 | 0 |

Three nonphysical source observations remain invalid/unresolved: E-0017007 HLM `< 0.0`, and E-0027111/E-0027124 Papp `< 0.00`. Their raw strings are retained; none becomes an exact zero.

With KSOL ≥10 µM, HLM ≤50 mL/min/kg, Papp A→B ≥1 ×10⁻⁶ cm/s, and efflux disabled, the **full valid-structure ID population** yields:

| Evidence policy | Pass | Fail | Unresolved | Compatible shortlist |
|---|---:|---:|---:|---:|
| Keep exact values and assay bounds | 1,844 | 2,548 | 3,226 | 1,844–5,070 |
| Discard every censored measurement | 1,682 | 2,448 | 3,488 | 1,682–5,170 |

The prior raw-ID counts survive unchanged because the chemistry audit excludes no IDs. Retaining bounds settles **262 additional valid-ID decisions: 162 passes and 100 failures**. This is a descriptive result under illustrative goals, not a prediction, confidence interval, or clinical claim. Counts remain published IDs, including the duplicate pair.

All five real demonstration IDs remain valid: E-0018881 (censor-certified default pass, 3 specified atom stereocenters), E-0011215 (solubility failure despite missing permeability), E-0001829 (missing solubility/permeability), E-0011211 (two failing gates), and E-0002337 (HLM `<8.6`, HLM-only pass at 50 and unresolved at 5).

Source credit: Expansion Therapeutics and the OpenADMET Consortium, CC BY 4.0. The [official Zenodo record](https://zenodo.org/records/21504733) documents the raw release and assay units. Pinned source MD5 is `27fae3d509fb1d9fd97cc94a4c9cccec`; SHA-256 is `f674ec74cca1146bc386f832a32d4b8d921d3c312f92cb436cc005901c724a3c`.

## First completed fresh run (prior sandbox)

The authenticated restart endpoint returned HTTP 200 with success:true and closed the old kernel. A new browser connection created PID 3267, replacing PID 80. The first paired command was dedicated marimo code-mode help. The pinned dependencies imported successfully; all 21 cells explicitly ran with no errors, the full cloud verifier passed again, and the source hash remained unchanged. The live UI was restored to all statuses, blank search, 12 cards, default 10/50/1 gates with efflux disabled at 3, and censor discard off.

The final supported presentation view passed 21 checks with 19 real JSON downloads. A supplemental strict run changed/restored the Papp and efflux thresholds. Selection, focus, gate order, all four endpoints, status/card-count controls, zero endpoints, no matches, censor policy, quantitative takeaway, both audited demos, desktop/390px controls, scrolling details, and exports were exercised. All downloaded per-ID decisions/gates, summaries, first failures and assay opportunities are compared in evidence/browser_export_comparison.json. Native Chem/drawing code and the actual stereochemical SVG were visually checked; no chemistry-disabled placeholder is present.

## Molab editor limitation and validated viewer

Writer edit mode reproduced 22 language-server initialization timeouts and a CodeMirror inline-AI handler RangeError when Escape was used. Those failed runs are retained under evidence/browser/editor_limitations. Marimo's supported `?view-as=present` URL starts without mounting CodeMirror; menus are dismissed by a normal click. The full fresh viewer tests pass with zero console, page, or notebook errors, without filtering errors or changing platform/sharing settings. The viewer is the validated route for reading, recording and sharing this notebook. The host editor defects remain an upstream limitation; no notebook validation blocker remains.

## User actions remaining

The revised VIDEO_SCRIPT.md targets 4:05 and uses full valid-ID results. All five demo IDs were checked against the full chemistry/data audit and live browser interaction, including the separately tested E-0011215 solubility failure and censor-discard transition. No video has been recorded, human/domain-expert review claimed, competition form submitted, organizer contacted, or sharing setting changed. Video recording, final human review, publication and submission remain with the user. `submission_ready=true` records notebook technical validation only. The conservative cutoff remains **October 5, 2026, 12:29 PM IST**.


## Replacement session and final handoff

The original sandbox terminated after its completed validation (HTTP 410, preserved in `evidence/molab_availability.json`). The user supplied a replacement connection. Its notebook source matched the final SHA-256 exactly. Dependencies were installed through code mode, then the kernel was restarted from PID 152 to 1726 to load the pinned modules. Installed and loaded anywidget 0.9.18 and traitlets 5.14.3 now agree; all 21 cells and the complete native verifier passed again. Evidence: `evidence/replacement_final/kernel-validation.json`.

The replacement presentation view passed 21 strict browser checks, 5 supplemental slider checks, and the E-0011215 scripted demo. All downloaded per-ID decisions are checked in `evidence/browser_export_comparison.json`. Current URL: [https://sb-292adb2b15a38c98.sb.molab.run/?view-as=present](https://sb-292adb2b15a38c98.sb.molab.run/?view-as=present). Final findings, video script, reports, dependency lock and representative screenshot evidence were written into the connected molab runtime and read back byte for byte. `evidence/remote_report_sync.json` records their hashes; the main notebook remained unchanged.

The browser held open while this replacement kernel initialized collected 32 console errors: 6 uninitialized UI elements, 4 missing widget models, and 22 LSP initialization timeouts. That failed run is preserved in `evidence/browser/editor_limitations/replacement_cold_startup.json`. After complete notebook execution, a new presentation browser passed all checks with zero console, page or notebook errors; no errors were filtered and no source changed between these runs. Complete notebook execution before opening the presentation view after a runtime restart.
