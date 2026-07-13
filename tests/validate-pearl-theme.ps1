param(
  [ValidateSet('Photo', 'Theme', 'Network', 'Rendered', 'All')]
  [string]$Scope = 'All'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Read-Text([string]$relativePath) {
  Get-Content -Raw -Encoding UTF8 (Join-Path $root $relativePath)
}

function Assert-True([bool]$condition, [string]$message) {
  if (-not $condition) { throw "FAIL: $message" }
}

function Assert-Contains([string]$text, [string]$needle, [string]$message) {
  Assert-True ($text.Contains($needle)) $message
}

function Test-Photo {
  $about = Read-Text 'about.qmd'
  $quarto = Read-Text '_quarto.yml'
  Assert-True (Test-Path (Join-Path $root 'images/profile-photo.jpg')) 'profile photo is missing'
  Assert-Contains $about 'images/profile-photo.jpg' 'about.qmd does not reference the photo'
  Assert-Contains $about '宋志恒的个人照片' 'photo alt text is missing'
  Assert-Contains $quarto '- "images/**"' 'images resource is not declared'
}

function Test-Theme {
  $style = Read-Text 'assets/styles.scss'
  $indexSource = Read-Text 'index.qmd'
  $notesData = Read-Text 'data/notes.yml'
  $notesSource = Read-Text 'notes.qmd'
  $readme = Read-Text 'README.md'
  $noteTemplate = Read-Text '_templates/note-entry.yml'
  $approvedNotes = @(
    [pscustomobject]@{ Path = 'files/notes/noncommutative-integration.pdf'; Target = 'files/notes/noncommutative-integration.pdf'; Hash = '0BF37951DA63853A67D009AAE0AE64EA5E6685C9FA997C08AFE64A6F92E0B4A6' },
    [pscustomobject]@{ Path = 'files/notes/functional-analysis-i-foundations.pdf'; Target = 'files/notes/functional-analysis-i-foundations.pdf'; Hash = '6874D1EE752E8160BA82F9DAEB05966DD40E69E540912DFD3EDA05FD8A569233' },
    [pscustomobject]@{ Path = 'files/notes/functional-analysis-ii-operator-theory.pdf'; Target = 'files/notes/functional-analysis-ii-operator-theory.pdf'; Hash = '3F85633EE1F189C5D87ECBDB566AF9474A27D7941B4301255F2EED88EA11633A' },
    [pscustomobject]@{ Path = 'files/notes/modern-pde-final-review.pdf'; Target = 'files/notes/modern-pde-final-review.pdf'; Hash = '75BE1EA99360009412A106DB5DDBB95BD470D24635494804345571695010F905' }
  )
  $profilePhotoMatch = [regex]::Match($style, '(?ms)^\s*\.profile-photo\s*\{(?<body>.*?)^\s*\}')
  Assert-True $profilePhotoMatch.Success 'profile photo rule is missing'
  $profilePhoto = $profilePhotoMatch.Groups['body'].Value
  Assert-Contains $style '$body-bg: #f7f9ff;' 'light Bootstrap body token is missing'
  Assert-Contains $style 'color-scheme: light;' 'browser color scheme is not light'
  Assert-Contains $style '--bg-0: #f7f9ff;' 'pearl background token is missing'
  Assert-Contains $style '--text: #14213d;' 'navy text token is missing'
  Assert-Contains $style '--text-faint: #5c6d88;' 'faint text token does not meet the approved contrast'
  Assert-Contains $style '--surface-1: rgba(255, 255, 255, .82);' 'glass surface token is missing'
  Assert-Contains $style 'outline: 3px solid #086f91;' 'focus outline does not use the approved solid contrast color'
  Assert-True (-not $style.Contains('$body-bg: #060913;')) 'dark Bootstrap body token remains active'
  Assert-Contains $style '.page-layout-full > main.content.column-page' 'full-width regression guard is missing'
  Assert-Contains $style 'overflow-wrap: break-word;' 'long contact text guard is missing'
  $profileSideCapPattern = '(?ms)@media\s*\(max-width:\s*960px\)\s*\{(?:(?!@media).)*?\.signal-card,\s*\.profile-side,\s*\.profile-aside\s*\{\s*max-width:\s*36rem;\s*\}'
  Assert-True ([regex]::IsMatch($style, $profileSideCapPattern)) 'profile-side is not capped with the 960px side-card group'
  Assert-Contains $profilePhoto 'height: auto;' 'profile photo does not preserve its intrinsic aspect ratio'
  Assert-Contains $profilePhoto 'object-fit: contain;' 'profile photo is not fully contained'
  Assert-True (-not $profilePhoto.Contains('aspect-ratio: 3 / 2;')) 'profile photo still forces a cropping aspect ratio'
  $aboutSource = Read-Text 'about.qmd'
  $aboutContent = Read-Text '_content/about.md'
  Assert-True (-not $aboutSource.Contains('EDIT / PUBLISH')) 'public About source still exposes EDIT / PUBLISH'
  Assert-True (-not $aboutSource.Contains('_variables.yml')) 'public About source still exposes the variables filename'
  Assert-True (-not $aboutSource.Contains('不要公开手机号、微信、家庭住址')) 'public About source still exposes the internal privacy reminder'
  Assert-True (-not $aboutSource.Contains('.edit-reminder')) 'public About source still contains the edit reminder class'
  Assert-True (-not $style.Contains('.edit-reminder')) 'stylesheet still contains edit reminder rules'
  Assert-Contains $aboutContent '## 简介 {.statement-section}' 'About statement lacks its semantic section class'
  Assert-Contains $aboutContent '::: {.statement-grid}' 'About statement lacks the wide layout wrapper'
  Assert-Contains $aboutContent '::: {.statement-main}' 'About statement lacks the main prose wrapper'
  Assert-Contains $aboutContent '::: {.statement-note}' 'About statement lacks the public-note wrapper'
  Assert-True ([regex]::IsMatch($style, '(?ms)\.page-section\s*>\s*section\.statement-section\s*\{\s*max-width:\s*none;\s*\}')) 'statement section does not escape the prose width cap'
  Assert-True ([regex]::IsMatch($style, '(?ms)\.statement-grid\s*\{.*?grid-template-columns:\s*minmax\(0,\s*1\.55fr\)\s+minmax\(18rem,\s*\.75fr\);')) 'desktop statement grid is not the approved two-column layout'
  Assert-True (-not [regex]::IsMatch($style, '(?ms)@media\s*\(min-width:\s*961px\).*?\.interest-matrix\s*\{\s*grid-template-columns:\s*repeat\(4,')) 'four-column interest rule is still present'
  Assert-True ([regex]::IsMatch($style, '(?ms)\.interest-matrix\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);')) 'interest matrix is not two columns by default'
  Assert-True ([regex]::IsMatch($style, '(?ms)@media\s*\(max-width:\s*720px\).*?\.interest-matrix.*?grid-template-columns:\s*1fr;')) 'mobile interest matrix is not one column'
  Assert-True ([regex]::IsMatch($style, '(?ms)\.interest-label\s*\{.*?white-space:\s*nowrap;')) 'wide interest labels can still wrap'
  Assert-Contains $aboutSource '## 当前学术兴趣 {.interest-section}' 'current-interest heading lacks the semantic layout class'
  Assert-Contains $style '.page-section > section:not(.interest-cell):not(.interest-section)' 'long-form width guard does not exclude interest section'
  Assert-True ([regex]::IsMatch($style, '(?ms)\.page-section\s*>\s*section\.interest-section\s*\{\s*max-width:\s*none;\s*\}')) 'interest section does not escape the 70ch width cap'
  Assert-True (-not $indexSource.Contains('signal-formula')) 'home source still contains the removed signal formula'
  Assert-True (-not $indexSource.Contains('\begin{aligned}')) 'home source still contains the removed aligned formula'
  Assert-True (-not $style.Contains('.signal-formula')) 'stylesheet still contains unused signal-formula rules'
  $pathMatches = [regex]::Matches($notesData, '(?m)^\s*path:\s*"?([^"\r\n]+)"?\s*$')
  Assert-True ($pathMatches.Count -eq 4) 'notes data does not contain exactly four paths'
  $listedPaths = @($pathMatches | ForEach-Object { $_.Groups[1].Value.Trim() })
  foreach ($note in $approvedNotes) {
    Assert-True ($listedPaths -contains $note.Path) "missing exact approved note path $($note.Path)"
  }
  Assert-True (-not [regex]::IsMatch($notesData, '(?i)quantum[-_ ]?graph|量子图')) 'notes data contains a quantum-graph publication'
  Assert-True (([regex]::Matches($notesData, 'status:\s*"持续修订"')).Count -eq 3) 'continuous-revision status count is not three'
  Assert-True (([regex]::Matches($notesData, 'status:\s*"复习笔记"')).Count -eq 1) 'review-note status count is not one'
  Assert-True (-not $notesSource.Contains('archive-empty-guidance')) 'empty archive guidance remains after publication'
  $projectNotePdfs = @(Get-ChildItem (Join-Path $root 'files/notes') -File -Filter '*.pdf')
  Assert-True ($projectNotePdfs.Count -eq 4) 'project does not contain exactly four public note PDFs'
  foreach ($note in $approvedNotes) {
    $targetPath = Join-Path $root $note.Target
    Assert-True (Test-Path -LiteralPath $targetPath -PathType Leaf) "approved note PDF is missing: $($note.Target)"
    Assert-True ((Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash -eq $note.Hash) "approved note PDF hash mismatch: $($note.Target)"
  }
  Assert-Contains $readme '宋志恒 / Physicsfelix' 'README identity is missing'
  Assert-Contains $readme 'https://physicsfelix.github.io/Personal-homepage/' 'README live site URL is missing'
  Assert-Contains $readme '量子图材料不在本次公开范围内' 'README quantum-graph exclusion is missing'
  Assert-Contains $readme '第 5–8 章仍在补写' 'README Functional Analysis I revision disclosure is missing'
  Assert-Contains $readme '10 处交叉引用标记待修复' 'README Functional Analysis II revision disclosure is missing'
  Assert-Contains $noteTemplate 'path: "files/notes/your-file-name.pdf"' 'note-entry template does not use the Pages-safe example path'
  Assert-True (-not $noteTemplate.Contains('../files/notes/')) 'note-entry template still contains the escaping ../files/notes/ path'
  foreach ($entry in @(
    [pscustomobject]@{ Title = '非交换积分——从冯诺依曼代数到非交换 Lp 空间'; Status = '持续修订' },
    [pscustomobject]@{ Title = '泛函分析 I：基础理论——现代分析之门'; Status = '持续修订' },
    [pscustomobject]@{ Title = '泛函分析 II：算子理论——算子代数与算子谱理论'; Status = '持续修订' },
    [pscustomobject]@{ Title = '现代偏微分方程理论——期末复习笔记'; Status = '复习笔记' }
  )) {
    Assert-True ([regex]::IsMatch($readme, '(?m)^.*' + [regex]::Escape($entry.Title) + '.*' + [regex]::Escape($entry.Status) + '.*$')) "README does not list $($entry.Title) with status $($entry.Status)"
  }
}

function Test-Network {
  $css = Read-Text 'assets/quantum-network.css'
  $js = Read-Text 'assets/spectral.js'
  Assert-Contains $css '--quantum-edge: #397fc5;' 'light canvas edge token is missing'
  Assert-Contains $css '--quantum-node: #285ea8;' 'light canvas node token is missing'
  Assert-Contains $css 'pointer-events: none;' 'canvas pointer isolation is missing'
  Assert-Contains $css '@media (prefers-reduced-motion: reduce)' 'reduced-motion CSS is missing'
  Assert-Contains $js '"#397fc5"' 'JavaScript light fallback edge is missing'
  Assert-Contains $js 'REDUCED_MOTION.matches' 'reduced-motion behavior is missing'
}

function Test-Rendered {
  $workflow = Read-Text '.github/workflows/publish.yml'
  $setupQuartoMatch = [regex]::Match($workflow, '(?ms)^[ \t]*-[ \t]+name:[ \t]+Set up Quarto[ \t]*\r?$.*?(?=^[ \t]*-[ \t]+name:|\z)')
  Assert-True $setupQuartoMatch.Success 'Set up Quarto workflow step is missing'
  $quartoVersionInputPattern = '(?m)^[ \t]*with:[ \t]*\r?\n[ \t]+version:[ \t]+1\.9\.38[ \t]*\r?$'
  Assert-True ([regex]::IsMatch($setupQuartoMatch.Value, $quartoVersionInputPattern)) 'Set up Quarto workflow step is not pinned to version 1.9.38'
  foreach ($page in @('index.html', 'about.html', 'notes.html')) {
    Assert-True (Test-Path (Join-Path $root "_site/$page")) "rendered $page is missing"
  }
  Assert-True (Test-Path (Join-Path $root '_site/404.html')) 'rendered 404.html is missing'
  Assert-True (Test-Path (Join-Path $root '_site/images/profile-photo.jpg')) 'rendered photo is missing'
  $indexHtml = Read-Text '_site/index.html'
  Assert-True (-not $indexHtml.Contains('signal-formula')) 'rendered home still contains the removed signal formula'
  Assert-True (-not $indexHtml.Contains('\begin{aligned}')) 'rendered home still contains the removed aligned formula'
  $aboutHtml = Read-Text '_site/about.html'
  Assert-True (-not $aboutHtml.Contains('EDIT / PUBLISH')) 'rendered About page exposes EDIT / PUBLISH'
  Assert-True (-not $aboutHtml.Contains('_variables.yml')) 'rendered About page exposes the variables filename'
  Assert-True (-not $aboutHtml.Contains('不要公开手机号、微信、家庭住址')) 'rendered About page exposes the internal privacy reminder'
  Assert-True (-not $aboutHtml.Contains('edit-reminder')) 'rendered About page contains the edit reminder class'
  Assert-True ([regex]::IsMatch($aboutHtml, '(?is)<section\b[^>]*class="[^"]*\bstatement-section\b[^"]*"')) 'rendered About statement lacks its semantic class'
  Assert-True ([regex]::IsMatch($aboutHtml, '(?is)<div\b[^>]*class="[^"]*\bstatement-grid\b[^"]*"')) 'rendered About statement lacks its layout grid'
  Assert-True ([regex]::IsMatch($aboutHtml, '(?is)<section\b[^>]*\bclass="[^"]*\binterest-section\b[^"]*"[^>]*>')) 'rendered interest section lacks its semantic class'
  Assert-Contains $aboutHtml 'images/profile-photo.jpg' 'rendered About page does not reference photo'
  $profileImageMatch = [regex]::Match($aboutHtml, '(?is)<img\b(?=[^>]*\bclass\s*=\s*"[^"]*\bprofile-photo\b[^"]*")[^>]*>')
  Assert-True $profileImageMatch.Success 'rendered img.profile-photo element is missing'
  $profileAltMatch = [regex]::Match($profileImageMatch.Value, '(?i)\balt\s*=\s*"([^"]*)"')
  Assert-True $profileAltMatch.Success 'rendered img.profile-photo alt attribute is missing'
  Assert-True ($profileAltMatch.Groups[1].Value -eq '宋志恒的个人照片') 'rendered img.profile-photo alt text is not exact or is empty'
  $notFoundHtml = Read-Text '_site/404.html'
  Assert-Contains $notFoundHtml 'class="button-ghost"' 'rendered 404 return link does not use button-ghost'
  Assert-True (-not $notFoundHtml.Contains('button-secondary')) 'rendered 404 still uses undefined button-secondary'
  $notesHtml = Read-Text '_site/notes.html'
  Assert-True (-not $notesHtml.Contains('示例：第一份讲义')) 'demo note remains visible in the public listing'
  $approvedRenderedNotes = @(
    [pscustomobject]@{ Path = 'files/notes/noncommutative-integration.pdf'; Hash = '0BF37951DA63853A67D009AAE0AE64EA5E6685C9FA997C08AFE64A6F92E0B4A6' },
    [pscustomobject]@{ Path = 'files/notes/functional-analysis-i-foundations.pdf'; Hash = '6874D1EE752E8160BA82F9DAEB05966DD40E69E540912DFD3EDA05FD8A569233' },
    [pscustomobject]@{ Path = 'files/notes/functional-analysis-ii-operator-theory.pdf'; Hash = '3F85633EE1F189C5D87ECBDB566AF9474A27D7941B4301255F2EED88EA11633A' },
    [pscustomobject]@{ Path = 'files/notes/modern-pde-final-review.pdf'; Hash = '75BE1EA99360009412A106DB5DDBB95BD470D24635494804345571695010F905' }
  )
  $pdfLinkPattern = '(?i)\bhref\s*=\s*["'']files/notes/[^"'']+\.pdf["'']'
  Assert-True (([regex]::Matches($notesHtml, $pdfLinkPattern)).Count -eq 4) 'rendered Notes page does not contain exactly four PDF link occurrences'
  foreach ($note in $approvedRenderedNotes) {
    $targetLinkPattern = '(?i)\bhref\s*=\s*["'']' + [regex]::Escape($note.Path) + '["'']'
    Assert-True (([regex]::Matches($notesHtml, $targetLinkPattern)).Count -eq 1) "rendered Notes page does not link exactly once to $($note.Path)"
    $renderedPath = Join-Path $root ("_site/" + $note.Path)
    Assert-True (Test-Path -LiteralPath $renderedPath -PathType Leaf) "rendered note PDF is missing: $($note.Path)"
    Assert-True ((Get-FileHash -LiteralPath $renderedPath -Algorithm SHA256).Hash -eq $note.Hash) "rendered note PDF hash mismatch: $($note.Path)"
  }
  $renderedNotePdfs = @(Get-ChildItem (Join-Path $root '_site/files/notes') -File -Filter '*.pdf')
  Assert-True ($renderedNotePdfs.Count -eq 4) 'rendered site does not contain exactly four note PDFs'
  Assert-True (-not $notesHtml.Contains('archive-empty-guidance')) 'rendered empty archive guidance remains after publication'
  Assert-True (-not [regex]::IsMatch($notesHtml, '(?i)quantum[-_ ]?graph|量子图')) 'rendered Notes page contains a quantum-graph PDF, link, or card'
  $bootstrap = Get-ChildItem (Join-Path $root '_site/site_libs/bootstrap') -Filter 'bootstrap-*.min.css' | Select-Object -First 1
  Assert-True ($null -ne $bootstrap) 'compiled Bootstrap theme CSS is missing'
  $compiled = Get-Content -Raw -Encoding UTF8 $bootstrap.FullName
  Assert-True ($compiled -match '--bg-0\s*:\s*#f7f9ff') 'compiled CSS does not contain pearl token'
  Assert-Contains $compiled 'color-scheme:light' 'compiled CSS is not light'
}

$scopes = if ($Scope -eq 'All') { @('Photo', 'Theme', 'Network', 'Rendered') } else { @($Scope) }
foreach ($item in $scopes) {
  & "Test-$item"
  Write-Output "PASS: $item"
}
