# Publish Three PDFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Functional Analysis II PDF with its completed 2026-07-17 edition and add two non-official Yau competition solution collections to the live Notes page.

**Architecture:** Keep the existing Quarto listing and stable Functional Analysis II URL. Store all six public PDFs under `files/notes/`, define their cards in `data/notes.yml`, lock the intended files and listing shape in the PowerShell regression test, then let the existing GitHub Actions workflow render and deploy the site from `main`.

**Tech Stack:** Quarto 1.9.38, YAML, PowerShell, Node.js test runner, GitHub Actions, GitHub Pages.

## Global Constraints

- Keep `files/notes/functional-analysis-ii-operator-theory.pdf` as the Functional Analysis II download URL.
- Set Functional Analysis II to status `已完成`, version `2026.07`, and date `2026-07-17`.
- Set both competition collections to status `校订稿`, version `2026.07`, and date `2026-07-17`.
- Preserve the exact non-official titles and coverage years printed in the two competition PDFs.
- Do not redesign the homepage or Notes page, create an old-version archive, or modify any PDF content or metadata.
- Keep the current quantum-graph exclusion and the incomplete Functional Analysis I disclosure.

---

## File Map

- `files/notes/functional-analysis-ii-operator-theory.pdf`: stable-path replacement binary for the completed 307-page book.
- `files/notes/yau-mathematical-physics-solutions.pdf`: new 116-page mathematical-physics solution collection.
- `files/notes/yau-probability-statistics-solutions.pdf`: new 332-page probability-and-statistics solution collection.
- `data/notes.yml`: six public Notes cards and their display metadata.
- `README.md`: public-material table and completion/disclaimer text.
- `tests/validate-pearl-theme.ps1`: approved hashes, path counts, statuses, README assertions, rendered-card and rendered-link checks.

### Task 1: Lock the New Publication Contract in Regression Tests

**Files:**
- Modify: `tests/validate-pearl-theme.ps1`
- Test: `tests/validate-pearl-theme.ps1`

**Interfaces:**
- Consumes: the existing `Test-Theme` and `Test-Rendered` checks.
- Produces: exact expectations for six source PDFs and six rendered PDF cards.

- [ ] **Step 1: Change the approved source-file contract**

In `$approvedNotes`, replace the Functional Analysis II hash with `46129B6689855EF979645FB30F930CE816D0821E6B8F452530CDBA5137522145`, replace the stale modern PDE hash with the current repository file hash `EEABDA16EEDDABCD8AEEDFD62E6031A9742FD5F4CD5ABB020EBB36241E493A1B`, then add:

```powershell
[pscustomobject]@{ Path = 'files/notes/yau-mathematical-physics-solutions.pdf'; Target = 'files/notes/yau-mathematical-physics-solutions.pdf'; Hash = 'EA6DDCE10AF948C33AD74B5EC5335881E7E6BA1EB8C2761417D10A9ACD5CD66A' },
[pscustomobject]@{ Path = 'files/notes/yau-probability-statistics-solutions.pdf'; Target = 'files/notes/yau-probability-statistics-solutions.pdf'; Hash = 'AA668FE2F23579DA41760151776B5D4AAB26B2F26197DF78F8795070D6D51AD9' }
```

Change exact counts from four to six. Change status expectations to two `持续修订`, one `复习笔记`, one `已完成`, and two `校订稿`. Replace the old Functional Analysis II README assertion with an assertion that `10 处交叉引用标记待修复` is absent. Expand the README entry list to these six title/status pairs:

```powershell
[pscustomobject]@{ Title = '非交换积分——从冯诺依曼代数到非交换 Lp 空间'; Status = '持续修订' },
[pscustomobject]@{ Title = '泛函分析 I：基础理论——现代分析之门'; Status = '持续修订' },
[pscustomobject]@{ Title = '泛函分析 II：算子理论——算子代数与算子谱理论'; Status = '已完成' },
[pscustomobject]@{ Title = '丘成桐大学生数学竞赛数学物理历年题解（非官方）'; Status = '校订稿' },
[pscustomobject]@{ Title = '丘成桐大学生数学竞赛概率与统计历年题解（非官方）'; Status = '校订稿' },
[pscustomobject]@{ Title = '现代偏微分方程理论——期末复习笔记'; Status = '复习笔记' }
```

- [ ] **Step 2: Change the rendered-site contract**

In `$approvedRenderedNotes`, apply the same Functional Analysis II and modern PDE hash replacements and add the two new path/hash objects. Change the rendered card, link, and PDF-file counts from four to six.

- [ ] **Step 3: Run the focused test and confirm the intended failure**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/validate-pearl-theme.ps1 -Scope Theme
```

Expected: failure containing `notes data does not contain exactly six paths`, proving the test detects that publication data has not yet been updated.

- [ ] **Step 4: Commit the failing contract test**

```powershell
git add tests/validate-pearl-theme.ps1
git commit -m "test: expect completed book and two solution collections"
```

### Task 2: Publish the Three PDF Files and Their Metadata

**Files:**
- Modify: `files/notes/functional-analysis-ii-operator-theory.pdf`
- Create: `files/notes/yau-mathematical-physics-solutions.pdf`
- Create: `files/notes/yau-probability-statistics-solutions.pdf`
- Modify: `data/notes.yml`
- Modify: `README.md`
- Test: `tests/validate-pearl-theme.ps1`

**Interfaces:**
- Consumes: the six-file/hash contract from Task 1 and the three source PDF paths supplied by the user.
- Produces: six valid source cards and six approved PDF files ready for Quarto rendering.

- [ ] **Step 1: Copy the exact approved binaries into the site**

Use literal paths so parentheses and long Windows paths cannot be expanded accidentally:

```powershell
Copy-Item -LiteralPath 'C:\Users\18016\xwechat_files\wxid_c3touz4zmgd822_288c\temp\RWTemp\2026-07\bc2bbcdc36f535f5249315047d7dc6a6\functional-analysis-ii-operator-theory-new(2).pdf' -Destination 'files\notes\functional-analysis-ii-operator-theory.pdf' -Force
Copy-Item -LiteralPath 'C:\Users\18016\Documents\Codex\2026-07-16\ni-2\work\yau-solutions\output\pdf\yau-mathematical-physics-solutions.pdf' -Destination 'files\notes\yau-mathematical-physics-solutions.pdf'
Copy-Item -LiteralPath 'C:\Users\18016\Documents\Codex\2026-07-16\ni-2\work\yau-solutions\output\pdf\yau-probability-statistics-solutions.pdf' -Destination 'files\notes\yau-probability-statistics-solutions.pdf'
```

- [ ] **Step 2: Update `data/notes.yml`**

Replace the Functional Analysis II entry with:

```yaml
- title: "泛函分析 II：算子理论——算子代数与算子谱理论"
  course: "算子理论与算子代数"
  status: "已完成"
  version: "2026.07"
  date: "2026-07-17"
  description: "系统讲述 Banach 代数、C* 代数、von Neumann 代数、有界与无界算子以及非交换测度，共六章。"
  categories: ["学习笔记", "泛函分析", "算子代数"]
  path: "files/notes/functional-analysis-ii-operator-theory.pdf"
```

Insert these entries before the modern PDE entry:

```yaml
- title: "丘成桐大学生数学竞赛数学物理历年题解（非官方）"
  course: "数学竞赛题解"
  status: "校订稿"
  version: "2026.07"
  date: "2026-07-17"
  description: "汇编 2022–2026 年笔试与 2022–2025 年总决赛数学物理题解；为非官方民间整理。"
  categories: ["题解汇编", "数学竞赛", "数学物理"]
  path: "files/notes/yau-mathematical-physics-solutions.pdf"

- title: "丘成桐大学生数学竞赛概率与统计历年题解（非官方）"
  course: "数学竞赛题解"
  status: "校订稿"
  version: "2026.07"
  date: "2026-07-17"
  description: "汇编 2010–2026 年笔试与 2012–2025 年总决赛概率与统计题解；为非官方民间整理。"
  categories: ["题解汇编", "数学竞赛", "概率统计"]
  path: "files/notes/yau-probability-statistics-solutions.pdf"
```

- [ ] **Step 3: Update the README publication table and notes**

Set Functional Analysis II to `已完成`, add both competition collections as `校订稿`, and set the modern PDE version to `2026.07`. Replace the two-book incomplete paragraph with:

```markdown
版本说明：泛函分析 I 当前正文以第 1–4 章为主，第 5–8 章仍在补写，因此继续标记为“持续修订”；泛函分析 II 已完成，并更新至 2026 年 7 月 17 日版本。两份丘成桐大学生数学竞赛题解均为非官方民间汇编，与赛事组委会及命题人无隶属、合作或授权关系。
```

- [ ] **Step 4: Verify source hashes and run the focused test**

Run:

```powershell
Get-FileHash -Algorithm SHA256 files/notes/functional-analysis-ii-operator-theory.pdf,files/notes/yau-mathematical-physics-solutions.pdf,files/notes/yau-probability-statistics-solutions.pdf
powershell -NoProfile -ExecutionPolicy Bypass -File tests/validate-pearl-theme.ps1 -Scope Theme
```

Expected hashes, in order: `46129B6689855EF979645FB30F930CE816D0821E6B8F452530CDBA5137522145`, `EA6DDCE10AF948C33AD74B5EC5335881E7E6BA1EB8C2761417D10A9ACD5CD66A`, and `AA668FE2F23579DA41760151776B5D4AAB26B2F26197DF78F8795070D6D51AD9`. Expected test output: `PASS: Theme`.

- [ ] **Step 5: Commit the source publication**

```powershell
git add data/notes.yml README.md files/notes/functional-analysis-ii-operator-theory.pdf files/notes/yau-mathematical-physics-solutions.pdf files/notes/yau-probability-statistics-solutions.pdf
git commit -m "notes: publish completed book and competition solutions"
```

### Task 3: Render and Verify the Complete Site

**Files:**
- Generated: `_site/**`
- Test: `tests/notes-download.test.mjs`
- Test: `tests/validate-pearl-theme.ps1`

**Interfaces:**
- Consumes: six source entries and six approved PDF files from Task 2.
- Produces: a verified `_site/` with six cards and six downloadable PDFs.

- [ ] **Step 1: Run download behavior tests**

```powershell
node --test tests/notes-download.test.mjs
```

Expected: all Node tests pass with zero failures.

- [ ] **Step 2: Render with the same Quarto version pinned in CI**

```powershell
quarto --version
quarto render
```

Expected version: `1.9.38`. Expected render result: exit code 0 and `_site/notes.html` exists.

- [ ] **Step 3: Run the complete validation suite**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/validate-pearl-theme.ps1 -Scope All
```

Expected output contains `PASS: Photo`, `PASS: Theme`, `PASS: Network`, and `PASS: Rendered`.

- [ ] **Step 4: Inspect the rendered Notes page**

Open `_site/notes.html` and confirm that the six cards render without overlap, the two new non-official titles are legible, Functional Analysis II displays `已完成`, both competition collections display `校订稿`, and each card has its unique PDF link.

- [ ] **Step 5: Confirm no generated files are staged**

```powershell
git status --short
git diff --check
```

Expected: no `_site/` files are tracked or staged, and `git diff --check` reports no whitespace errors.

### Task 4: Publish to GitHub Pages and Verify Production

**Files:**
- No additional source changes expected.

**Interfaces:**
- Consumes: the verified commits from Tasks 1–3.
- Produces: a successful `main` push, completed Pages deployment, and three working production download URLs.

- [ ] **Step 1: Push the verified commits**

```powershell
git push origin main
```

Expected: `main` advances from `51c2e8c` to the local publication tip without a non-fast-forward error.

- [ ] **Step 2: Monitor the Pages workflow**

Use the repository workflow status for the pushed commit and wait until both build and deploy jobs complete successfully. If the workflow fails, inspect the failing step and fix only the demonstrated cause before pushing a follow-up commit.

- [ ] **Step 3: Verify the production page and downloads**

Confirm the Notes page contains the six entries and these URLs respond with PDFs matching the approved hashes:

```text
https://physicsfelix.github.io/Personal-homepage/files/notes/functional-analysis-ii-operator-theory.pdf
https://physicsfelix.github.io/Personal-homepage/files/notes/yau-mathematical-physics-solutions.pdf
https://physicsfelix.github.io/Personal-homepage/files/notes/yau-probability-statistics-solutions.pdf
```

- [ ] **Step 4: Record final evidence**

Record the pushed commit SHA, workflow conclusion, production card count, HTTP status, content type, byte size, and SHA-256 for each of the three production PDFs in the final handoff.
