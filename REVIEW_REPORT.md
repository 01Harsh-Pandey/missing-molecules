# Publication review — 5 October 2026 (IST)

Repository: https://github.com/01Harsh-Pandey/missing-molecules

Persistent notebook: https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py

Tested commit: `a3ffcb55347768626b54516b0a11826af74fd617`

Fresh validation: [passed](https://github.com/01Harsh-Pandey/missing-molecules/actions/runs/37241656758).

## Findings and changes

The published scientific notebook required no source edits. Its SHA-256 remains `de5d29f56c04b0bd87238a8a9774ade19a8fcefad0ec353b531bd95543e3325b`; its Git blob also matches the previously tested notebook.

- Removed a stray widget HTML output from the static snapshot's import cell. Its code hash correctly represented `import marimo as mo`, which should have no displayed widget output.
- Added CI triggers for changes to the browser suite, export comparison, data, and committed session snapshot.
- Added a source-to-preview check covering all 21 cell hashes, exception outputs, and the stray import output.
- Added the existing independent Decimal reference calculation to CI and verified the freshly generated session snapshot.
- Clarified default thresholds, the two evidence policies, molecule-ID counting, and native Python startup in the README.
- Updated the video script to use the persistent notebook link and distinguish earlier sandbox validation from the current hosted browser check.

## Verified evidence

The fresh Linux job passed:

- RDKit import and full chemistry audit: 7,618 valid nonempty published molecule IDs, 7,617 canonical isomeric structures.
- All 37 scientific tests, strict marimo checks, dependency consistency, HTML export, and session export.
- Complete execution of 21 notebook cells with zero exception outputs.
- Independent comparison of all 7,618 baseline molecule decisions and 22,854 endpoint decisions, all 15 nonempty endpoint subsets, and 31 threshold-sensitivity settings.
- All 21 browser integration checks: real molecule drawings, Python/widget synchronization, selection, gate order, thresholds, evidence policy, display controls, JSON exports, empty selections, and the 390px layout.
- Matching hashes for all 21 cells in the committed static preview; the freshly exported snapshot also has no exception or stray import outputs.

Separately, this review recomputed the raw CSV checksum and 92 evidence-policy/endpoint/threshold combinations in a JavaScript reference calculation. All recorded aggregates agreed, with no mismatches. The raw CSV MD5 is `27fae3d509fb1d9fd97cc94a4c9cccec`.

Default gates are KSOL ≥10 µM, HLM CLint ≤50 mL/min/kg, and Caco-2 Papp A→B ≥1 × 10⁻⁶ cm/s; efflux is disabled.

| Policy | Pass | Fail | Unresolved | Logical shortlist bounds |
| --- | ---: | ---: | ---: | ---: |
| Retain assay bounds | 1,844 | 2,548 | 3,226 | 1,844–5,070 |
| Discard censored observations | 1,682 | 2,448 | 3,488 | 1,682–5,170 |

Retaining bounds establishes **262 additional decisions: 162 passes and 100 failures**. These counts are descriptive evidence decisions under illustrative gates, without imputation or predictive-model training.

## Remaining delivery check

Prior publication evidence records a new GitHub-backed molab kernel that loaded this identical source, executed all 21 cells without errors, and loaded RDKit. Molab supplied anywidget 0.11.0 and traitlets 5.15.1; the clean Linux job tested the declared exact versions separately.

**This review did not independently interact with the hosted molab browser.** Its terminal could not start because of a workspace runtime provisioning failure, and the web reader could not open the molab pages. The successful browser tests above used a fresh native Python server in GitHub Actions.

Open the persistent link, select **Server**, run all cells if needed, and confirm that molecule drawings appear and controls respond. At the default gates, toggling “discard censored measurements” should change the displayed counts between the two rows above. Restore defaults before recording.

The updated `VIDEO_SCRIPT.md` targets 4:05. Record a video under five minutes and provide a viewable Google Drive link for the competition form. No recording or competition submission was performed by this review.
