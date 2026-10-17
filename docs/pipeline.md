# 资产管线：从 AI 生成到可交互的分层画作

> 目标：用 AI 生成一幅「梵高《向日葵》风格、带摄影景深」的高清主画，再把它拆成可在 WebGL 中前后错位的透明图层，
> 同时从同一幅画里提取真实笔触、花瓣、种子盘和 33 种黄。整个过程可复现，所有 prompt 与生成元数据都在 `art/` 下。

```
art/prompts/*.json ──► scripts/gen-image.mjs ──► art/raw/*.png (+ .meta.json / .log / .webp 存档)
                                                   │
                         scripts/align_layers.py ◄─┘  SIFT + RANSAC 把每个图层配准回主画
                                   │
                                   ▼
                         art/aligned/*.png + alignment.json
                                   │
                         scripts/build_assets.py   alpha 扩边、形体高度图、笔触/花瓣图集、OKLab 调色板
                                   │
                                   ▼
                         public/assets/*.webp + palette.json ──► 网站
                                   │
       scripts/subset_fonts.py ──► src/assets/fonts/*.woff2（只保留用到的字）
                                   │
       scripts/encode-assets.mjs ─► assets-encoded/*.b64 + manifest.json（文本形式同步到 GitHub）
       scripts/restore-assets.mjs ◄─ npm run dev / build 前自动解码并校验 sha256
```

## 1. 图像生成（`scripts/gen-image.mjs`）

- OpenAI 兼容的 Images API；模型 `gpt-image-2.5-sunburst`，全部 `quality: high`。
- 有 `inputs` 的任务走 `/images/edits`（以主画为参考做抠图 / 重绘），否则走 `/images/generations`。
- 连接信息只从环境变量或 **`.env.local`** 读取（`IMAGE_API_BASE`、`IMAGE_API_KEY`、`IMAGE_MODEL`）。
  `.env.local` 已被 `.gitignore` 忽略，仓库里只有占位的 `.env.example`。**永远不要提交密钥。**
- 每次调用都会写出 `art/raw/<name>.meta.json`（模型、端点、尺寸、耗时、完整 prompt、输入文件）和 `.log`；
  原始 PNG 不入库，入库的是 q90 WebP 存档（`art/raw/*.webp`，经 `assets-encoded/` 同步）。

```bash
cp .env.example .env.local      # 填入你自己的 endpoint 与 key
node scripts/gen-image.mjs art/prompts/01_master.json
# 01 完成后，03–07 以 01 为输入，可并行
for j in 03_layer_bg 04_layer_mid 05_layer_table 06_layer_fg 07_depth; do node scripts/gen-image.mjs art/prompts/$j.json & done; wait
for j in 02_strokes 08_petals 09_seedhead 10_canvas; do node scripts/gen-image.mjs art/prompts/$j.json & done; wait
```

| # | 任务 | 端点 | 尺寸 | 背景 | 耗时 | 用途 |
|---|------|------|------|------|-----:|------|
| 01 | `01_master` | generations | 1536×1024 | 不透明 | 21.3 s | 主画：两色陶罐 + 盛放/低垂/枯萎/结籽的向日葵，前景大虚化（景深），黄墙黄桌与蓝色分界线 |
| 02 | `02_strokes` | generations | 1536×1024 | 透明 | 23.1 s | 15 道互不接触的厚涂笔触标本 → 4×4 笔触图集（Studio 笔刷与粒子） |
| 03 | `03_layer_bg` | edits(01) | 1536×1024 | 不透明 | 44.6 s | 背景层：移除所有花与陶罐并补全墙面/桌面 |
| 04 | `04_layer_mid` | edits(01) | 1536×1024 | 透明 | 26.9 s | 中景层：只保留陶罐 + 整束花 |
| 05 | `05_layer_table` | edits(01) | 1536×1024 | 透明 | 58.9 s | 桌面层：倒下的花头 + 散落花瓣 |
| 06 | `06_layer_fg` | edits(01) | 1536×1024 | 透明 | 52.8 s | 前景层：画框边缘的大块虚化花叶 |
| 07 | `07_depth` | edits(01) | 1536×1024 | 不透明 | 23.9 s | 单目深度图（前景白、花束中灰、墙最黑），用于视差与景深参考 |
| 08 | `08_petals` | generations | 1536×1024 | 透明 | 31.3 s | 14 片舌状花瓣标本 → 8×2 花瓣图集（3D 向日葵） |
| 09 | `09_seedhead` | generations | 1024×1024 | 透明 | 29.2 s | 正视的种子盘（斐波那契螺旋、厚涂） |
| 10 | `10_canvas` | generations | 1024×1024 | 不透明 | 22.7 s | 可平铺的亚麻画布微距（侧光下的布纹） |

**Prompt 设计要点**（全文见 `art/prompts/*.json`）：

1. **先整后分**。景深必须在一张统一的画里成立，所以先生成完整主画 01，再用 edits 端点从同一张画里「抠」出各层，
   保证光线、笔触和色彩完全一致；背景层 03 则要求把花和罐子去掉后**补画**被遮挡的墙和桌面，图层错位时才不会露洞。
2. **景深写进画里**：前景元素明确要求「大而虚、出画框」，中景清晰，墙面略软 —— 网页里的视差只是把它「打开」。
3. **标本页**（02/08）要求「透明背景、网格排列、互不接触」，便于脚本按连通域切图；09/10 强调正视、平光、无透视。
4. 风格约束只描述媒介与时代（厚涂、铬黄与那不勒斯黄、1888 年阿尔勒），不要求复制任何现存画面的构图。

## 2. 图层配准（`scripts/align_layers.py`）

图像模型做 edits 时会轻微重新取景（缩放 / 平移），所以每个透明层都用 **SIFT 特征 + RANSAC 相似变换**
（旋转 + 等比缩放 + 平移，只在该层不透明像素上取特征）配准回主画，结果写入 `art/aligned/alignment.json`：

| 图层 | 匹配 / 内点 | 缩放 | 平移 (px) | 旋转 | 处理 |
|------|-----------:|-----:|----------:|-----:|------|
| `04_layer_mid` | 852 / 801 | 0.859 | (108.0, 1.4) | 0.03° | 采用变换（模型把花束放大了约 16%） |
| `05_layer_table` | 28 / 11 | 0.575 | (529.9, 455.1) | 4.88° | 采用变换（桌面层被模型重新构图，必须配准） |
| `06_layer_fg` | 38 / 33 | 1.001 | (−1.3, −0.1) | −0.06° | 近似恒等 |

## 3. 网页资产（`scripts/build_assets.py`）

| 输出 | 大小 | 说明 |
|------|-----:|------|
| `bg.webp` `mid.webp` `table.webp` `fg.webp` | 366 / 274 / 83 / 51 KB | 四个景深层；透明像素做 push-pull 颜色扩边，避免线性过滤出黑边 |
| `mid_form.webp` `table_form.webp` | 3.4 / 1.5 KB | 低频「形体高度图」（模糊 alpha + 亮度），在顶点着色器里把罐子、花束和倒下的花头推成浮雕 |
| `master.webp` | 332 KB | 完整主画：取色探针、加载页、海报 |
| `strokes.webp` | 153 KB | 4×4 真实笔触图集（亮度 = 颜料厚度，alpha = 覆盖） |
| `petals.webp` | 118 KB | 8×2 花瓣图集 |
| `seedhead.webp` | 288 KB | 种子盘 |
| `canvas.webp` | 92 KB | 亚麻布纹 |
| `palette.json` | 8 KB | 33 种黄 + 8 个辅色 |

### 调色板：「三十三种黄」是测出来的

- 主画缩到 768×512，转换到 **OKLab**；黄色掩码：色相 52°–118°、彩度 C > 0.045、明度 L > 0.42。
  黄色像素占全画 **90.2%**。
- 对黄色像素做 k-means（k = 33，OpenCV k-means++，随机种子 1888，L 通道 ×1.6 以强调明度台阶），
  非黄色像素另做 k = 7，再补一个由全部蓝色像素平均得到的普鲁士蓝，共 8 个辅色。
- 每个黄色簇按 OKLCh 归入 11 个颜料家族（柠檬黄、那不勒斯黄、浅铬黄、铬黄、深铬黄、铬橙、土黄、赭黄、生赭、熟赭、橄榄黄），
  按明度从亮到暗编号 Y01–Y33；明度跨度 L 0.44 → 0.89。
- 第一章的数万道笔触就按这个调色板与明度排序「长」成一朵花：最暗的黄进花心，最亮的黄上花瓣尖。

## 4. 字体（`scripts/subset_fonts.py`）

马善政（书法标题）、思源宋体 Noto Serif SC（正文）、Fraunces（西文斜体）均为 SIL OFL。脚本自动下载并只保留站内用到的字形：
Noto Serif SC 收集 `src/**/*.ts(x)` 与 `index.html` 里的全部汉字；马善政只取 `content.ts` 中
`/* calligraphy:start */ … /* calligraphy:end */` 之间的字；Fraunces 固定 `SOFT=100, WONK=1`。四个 woff2 合计约 368 KB。
**改动任何文案后都要重新运行一次**，否则新字会回退到系统字体。

## 5. 二进制资产的文本化同步（`assets-encoded/`）

本项目通过只接受文本的 API 同步到 GitHub，所以所有二进制（网站纹理、字体、AI 原图的 WebP 存档）由
`scripts/encode-assets.mjs` 编码为每行 100 字符的 base64，单个分片不超过 600 000 字符，并在 `manifest.json`
记录路径、字节数与 sha256。`npm run dev` / `npm run build` 之前会自动执行 `scripts/restore-assets.mjs`：
逐个解码、校验 sha256，已存在且校验一致的文件会跳过。

```bash
python3 scripts/build_assets.py     # 重新生成 public/assets
python3 scripts/subset_fonts.py     # 重新裁剪字体
node scripts/encode-assets.mjs      # 更新 assets-encoded/
```
