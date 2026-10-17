<#
  deploy-ghpages.ps1 — 把「向日葵 · 黄色交响曲」构建并部署到 GitHub Pages

  做三件事：
    1. 构建（npm ci 视需要；npm run build → dist/）
    2. 把源码推到 main，把 dist/ 推到 gh-pages（含 .nojekyll）
    3. 开启/更新 Pages（source = gh-pages 分支根目录）并轮询直到确认上线

  用法（Windows PowerShell 5.1 已可用；脚本内含 UTF-8 BOM）：
    powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-ghpages.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-ghpages.ps1 -SkipBuild
    powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-ghpages.ps1 -Repo 其他名字

  依赖：Node 20+、git、已登录的 GitHub CLI（gh auth login）。
  说明：vite.config.ts 里 base: './' 让产物可放在任意子路径，因此 Pages 的
        /<repo>/ 路径无需额外配置。
#>
[CmdletBinding()]
param(
  [string]$Owner     = 'Harryis666',
  [string]$Repo      = 'sunflowers-3d',
  [string]$GhAccount = 'Harryis666',
  [string]$GhExe     = 'C:\Program Files\GitHub CLI\gh.exe',
  [string]$CommitEmail = '',
  [switch]$SkipBuild
)

# 必须用 Continue：PS 5.1 下把原生命令 stderr 用 2>&1 合并进管道会生成 ErrorRecord，
# 若 ErrorActionPreference=Stop 会被当成致命错误而中断（vite 的告警就会触发）。
# 真正的失败一律显式用 $LASTEXITCODE 判断后 throw。
$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'
$Root = $PSScriptRoot
Set-Location $Root

function Say($m)  { Write-Host "[deploy] $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "[deploy] $m" -ForegroundColor Yellow }

# ---- 0. 前置检查 -----------------------------------------------------------
if (-not (Test-Path $GhExe)) { $g = Get-Command gh -ErrorAction SilentlyContinue; if ($g) { $GhExe = $g.Source } }
if (-not (Test-Path $GhExe)) { throw "找不到 GitHub CLI（gh）。请先安装：https://cli.github.com/" }
foreach ($exe in 'node', 'git') {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { throw "找不到 $exe，请先安装。" }
}
Say "node $(node -v) / git $((git --version))"

$env:GIT_TERMINAL_PROMPT = '0'
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'   # 对已知的 configLoader 告警静音
$env:GH_PAGER = ''
# 让 gh 用指定账号的令牌（本机有多个 gh 账号，必须显式指定，否则会 404）
$tok = (& $GhExe auth token --user $GhAccount 2>$null | Select-Object -First 1)
if (-not $tok) { throw "拿不到 $GhAccount 的 gh 令牌，请先执行：gh auth login --user $GhAccount" }
$env:GH_TOKEN = $tok
$scrub = { param($line) if ($null -eq $line) { '' } else { ($line -replace [regex]::Escape($tok), '***') } }

# ---- 1. 构建 ---------------------------------------------------------------
if (-not $SkipBuild) {
  if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
    Say 'npm ci ...'
    & npm ci --no-audit --no-fund 2>&1 | ForEach-Object { & $scrub $_ }
    if ($LASTEXITCODE -ne 0) { throw 'npm ci 失败' }
  }
  Say 'npm run build ...'
  & npm run build 2>&1 | ForEach-Object { & $scrub $_ }
  if ($LASTEXITCODE -ne 0) { throw 'npm run build 失败' }
}
if (-not (Test-Path (Join-Path $Root 'dist\index.html'))) { throw 'dist/index.html 不存在，构建未成功。' }
$distFiles = Get-ChildItem (Join-Path $Root 'dist') -Recurse -File
Say ("dist 就绪：{0} 个文件 / {1:N2} MB" -f $distFiles.Count, (($distFiles | Measure-Object Length -Sum).Sum / 1MB))

# ---- 2. 建仓库（幂等） -----------------------------------------------------
$exists = $false
for ($i = 1; $i -le 4; $i++) {
  & $GhExe repo view "$Owner/$Repo" --json name 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $exists = $true; break }
  if ($i -eq 1) { Say "目标仓库 $Owner/$Repo 不存在，将创建为 public。" }
  Start-Sleep -Seconds 2
}
if (-not $exists) {
  & $GhExe repo create "$Owner/$Repo" --public `
      --description "向日葵 · 黄色交响曲 — an interactive 3D homage to Van Gogh's Sunflowers (1888)" 2>&1 |
      ForEach-Object { & $scrub $_ }
  if ($LASTEXITCODE -ne 0) { throw "创建仓库失败（可能名字被占用，可用 -Repo 换名）。" }
}
Say "仓库：https://github.com/$Owner/$Repo"

$Remote = "https://x-access-token:$tok@github.com/$Owner/$Repo.git"
if (-not $CommitEmail) { $CommitEmail = "$Owner@users.noreply.github.com" }

function New-StagingDir([string]$Name) {
  $p = Join-Path $env:TEMP "sf3d-deploy\$Name"
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $p | Out-Null
  return $p
}
function Push-Branch([string]$Dir, [string]$Branch, [string]$Msg) {
  Push-Location $Dir
  try {
    git -c credential.helper= init -q 2>&1 | ForEach-Object { & $scrub $_ }
    git -c credential.helper= checkout -q -b $Branch 2>&1 | ForEach-Object { & $scrub $_ }
    git -c credential.helper= -c core.autocrlf=false add -A 2>&1 | ForEach-Object { & $scrub $_ }
    git -c credential.helper= -c core.autocrlf=false `
        -c user.name="$Owner" -c user.email="$CommitEmail" `
        commit -q -m $Msg 2>&1 | ForEach-Object { & $scrub $_ }
    git -c credential.helper= remote add origin $Remote 2>&1 | ForEach-Object { & $scrub $_ }
    $pushed = $false
    for ($i = 1; $i -le 4 -and -not $pushed; $i++) {
      git -c credential.helper= push -f -q origin "$Branch`:$Branch" 2>&1 | ForEach-Object { & $scrub $_ }
      if ($LASTEXITCODE -eq 0) { $pushed = $true } else { Warn "push $Branch 第 $i 次失败，重试…"; Start-Sleep -Seconds 3 }
    }
    if (-not $pushed) { throw "推送 $Branch 失败" }
    Say "已推送分支 $Branch"
  } finally { Pop-Location }
}

# main = 完整源码（node_modules/dist 由 .gitignore 排除；二进制素材在 assets-encoded/ 里）
Say '打包源码并推送 main ...'
$srcDir = New-StagingDir 'src'
robocopy $Root $srcDir /E /XD node_modules dist .git /NFL /NDL /NJH /NJS /NP | Out-Null
Push-Branch $srcDir 'main' 'deploy: sunflowers-3d website source'

# gh-pages = 已构建好的静态产物
Say '打包 dist 并推送 gh-pages ...'
$pagesDir = New-StagingDir 'pages'
robocopy (Join-Path $Root 'dist') $pagesDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
# .nojekyll：跳过 Jekyll，避免下划线开头文件被忽略
Set-Content -Path (Join-Path $pagesDir '.nojekyll') -Value '' -NoNewline -Encoding ascii
Push-Branch $pagesDir 'gh-pages' 'deploy: built static site'

# ---- 3. 开启 / 更新 Pages --------------------------------------------------
Say '配置 Pages（source = gh-pages /）...'
& $GhExe api -X POST "repos/$Owner/$Repo/pages" `
    -f "source[branch]=gh-pages" -f "source[path]=/" 2>&1 | ForEach-Object { & $scrub $_ }
if ($LASTEXITCODE -ne 0) {
  & $GhExe api -X PUT "repos/$Owner/$Repo/pages" `
      -f "source[branch]=gh-pages" -f "source[path]=/" 2>&1 | ForEach-Object { & $scrub $_ }
  if ($LASTEXITCODE -ne 0) { Warn 'Pages 配置返回非零（可能已开启或稍后生效，可忽略）。' }
}

$url = "https://$($Owner.ToLower()).github.io/$Repo/"
Say "线上地址：$url"
Say '（首次发布通常需要 1–3 分钟生效）'

# ---- 4. 轮询验证 -----------------------------------------------------------
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 10
  try {
    $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 20
    if ($r.StatusCode -eq 200 -and $r.Content -match '向日葵') {
      Say "部署成功  $url  （HTTP $($r.StatusCode)，$($r.RawContentLength) 字节）"
      exit 0
    }
    Warn "第 $i 次：HTTP $($r.StatusCode)，页面尚未就绪…"
  } catch { Warn "第 $i 次：$($_.Exception.Message)" }
}
Warn "已推送但轮询未确认上线，请稍后手动打开：$url"
exit 0
