# Final competition review — 5 October 2026

## Assessment

The Missing Molecules is an appropriate competition submission and a credible prize contender. Its strongest features are its purpose-built EvidenceBoard, meaningful reactive exploration, and careful treatment of missing measurements and assay limits. This is a reviewer judgment, not a predicted placement.

The [official rubric](https://docs.google.com/spreadsheets/d/1xEd-njH43jTWQfr-2wjXULhiGKXl6zEvmKIobWOO8Ks/edit?gid=620363524) assigns 20% each to creativity/impact, interactivity/workflow, design/presentation, and customization; code clarity and chemical validity receive 10% each.

| Criterion | Evidence and assessment |
| --- | --- |
| Creativity and impact | A focused question with a concrete result: retaining assay bounds settles 262 additional decisions under the displayed default gates. Do not claim a novel mathematical algorithm or universal drug-selection thresholds. |
| Interactivity and workflow | Hosted controls genuinely change Python results. Thresholds, policy, selection, endpoint configuration, gate order, and exported decisions agreed in live tests. |
| Design and presentation | Desktop and 390px behavior passed. A clear video should prioritize one molecule, the 262-decision result, and order-dependent attribution. Hosted editor startup still has a nuisance described below. |
| Customization | The anywidget EvidenceBoard connects molecule drawings, evidence decisions, gate focus, and ordering to the real reactive kernel. |
| Code clarity and reproducibility | Pinned dependencies, embedded checksummed source bytes, provenance, explicit validation, and a permanent GitHub-backed molab entry point. All 37 scientific tests and 21-cell clean native execution passed. |
| Chemical validity | RDKit validated all 7,618 molecule IDs. Units, inequalities, stereochemistry, duplicate-ID counting, and invalid measurement bounds are handled explicitly. |

The recommendation is to freeze scientific features and prepare the video. Confirm a clean, fully rendered presentation in the recording browser before capture.

## Fresh hosted browser evidence

Public entry point: https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py

The permanent entry point returned HTTP 200. An anonymous visitor can inspect the preview; selecting Server and confirming Run on server opened a sign-in dialog. Sign in is therefore part of the observed native startup path. The preview did not render the custom EvidenceBoard, so it is not a substitute for running Python.

The previous runtime returned HTTP 410, with “sandbox terminated.” Temporary runtime URLs must not be used as the sole submission link.

The refreshed user-provided runtime returned HTTP 200 and contained 21 cells. Initial reader access showed only an explanatory output. The authorized browser took writer control, selected **Re-run all cells** through the command palette, and rendered the real RDKit board with the expected baseline:

- Pass: 1,844
- Fail: 2,548
- Unresolved: 3,226

[Hosted run and functional evidence](https://github.com/01Harsh-Pandey/missing-molecules/actions/runs/37255081446) passed **20 functional checks** for drawings, Python/widget agreement, molecule and endpoint selection, gate order, thresholds, search, evidence policy, endpoint removal/recovery, bound transitions, JSON exports, display controls, all four endpoints, and mobile layout.

**The overall hosted job failed its final console-error check.** The captured error was a language-server initialization timeout in the editor. This must not be reported as a fully passing 21-check hosted run. No scientific mismatch was found by the preceding 20 checks.

[A subsequent presentation probe](https://github.com/01Harsh-Pandey/missing-molecules/actions/runs/37255391784) failed before the functional suite: after writer bootstrap and navigation to `?view-as=present`, 21 editor components were mounted where the test required zero. That attempt also logged host health/data-source request failures. It does not certify a clean hosted presentation session.

The earlier [clean native Linux validation](https://github.com/01Harsh-Pandey/missing-molecules/actions/runs/37241656758) still passed all 21 browser checks and all science checks. These results have different scopes.

## Recording preparation

Use the permanent notebook link for submission. Sign in, start Server, confirm Run on server, and use the command palette's **Re-run all cells** if outputs are incomplete. Once the board is populated, switch to app/presentation view and dismiss editor helper panes and connection banners in the recording browser.

Keep the 4:05 script's numerical claims unchanged. The strongest story is: a bound is useful evidence, retaining bounds settles 262 decisions, and filter order changes attribution without changing the final shortlist. Explain that the gates are illustrative and unresolved does not mean failed.

No scientific notebook source was edited in this retry. No competition entry was submitted and no video was recorded. Pairing credentials were not used or written to the repository.
