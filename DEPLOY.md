# 部署记录 · 向日葵 3D 网站

本目录是把 GitHub 仓库里的一个子项目克隆下来、构建并部署到公网静态托管的产物。

## 版本

| 版本 | 提交 | 说明 |
|---|---|---|
| v1 | `47553c44` | 首次克隆并部署（本地 + GitHub Pages） |
| **v2（当前）** | **`cd80a1eb`** | **新增「自动浏览（自动模式）」`?auto`，含 `src/auto/*`、`qa/auto.mjs`、字体子集更新** |

## 1. 来源（克隆自哪里）

| 项 | 值 |
|---|---|
| 仓库 | `Harryis666/notion-ai`（**私有**，需 gh 已登录账号 `Harryis666`） |
| 分支 | `liharry18/向日葵3D网站制作` |
| 子目录 | `sunflowers-3d-website` |
| 当前提交 | `cd80a1eb99ee295f2235ef4f13fd3e295ba892aa` |
| 作者 / 日期 | Harry Li / 2026-10-15 14:32:11 -0400 |

原链接：<https://github.com/Harryis666/notion-ai/tree/liharry18/%E5%90%91%E6%97%A5%E8%91%B53D%E7%BD%91%E7%AB%99%E5%88%B6%E4%BD%9C/sunflowers-3d-website>

> 注意：链接里的 `liharry18/向日葵3D网站制作` 是**分支名**（含斜杠），
> `sunflowers-3d-website` 才是分支内的路径。所以不能按「目录」去解析这个 URL。
>
> 另外本机 `gh` 的**活动账号是 `BitSeek-AILab`**（还会登录超时），直接 `git clone` 会报
> `Repository not found`。必须显式取 `Harryis666` 的令牌：
> `$tok = gh auth token --user Harryis666`。

克隆命令（只取该分支最新一次提交，`--depth 1`）：

```bash
git clone --depth 1 --single-branch \
  --branch "liharry18/向日葵3D网站制作" \
  https://github.com/Harryis666/notion-ai.git
```

## 2. 自动浏览（自动模式）★ v2 新增

网站自己把六章走一遍，全长 **63.6 秒**：滚动、移动、悬停、点击、按住、拖动全部经由网站自己的交互代码完成，
所以视觉与声音和真人操作完全一样。播放时光标换成一朵梵高风格的向日葵，每次点击显示铬黄波纹与飞散花瓣。

| 入口 | 说明 |
|---|---|
| **门页按钮**「▶ 自动浏览 · 约 1 分钟」 | 门页直接点 |
| 门页按 <kbd>A</kbd> | 键盘快捷方式 |
| 页眉「自动浏览」/ 尾声卡片按钮 | 进门后从任意位置开始（会先滑回开头） |
| **`?auto`** | 门页照常，点「带声音进入/静音进入」（或回车）即开始 —— **录屏专用** |
| **`?auto=loop`** | 循环播放，适合展厅 / 大屏 |
| <kbd>Esc</kbd> | 随时退出，按住的也立即松开 |

* 播完光标淡出，页面正常交还。
* 播放期间真实鼠标/滚轮/触摸被挡住，误碰不会打乱录制；点一下页面底部会浮出「自动浏览中 · 点此或按 Esc 退出」。
* 分镜在 `src/auto/storyboard.ts`，驱动在 `src/auto/autopilot.ts`，逐拍核对见 `node qa/auto.mjs`。
* 录屏建议：浏览器全屏 16:9（1920×1080）、录制打开「系统声音/标签页音频」、鼠标移入页面后保持不动。

## 3. 本地构建

技术栈：Three.js / WebGL2 / GLSL / React 19 / TypeScript / Vite 8 / Tailwind 4 / Web Audio / Lenis。

图片与字体在仓库里以 **base64 文本分片**存放在 `assets-encoded/`（附 `manifest.json` 与 sha256），
构建前由 `scripts/restore-assets.mjs` 自动还原成二进制。

```powershell
npm ci            # 52 个包
npm run build     # prebuild = restore-assets → tsc --noEmit → vite build
```

v2 实测结果：

```
[assets] 1 restored, 24 already up to date
vite v8.3.4 building client environment for production...
✓ 52 modules transformed.          # v1 是 50，+2 来自 src/auto/*
✓ built in 2.38s
dist: 20 个文件 / 3.00 MB
```

产物：

| 文件 | 大小 |
|---|---|
| `assets/index-DLwOwGXA.js` | 928.41 kB（gzip 262.99 kB） |
| `assets/index-B4vDn7e6.css` | 48.88 kB（gzip 10.19 kB） |
| `assets/notoserifsc-subset-D5nKutNX.woff2` | 223.76 kB（v2 重新子集化） |

`vite.config.ts` 里 `base: './'`，产物引用全是相对路径（`./assets/...`），
因此可以直接放在任意子路径下托管，GitHub Pages 的 `/<repo>/` 不需要任何额外配置。

## 4. 公网部署（GitHub Pages）

| 项 | 值 |
|---|---|
| 仓库 | <https://github.com/Harryis666/sunflowers-3d>（public） |
| 线上地址 | **<https://harryis666.github.io/sunflowers-3d/>** |
| 自动模式 | **<https://harryis666.github.io/sunflowers-3d/?auto>** |
| 循环自动模式 | <https://harryis666.github.io/sunflowers-3d/?auto=loop> |
| Pages 源 | `gh-pages` 分支，路径 `/` |
| 源码分支 | `main`（完整源码，含 `assets-encoded/`） |
| 静态产物分支 | `gh-pages`（已构建的 `dist/` + `.nojekyll`） |

一键重新部署：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-ghpages.ps1
```

脚本做的事：构建 → 推送 `main`（源码）与 `gh-pages`（产物）→ 开启/更新 Pages → 轮询直到线上返回 200。
可用 `-SkipBuild` 跳过构建，用 `-Repo 别的名字` 换仓库名。

### 上线验证（v2 实测）

* `GET /` → `HTTP 200`，`18421` 字节，`Server: GitHub.com`，`Via: 1.1 varnish`
* 线上 HTML 引用的是**新** bundle：`index-DLwOwGXA.js` / `index-B4vDn7e6.css`（不是 v1 的旧缓存）
* 线上 JS 与本地 `dist/assets/index-DLwOwGXA.js` **SHA256 完全一致**，CSS 同样一致：

  ```
  JS   live=local=7B312E0AF83931417BEC33D1C9A1549F0689DC78E428D5CFA99FE7FFF14F0628
  CSS  live=local=D79C04AD2B38D5D60FA09B66FBA4894A5F52500B3E67B05C68B6D0E4C736B7F7
  ```

  → **线上跑的就是本地实测过的那份代码**。
* 线上 JS 内含 `__autopilot`，`gh api .../pages` → `status=built`, `source.branch=gh-pages`

### 自动模式实测（本地 127.0.0.1:4174，无头 Chromium）

打开 `/?auto` → 门页正常（含「自动浏览」按钮与「带声音进入/静音进入」）→ 点「静音进入」后：

```
hasAutopilot = true
running      = true
duration     = 63.6 s
html.class   = "lenis autopilot has-sun-cursor"   ← 自动浏览皮肤 + 向日葵光标已接管
#sun-cursor  = 存在
页面报错      = 无
```

## 5. 本地预览 / 本地部署

```powershell
node qa/serve.mjs 4174 dist     # 带 brotli/gzip，模仿真实静态托管
# → http://127.0.0.1:4174/          普通
# → http://127.0.0.1:4174/?auto     自动浏览
# → http://127.0.0.1:4174/?auto=loop 循环自动浏览
```

## 6. 想换别的托管平台

`dist/` 是**完全可搬运的纯静态产物**（`base: './'`），三个平台都零改动：

| 平台 | 做法 |
|---|---|
| Vercel | `npx vercel deploy --prod dist` |
| Netlify | `npx netlify deploy --prod --dir dist` |
| 任意对象存储 / Nginx | 把 `dist/` 原样上传，入口 `index.html` |

## 7. 备注

* `sunflowers-3d` 是本次新建的 **public** 仓库（Pages 对私有仓库需要 GitHub Pro）。
  不想公开的话：`gh repo delete Harryis666/sunflowers-3d`，再改用 Vercel/Netlify。
* 提交作者用的是 `Harryis666@users.noreply.github.com`，未使用本机全局的 gitee 身份。
* 网站不需要任何 API key；所有素材都已生成好并随仓库分发。
* 环境注意：本机 shell 是 **Windows PowerShell 5.1**，所以脚本用 `-ExecutionPolicy Bypass` 运行，
  且文件带 **UTF-8 BOM**（否则 5.1 按 ANSI 解析会乱码）；部署脚本内 `$ErrorActionPreference='Continue'`
  （`Stop` 会把 Vite 的 stderr 告警当成致命错误而中断）。
