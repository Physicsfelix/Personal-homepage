# Functional Analysis II Watermark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved `© 宋志恒 · PhysicsFelix` watermark to every page of the public Functional Analysis II PDF and publish it at the existing URL.

**Architecture:** Generate a transparent A4 vector overlay with ReportLab and merge it over each cloned PDF page with pypdf so bookmarks, links, metadata, page count, and geometry remain intact. Verify the complete 307-page output before atomically replacing the repository PDF, update the repository's locked SHA-256 value, then publish through the existing GitHub Pages workflow.

**Tech Stack:** Bundled Python 3, pypdf 6.10.0, ReportLab 4.4.9, Microsoft YaHei, Poppler `pdftoppm`, PowerShell, Git, GitHub connector

## Global Constraints

- Watermark text must be exactly `© 宋志恒 · PhysicsFelix`.
- Apply one centered watermark to all 307 pages, including the cover.
- Use 36 pt neutral gray text at 10% opacity, rotated 45° from lower-left to upper-right.
- Preserve the stable path `files/notes/functional-analysis-ii-operator-theory.pdf`.
- Preserve page count, page dimensions, rotation, bookmarks, link annotations, and metadata.
- Do not change the other six public PDFs, Notes card data, titles, status, or version date.
- Keep all temporary generators, backups, renders, and manifests under `tmp/pdfs/`; do not commit them.

---

### Task 1: Establish a failing artifact verification

**Files:**
- Create: `tmp/pdfs/verify_functional_analysis_ii_watermark.py`
- Create: `tmp/pdfs/functional-analysis-ii-original.pdf`
- Create: `tmp/pdfs/functional-analysis-ii-original-manifest.json`
- Test: `tmp/pdfs/verify_functional_analysis_ii_watermark.py`

**Interfaces:**
- Consumes: original repository PDF path and candidate output PDF path.
- Produces: exit code 0 only when the candidate has the exact watermark on all pages and preserves the original structural manifest.

- [ ] **Step 1: Copy the source PDF to a recoverable task-local backup**

Run:

```powershell
New-Item -ItemType Directory -Force tmp/pdfs
Copy-Item -LiteralPath files/notes/functional-analysis-ii-operator-theory.pdf -Destination tmp/pdfs/functional-analysis-ii-original.pdf
```

- [ ] **Step 2: Write the structural verifier**

Create a verifier that uses these exact helpers and assertions:

```python
import json
import sys
from pathlib import Path
from pypdf import PdfReader

WATERMARK = "© 宋志恒 · PhysicsFelix"

def outline_count(items):
    total = 0
    for item in items:
        if isinstance(item, list):
            total += outline_count(item)
        else:
            total += 1
    return total

def link_count(reader):
    total = 0
    for page in reader.pages:
        annots = page.get("/Annots")
        if annots:
            for annot in annots.get_object():
                if annot.get_object().get("/Subtype") == "/Link":
                    total += 1
    return total

def manifest(reader):
    return {
        "pages": len(reader.pages),
        "geometry": [
            [float(p.mediabox.width), float(p.mediabox.height), int(p.rotation)]
            for p in reader.pages
        ],
        "outline_count": outline_count(reader.outline),
        "link_count": link_count(reader),
        "metadata": dict(reader.metadata or {}),
    }

original_path, candidate_path, manifest_path = map(Path, sys.argv[1:4])
original = PdfReader(original_path)
candidate = PdfReader(candidate_path)
original_manifest = manifest(original)
Path(manifest_path).write_text(
    json.dumps(original_manifest, ensure_ascii=False, indent=2), encoding="utf-8"
)
assert not candidate.is_encrypted
assert manifest(candidate) == original_manifest
assert original_manifest["pages"] == 307
missing = [
    number for number, page in enumerate(candidate.pages, 1)
    if WATERMARK not in (page.extract_text() or "")
]
assert not missing, f"watermark missing from pages: {missing}"
print("verified 307 watermarked pages with preserved structure")
```

- [ ] **Step 3: Run the verifier against the unmodified PDF and confirm the expected failure**

Run:

```powershell
& 'C:\Users\18016\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tmp/pdfs/verify_functional_analysis_ii_watermark.py tmp/pdfs/functional-analysis-ii-original.pdf files/notes/functional-analysis-ii-operator-theory.pdf tmp/pdfs/functional-analysis-ii-original-manifest.json
```

Expected: FAIL with `watermark missing from pages` and page numbers 1 through 307.

### Task 2: Generate and verify the watermarked PDF

**Files:**
- Create: `tmp/pdfs/add_functional_analysis_ii_watermark.py`
- Create: `tmp/pdfs/functional-analysis-ii-watermarked.pdf`
- Modify: `files/notes/functional-analysis-ii-operator-theory.pdf`
- Test: `tmp/pdfs/verify_functional_analysis_ii_watermark.py`

**Interfaces:**
- Consumes: `input_path: Path`, `output_path: Path`, and the exact global watermark constants.
- Produces: `tmp/pdfs/functional-analysis-ii-watermarked.pdf`, then the verified stable-path replacement.

- [ ] **Step 1: Write the minimal watermark generator**

```python
from io import BytesIO
from pathlib import Path
import sys
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

TEXT = "© 宋志恒 · PhysicsFelix"
FONT_NAME = "WatermarkMicrosoftYaHei"
FONT_PATH = r"C:\Windows\Fonts\msyh.ttc"
FONT_SIZE = 36
ANGLE = 45
ALPHA = 0.10

pdfmetrics.registerFont(TTFont(FONT_NAME, FONT_PATH, subfontIndex=0))

def overlay_bytes(width, height):
    stream = BytesIO()
    layer = canvas.Canvas(stream, pagesize=(width, height))
    layer.saveState()
    layer.setFillColorRGB(0.35, 0.35, 0.35)
    layer.setFillAlpha(ALPHA)
    layer.setFont(FONT_NAME, FONT_SIZE)
    layer.translate(width / 2, height / 2)
    layer.rotate(ANGLE)
    text_width = pdfmetrics.stringWidth(TEXT, FONT_NAME, FONT_SIZE)
    layer.drawString(-text_width / 2, -FONT_SIZE * 0.3, TEXT)
    layer.restoreState()
    layer.save()
    return stream.getvalue()

input_path, output_path = map(Path, sys.argv[1:3])
reader = PdfReader(input_path)
writer = PdfWriter()
writer.clone_document_from_reader(reader)
cache = {}
for page in writer.pages:
    size = (float(page.mediabox.width), float(page.mediabox.height))
    if size not in cache:
        cache[size] = overlay_bytes(*size)
    overlay = PdfReader(BytesIO(cache[size])).pages[0]
    page.merge_page(overlay, over=True)
with output_path.open("wb") as handle:
    writer.write(handle)
```

- [ ] **Step 2: Generate the candidate from the task-local backup**

Run:

```powershell
& 'C:\Users\18016\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tmp/pdfs/add_functional_analysis_ii_watermark.py tmp/pdfs/functional-analysis-ii-original.pdf tmp/pdfs/functional-analysis-ii-watermarked.pdf
```

Expected: non-empty candidate PDF with 307 pages.

- [ ] **Step 3: Run the structural verifier and confirm it passes**

Run:

```powershell
& 'C:\Users\18016\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tmp/pdfs/verify_functional_analysis_ii_watermark.py tmp/pdfs/functional-analysis-ii-original.pdf tmp/pdfs/functional-analysis-ii-watermarked.pdf tmp/pdfs/functional-analysis-ii-original-manifest.json
```

Expected: `verified 307 watermarked pages with preserved structure`.

- [ ] **Step 4: Render all pages and build contact sheets for visual review**

Create `tmp/pdfs/render-watermarked/` and render all pages at 120 DPI:

```powershell
New-Item -ItemType Directory -Force tmp/pdfs/render-watermarked
& 'C:\Users\18016\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe' -png -r 120 tmp/pdfs/functional-analysis-ii-watermarked.pdf tmp/pdfs/render-watermarked/page
```

Create `tmp/pdfs/build_watermark_contact_sheets.py` with:

```python
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

source = Path("tmp/pdfs/render-watermarked")
output = Path("tmp/pdfs/contact-watermarked")
output.mkdir(parents=True, exist_ok=True)
pages = sorted(source.glob("page-*.png"))
assert len(pages) == 307
cell_w, cell_h = 320, 460
for sheet_number, start in enumerate(range(0, len(pages), 16), 1):
    sheet = Image.new("RGB", (cell_w * 4, cell_h * 4), "white")
    draw = ImageDraw.Draw(sheet)
    for slot, path in enumerate(pages[start:start + 16]):
        with Image.open(path) as source_image:
            thumb = ImageOps.contain(source_image.convert("RGB"), (cell_w - 12, cell_h - 28))
        x = (slot % 4) * cell_w + (cell_w - thumb.width) // 2
        y = (slot // 4) * cell_h + 20
        sheet.paste(thumb, (x, y))
        draw.text(((slot % 4) * cell_w + 6, (slot // 4) * cell_h + 3), path.stem, fill="black")
    sheet.save(output / f"contact-{sheet_number:02d}.jpg", quality=90)
print(f"created {sheet_number} contact sheets")
```

Run:

```powershell
& 'C:\Users\18016\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tmp/pdfs/build_watermark_contact_sheets.py
```

Inspect all 20 contact sheets, then inspect pages 1, 2, 10, 50, 100, 150, 200, 250, and 307 at full rendered size.

Expected: every page shows one centered, readable, low-opacity watermark; no clipped Chinese glyphs, blank pages, new overlaps, or page-size drift.

- [ ] **Step 5: Replace the stable-path PDF only after verification passes**

Run:

```powershell
Copy-Item -LiteralPath tmp/pdfs/functional-analysis-ii-watermarked.pdf -Destination files/notes/functional-analysis-ii-operator-theory.pdf -Force
```

### Task 3: Update the locked hash and run repository checks

**Files:**
- Modify: `tests/validate-pearl-theme.ps1:45`
- Test: `tests/validate-pearl-theme.ps1`
- Test: `tests/notes-download.test.mjs`

**Interfaces:**
- Consumes: verified stable-path PDF from Task 2.
- Produces: an updated approved SHA-256 value and passing repository validation.

- [ ] **Step 1: Run the current theme validation and confirm the expected hash failure**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tests/validate-pearl-theme.ps1
```

Expected: FAIL only because the Functional Analysis II SHA-256 no longer equals `46129B6689855EF979645FB30F930CE816D0821E6B8F452530CDBA5137522145`.

- [ ] **Step 2: Compute and update the exact new SHA-256**

Run `Get-FileHash -Algorithm SHA256` on the target PDF. Replace only the old Functional Analysis II hash on line 45 and its matching rendered-file expectation on line 189 if the validation file still contains both entries.

- [ ] **Step 3: Run all relevant checks**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tests/validate-pearl-theme.ps1
& 'C:\Users\18016\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/notes-download.test.mjs
git diff --check
```

Expected: both test suites PASS and `git diff --check` reports no errors.

- [ ] **Step 4: Review scope and commit the artifact change**

Run `git status -sb` and `git diff --stat`. Confirm the only new changes after the design/plan commits are the target PDF and the two matching hash literals in the validation test. Commit with:

```powershell
git add -- files/notes/functional-analysis-ii-operator-theory.pdf tests/validate-pearl-theme.ps1
git commit -m "notes: watermark Functional Analysis II"
```

### Task 4: Publish and verify GitHub Pages

**Files:**
- Publish: branch `agent/watermark-functional-analysis-ii`
- Deploy target: `main`

**Interfaces:**
- Consumes: verified commits from Tasks 1-3.
- Produces: updated live PDF at the existing public URL.

- [ ] **Step 1: Push the branch and open a focused pull request**

Push `agent/watermark-functional-analysis-ii`, open a non-draft PR to `main`, and describe the watermark, structural preservation checks, visual review, and repository test results.

- [ ] **Step 2: Merge the approved task change**

Use the connected GitHub account to merge the PR into `main`. Do not include unrelated files or commits.

- [ ] **Step 3: Wait for the existing GitHub Pages workflow**

Inspect the merge commit's workflow status until the Pages deployment succeeds. If a check fails, inspect the logs and repair only failures caused by this change.

- [ ] **Step 4: Verify the live stable URL**

Open:

```text
https://physicsfelix.github.io/Personal-homepage/files/notes/functional-analysis-ii-operator-theory.pdf
```

Confirm HTTP success, 307 pages, and the watermark on a downloaded live copy. Report the merged PR, commit, deployment result, and public URL.
