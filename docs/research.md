# 资料核查记录 · Research notes

> 原则：网站上出现的每一条“事实”与引文都能追溯到下列来源；无法核实的说法一律不用。
> 网站文案集中在 `src/content.ts`，链接在 `SOURCES`。

## 1. 作品本身

| 事实 | 网站用法 | 来源 |
|---|---|---|
| 梵高 1888 年 8 月在阿尔勒画出伦敦版《向日葵》（英国国家美术馆藏），1889 年 1 月又画了复制/变体；系列共 7 个版本 | Hero 副标题 “Arles · 1888” | 英国国家美术馆作品页 <https://www.nationalgallery.org.uk/paintings/vincent-van-gogh-sunflowers> |
| 伦敦版花瓶中有 15 朵向日葵 | 设计参照（画面构图） | 同上 |
| “画中每一朵花，都处在生命周期的不同阶段”（each flower at a different stage of life） | 第 02 章引语；蓓蕾 → 盛放 → 凋萎 → 结籽 四阶段 | 同上（含音频导览页） |

## 2. 梵高书信（vangoghletters.org，梵高博物馆 & 惠更斯研究所）

| 信件 | 日期 | 摘要 / 引文 | 网站用法 |
|---|---|---|---|
| **666** 致提奥 | 1888-08-21/22 | “整件作品将是一首蓝与黄的交响曲（symphony in blue and yellow）……我每天清晨日出就开始画，因为花谢得很快，必须一气呵成。” | 尾声主引文；凋萎阶段文案 |
| **740** 致阿诺德·科宁（Arnold Koning） | 1889-01 | 向日葵“用三种铬黄、黄赭和维罗纳绿画成，别无其他”（painted with the three chrome yellows, yellow ochre and Veronese green and nothing else） | 第 01 章引语；工作室调色盘 |
| **743** 致提奥 | 1889-01 | 把向日葵画作比作“落地灯或烛台”（standard lamps / candelabra） | 尾声“花朵如灯”的烛光夜景（未直接引用原句） |
| **765** 致提奥 | 1889-04-30 | “画会像花一样褪色”（paintings fade like flowers） | 第 03 章标题与引语 |
| **806** 致提奥 | 1889-09-28 | “……就像向日葵之于黄色”（the way the sunflowers are for yellows） | 尾声第二引文 |

链接：
- <https://vangoghletters.org/vg/letters/let666/letter.html>
- <https://vangoghletters.org/vg/letters/let743/letter.html>
- <https://vangoghletters.org/vg/letters/let765/letter.html>
- <https://vangoghletters.org/vg/letters/let806/letter.html>
- 信 740 的英文引文经由下文 npj Heritage Science 2021 论文转引核对。

> ✗ 未采用：网上流传的 “The sunflower is mine, in a way” 之类说法，本次未能在原始书信中核实，网站不使用。

## 3. 颜料科学：为什么“画会褪色”

| 结论 | 来源 |
|---|---|
| 梵高的铬黄（PbCrO₄ 及含硫的 PbCr₁₋ₓSₓO₄ 固溶体）分耐光与光敏两类；富硫的浅色铬黄对光敏感，会还原变暗（Cr(VI) → Cr(III)）。在梵高博物馆（阿姆斯特丹）版《向日葵》上找到了化学变化的确切证据。铬黄 1/2/3 型大致对应柠檬黄/中黄/橙黄 | Monico L. 等, *Angew. Chem. Int. Ed.* 2015, DOI 10.1002/anie.201505840（PubMed 26482035）；ESRF 2015 年度亮点 |
| 宏观 X 射线粉末衍射成像（MA-XRPD）显示：耐光铬黄主要在橙黄区域，光敏铬黄在明亮的浅黄区域 | Vanmeert F. 等, *Angew. Chem.* 2018, DOI 10.1002/anie.201713293；C&EN 报道 <https://cen.acs.org/articles/96/i11/Method-identifies-subtypes-yellow-pigment.html> |
| 梵高画中的红色色淀（red lake）已明显褪色 | 梵高博物馆研究（REVIGO 项目等）<https://www.vangoghmuseum.nl/> |
| 向日葵系列的色彩几何分析（含信 740 引文） | “The geometry of colors in van Gogh’s Sunflowers”, *npj Heritage Science* 2021 <https://www.nature.com/articles/s40494-021-00608-y> |

**网站中的老化效果（`src/gl/glsl.ts → ageColor`）是艺术化的视觉模拟**，只遵循上述研究的方向：
1. 只有“明亮、偏冷的浅黄”（光敏区）逐渐偏向橄榄褐；
2. 橙色中的红色成分（色淀）逐渐褪去；
3. 整体覆盖一层泛黄的清漆。

页面上明确标注：“艺术化视觉模拟……并非精确的色彩复原。”

## 4. 植物学与数学

| 事实 | 网站用法 |
|---|---|
| 向日葵花盘的种子按黄金角 ≈ 137.5°（2π(1−1/φ)）排列，Vogel 模型 r = c√n、θ = n·137.5° | 01 章颜色之花的花盘、02 章 3D 花盘、工作室“种一朵” |
| 相邻螺线（parastichies）数为相邻的斐波那契数，如 34 与 55 | 02 章“显示 34 / 55 螺线”（987 粒种子，精确 Vogel 模型生成） |
| 舌状花瓣数常为斐波那契数（13、21、34、55） | 3D 向日葵 34 外瓣 + 21 内瓣 + 21 苞片；颜色之花 21 + 13 |

## 5. 画面测量（本项目自己的数据）

由 `scripts/build_assets.py` 对 AI 母版图测得（`public/assets/palette.json`）：
- 方法：OKLab 空间 k-means（OpenCV），黄色掩膜 = 色相 52°–118°、C > 0.045、L > 0.42；
- 结果：**33 种黄**，覆盖画面 **90.2%** 的像素，归入 **11 个色族**（那不勒斯黄、柠檬黄、浅铬黄、铬黄、深铬黄、土黄、铬橙、赭黄、生赭、橄榄黄、熟赭）；另有 8 种点缀色（赭红、熟赭、维罗纳绿、普鲁士蓝、橄榄绿、生褐 ×2、焦褐）。
- 注意：这是对**本项目 AI 再创作画面**的测量，不是对梵高原作的测量。“三十余种黄”是对作品气质的描述，网站上的数字来自我们自己的测量。
