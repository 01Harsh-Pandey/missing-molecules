# Missing Molecules

[![Open in molab](https://marimo.io/molab-shield.svg)](https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py)

**Question:** How many molecules qualify when assay measurements are missing or reported as censored bounds?

**Finding:** Among 7,618 valid molecule IDs, the default gates establish **1,844 passes, 2,548 failures, and 3,226 unresolved cases**. The evidence allows 1,844–5,070 qualifying IDs; censored bounds settle 262 additional decisions. This range is a logical evidence bound, not a confidence interval.

Explore assay thresholds, reorder gates, inspect RDKit molecule drawings, and export per-molecule decisions.

## Run

Open the badge, then select **Server** from the preview menu for native Python, RDKit, and working widgets. Wait for dependencies and all cells to finish. The notebook embeds the verified data and declares Python >=3.13 and pinned dependencies; no separate data upload is needed.

Locally, with Python >=3.13 and uv:

```sh
uv run --with marimo==0.25.1 marimo run --sandbox missing_molecules.py
```

`__marimo__/session/missing_molecules.py.json` supplies the static preview. `PUBLICATION_VALIDATION.json` records the separate GitHub-backed fresh-start check; `EXECUTION_REPORT.md` documents earlier cloud chemistry and browser validation.

## Attribution

Notebook by Harsh Pandey. Source data: Expansion Therapeutics / OpenADMET Consortium, CC BY 4.0; dataset provenance and attribution are preserved in the notebook and `data/`.

AI-assisted coding, validation, and editing used OpenAI Codex. AI use is also disclosed in the notebook.

Validated source SHA-256: `de5d29f56c04b0bd87238a8a9774ade19a8fcefad0ec353b531bd95543e3325b`.

`VIDEO_SCRIPT.md` is the reviewed recording script. No competition entry has been submitted.
