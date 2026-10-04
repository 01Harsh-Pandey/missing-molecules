# The Missing Molecules

[![Open in molab](https://marimo.io/molab-shield.svg)](https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py)

**Question:** How do missing measurements and assay bounds change which molecules we can certify against the same ADMET screening goals?

Explore thresholds, inspect RDKit structures, reorder gates, and export the evidence for every molecule ID.

## What the data reveals

The default example requires kinetic solubility **≥10 µM**, human liver microsomal clearance **≤50 mL/min/kg**, and Caco-2 permeability A→B **≥1 × 10⁻⁶ cm/s**. Efflux is optional and disabled by default. These are editable teaching thresholds.

Across **7,618 valid-structure published molecule IDs**:

| Evidence policy | Established passes | Established failures | Unresolved | Compatible qualifying IDs |
| --- | ---: | ---: | ---: | ---: |
| Keep exact values and assay bounds | 1,844 | 2,548 | 3,226 | 1,844–5,070 |
| Discard censored observations | 1,682 | 2,448 | 3,488 | 1,682–5,170 |

Retaining bounds settles **262 additional decisions: 162 passes and 100 failures**, without training a model or imputing measurements. The range is a logical evidence bound, not a confidence interval. Counts refer to published IDs: the source contains 7,617 distinct canonical isomeric structures. Passing these gates does not establish clinical suitability.

## Open and run

1. Open the molab badge.
2. Select **Server** to start native Python.
3. Click **Run all** if needed, then wait for the evidence board and drawings.

The initial static preview is a saved view. Use the Python server for interactive controls and RDKit; this notebook requires that runtime. The verified raw data is embedded, so no separate data upload is needed.

Locally, with Python ≥3.13 and uv:

```sh
uv run --with marimo==0.25.1 marimo run --sandbox missing_molecules.py
```

The notebook declares its dependencies. The matching `__marimo__/session/missing_molecules.py.json` supplies the static preview.

## Validation

[Fresh Linux validation passed](https://github.com/01Harsh-Pandey/missing-molecules/actions/runs/37241656758): 37 scientific tests, RDKit chemistry, complete execution of 21 cells, and 21 browser checks covering structures, live Python widget interactions, and the mobile layout. The workflow also checks source/preview consistency and independently recomputes the recorded endpoint and threshold decisions.

A fresh molab kernel executed all 21 cells without errors. Its hosted browser rendering and controls still require confirmation; see [publication details](FINAL_PUBLICATION_REPORT.md) and the [latest review](REVIEW_REPORT.md).

Validated notebook SHA-256: `de5d29f56c04b0bd87238a8a9774ade19a8fcefad0ec353b531bd95543e3325b`.

## Attribution and AI use

Notebook by Harsh Pandey. Data: Expansion Therapeutics and the OpenADMET Consortium, [ExpansionRx full release](https://huggingface.co/datasets/openadmet/openadmet-expansionrx-challenge-data), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source measurements and structures are unchanged; decision annotations and the custom EvidenceBoard are additions. Provenance is preserved in the notebook and `data/`.

OpenAI ChatGPT and Codex assisted with concept development, coding, validation, and editing. The notebook includes the disclosure and limitations.

No competition entry has been submitted.
