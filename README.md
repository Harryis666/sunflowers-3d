# 向日葵 · 黄色交响曲 — Sunflowers, a Symphony in Yellow

一个向梵高《向日葵》（阿尔勒，1888）致敬的交互式 3D 创意网站。
三十余种黄、厚涂（impasto）的笔触、每一朵像一颗跳跃的小太阳——我们把一幅 AI 再创作的“梵高式”静物拆成景深图层和数万笔真实笔触，用 WebGL 让它重新呼吸。

> 技术栈：**Three.js · WebGL2 · GLSL · React 19 · TypeScript · Vite · Tailwind CSS 4 · Web Audio · Lenis**


## 体验章节

| # | 章节 | 交互 |
|---|------|------|
| 序 | **向日葵**：2.5D 景深立体画（背景墙 / 花瓶花束 / 桌面落花 / 虚化前景） | 光标就是阿尔勒的太阳（实时侧光、视差）；按住 = 低角度侧光审视颜料厚度；点击花朵 = 花头旋跳、花瓣迸飞、和弦；取色放大镜显示光标下的那一种黄 |
| 01 | **三十三种黄**：画面溶解成 48 000 笔真实笔触，按明度重新排列，长成一朵“颜色之花” | 悬停色带/花盘聆听每一种黄（每种黄一个音高）；点击固定高亮；拖拽 3D 旋转 |
| 02 | **粗粝有刺的生命**：程序化 3D 向日葵走完一生：蓓蕾 → 盛放 → 凋萎 → 结籽 | 滚动推进生命周期；拖拽旋转；一键点亮 34 / 55 条斐波那契螺线 |
| 03 | **画会像花一样褪色**：铬黄老化的艺术化模拟（1888 → 2150） | 拖动时间轴，或随滚动自动老化 |
| 04 | **留下你的一笔**：实时厚涂画布（颜色 + 高度双缓冲、侧光） | 选色作画、调笔触大小、“种一朵”程序化作画、保存带“向日葵”印章的 PNG |
| 尾声 | **一首蓝与黄的交响曲**：烛光夜景，花朵如灯 | 光标是一盏烛灯 |

全站支持：键盘/读屏（章节导航、`aria-*`）、`prefers-reduced-motion`、触屏（移动端独立布局与性能档位）、WebGL 不可用时的静态降级。

## 自动浏览（自动模式）

让网站自己把六章走一遍（约 64 秒）：滚动、移动、悬停、点击、按住、拖动，全部经由网站自己的交互代码完成，所以视觉效果和声音
与真人操作完全一样。播放时光标换成一朵梵高风格的向日葵，每次点击都会显示出来（一圈铬黄波纹和几片飞散的花瓣）。

- **开始**：门页「▶ 自动浏览 · 约 1 分钟」，或在门页按 <kbd>A</kbd>；进门后点页眉的「自动浏览」或尾声卡片里的按钮
  （会先滑回开头再开始）。
- **录屏专用地址 `?auto`**：例如 `https://你的域名/?auto`。门页和平时一模一样，但点「带声音进入」/「静音进入」（或直接按回车）
  就开始自动浏览。`?auto=loop` 会循环播放（展厅、大屏）。
- **退出**：<kbd>Esc</kbd>。播放期间，真实的鼠标、滚轮、触摸和滚动键都会被挡住，误碰不会打乱录制；点一下页面，底部会出现
  「自动浏览中 · 点此或按 Esc 退出」。最后一拍结束后向日葵光标淡出，页面交还给你。
- **录屏建议**：浏览器全屏，16:9（如 1920×1080）最接近分镜设计，其他尺寸会按实时布局自动对位；录屏软件打开“系统声音/标签页
  音频”；把鼠标放进页面并保持不动（系统光标会被隐藏）。
- 分镜在 [`src/auto/storyboard.ts`](src/auto/storyboard.ts)（滚动关键帧、光标路径、按下/抬起时刻）。`qa/record.mjs` 拍演示成片时
  播放的也是这同一份分镜。

## 快速开始

```bash
cd sunflowers-3d-website
npm install
npm run dev        # http://localhost:5173 （predev 会先从 assets-encoded/ 还原二进制素材）
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览生产构建
```

需要 Node 20+。不需要任何 API key 就能运行网站——所有生成好的素材都在仓库里。

### 关于 `assets-encoded/`

本仓库通过只支持文本的通道同步，所以图片和字体以 **base64 文本分片**的形式提交在 `assets-encoded/`（附 `manifest.json` 与 sha256 校验）。
`npm run dev / build` 之前会自动执行 `node scripts/restore-assets.mjs`，把它们还原为：

- `public/assets/*.webp` —— 网站运行用的纹理（母版、四个景深图层、两张形体高度图、笔触/花瓣图集、花盘、亚麻画布）
- `src/assets/fonts/*.woff2` —— 子集化字体（Noto Serif SC、Ma Shan Zheng、Fraunces）
- `art/raw/*.webp` —— AI 原始生成结果的存档（q90 WebP）

修改素材后运行 `node scripts/encode-assets.mjs` 重新编码。

## 重新生成 AI 图像（可选）

```bash
cp .env.example .env.local     # 填入 IMAGE_API_BASE / IMAGE_API_KEY（.env.local 已被 .gitignore 忽略，切勿提交）
node scripts/gen-image.mjs art/prompts/01_master.json        # 母版
node scripts/gen-image.mjs art/prompts/03_layer_bg.json      # 其余 02–10 同理（03–07 以母版为参考做编辑）
python3 scripts/align_layers.py                              # SIFT + RANSAC 把每个图层配准回母版
python3 scripts/build_assets.py                              # 生成网站纹理、图集、调色板 palette.json
python3 scripts/subset_fonts.py                              # 修改文案后重新子集化字体
node scripts/encode-assets.mjs                               # 重新编码二进制素材
```

Python 依赖：`opencv-python-headless numpy pillow fonttools brotli`。完整流程、提示词与配准结果见 [docs/pipeline.md](docs/pipeline.md)。

## 截图 QA（可选）

开发时用无头 Chromium（SwiftShader 软件渲染）逐章截图审查。Playwright 不是项目依赖，用环境变量指向已安装的位置：

```bash
npm run build && npx vite preview --port 4173 &
export PW_NODE_MODULES=/path/to/node_modules CHROMIUM_PATH=/path/to/chromium
node qa/shoot.mjs desktop                                 # 整站滚动截图 → qa/shots/（不入库）
node qa/quick.mjs mobile hero:0:hero yellows:1.8:flower   # 只截指定位置：章节:视口倍数:名称[:鼠标x,y[:等待毫秒]]
node qa/fps.mjs                                           # 帧时间采样

node qa/serve.mjs 4174 dist &                             # 像真实静态托管一样（brotli/gzip + Content-Length）提供 dist/
node qa/load.mjs mobile 4g 4                              # 加载流畅度：首帧、就绪时间、加载/门页/进入后的长任务与掉帧
node qa/smooth.mjs desktop http://127.0.0.1:4174/ 0.25    # 运行时流畅度：滚动/交互时每帧主线程拆分（脚本/样式/布局/强制布局/绘制/GC）
node qa/governor.mjs --compare                            # 分辨率调度器离线回放 14 种设备场景（不需要浏览器），并与旧规则对比
node qa/texcheck.mjs                                      # 新旧纹理解码路径逐字节对比
node qa/auto.mjs                                          # 自动浏览：在虚拟时钟上完整播放一遍，逐个核对每个节拍与交还页面
node qa/auto.mjs --w=1280 --h=720 --to=14                # 换个屏幕尺寸只看前 14 秒（耙光、点花是否落在画上）
node qa/record.mjs                                        # 录制演示成片 → qa/video/sunflowers-demo.mp4（见 docs/demo-film.md）
```

加载优化的做法与前后测量见 [docs/dev-log.md §5](docs/dev-log.md#5-加载流畅度优化)；运行时（滚动、交互）流畅度见 [§6](docs/dev-log.md#6-运行时流畅度优化)；自动浏览的实现见 [§7](docs/dev-log.md#7-自动浏览自动模式)。

## 目录

```
sunflowers-3d-website/
├─ index.html
├─ src/
│  ├─ gl/            Engine（渲染循环、滚动编排、指针）、Diorama（景深图层 + 浮雕光照）、StrokeField（笔触粒子 → 颜色之花）、
│  │                 Sunflower（程序化 3D 向日葵）、Backdrop（程序化厚涂背景）、Atmosphere（光尘/花瓣）、PaintStudio（厚涂画布）、
│  │                 governor（按实测帧时间调度渲染分辨率）
│  ├─ components/    Loader / Hud / Hero / Yellows / Bloom / Fade / Studio / Outro
│  ├─ auto/          自动浏览：storyboard（分镜）+ autopilot（逐帧驱动、合成指针事件、向日葵光标与点击波纹）
│  ├─ audio/Synth.ts Web Audio 合成器（每种黄对应一个音）
│  ├─ content.ts     全部文案与资料链接
│  └─ data/flowers.json  画中 12 朵花的位置/半径（悬停、点击用）
├─ public/assets/palette.json   从画面测得的 33 种黄 + 8 种点缀色
├─ art/prompts/      10 个图像任务（提示词 + 参数）   art/raw/*.meta.json  生成记录
├─ art/aligned/alignment.json   图层配准结果
├─ scripts/          生成、配准、素材构建、字体子集化、编码/还原
├─ qa/               Playwright + SwiftShader 截图、帧率、加载/运行时流畅度测量、分辨率调度器模拟与演示成片录制脚本
└─ docs/             research.md · design.md · pipeline.md · dev-log.md
```

## 文档

- [docs/research.md](docs/research.md) —— 艺术史与颜料科学的资料核查记录（书信、博物馆、论文）
- [docs/design.md](docs/design.md) —— 叙事、章节编排、交互、色彩与声音设计
- [docs/pipeline.md](docs/pipeline.md) —— AI 生成 → 分层 → 配准 → 纹理/调色板的完整流程
- [docs/dev-log.md](docs/dev-log.md) —— 开发与 QA 日志（含加载优化与测量）
- [docs/demo-film.md](docs/demo-film.md) —— 演示成片的分镜与录制方法（含用自动模式直接录屏）

## 版权与说明

画面是由 `gpt-image-2.5-sunburst` 生成的**再创作**，灵感来自梵高《向日葵》，并非原作复制。梵高书信引文译自 vangoghletters.org（梵高博物馆 / 惠更斯研究所）；老化效果为依据公开研究方向的**艺术化模拟**，不是精确的色彩复原。代码以 MIT 许可发布。

Harry Li × Notion AI · 2026
