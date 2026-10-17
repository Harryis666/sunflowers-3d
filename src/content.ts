// All user-facing copy lives here (zh primary, en secondary).
// Strings rendered in the brush font must be listed between the calligraphy markers:
// scripts/subset_fonts.py reads that block to subset Ma Shan Zheng.

/* calligraphy:start */
export const CALLIGRAPHY = {
  title: '向日葵',
  seal: '梵高',
  ch1: '三十三种黄',
  ch2: '粗粝有刺的生命',
  ch3: '画会像花一样褪色',
  ch4: '留下你的一笔',
  outro: '一首蓝与黄的交响曲',
  stages: '蓓蕾盛放凋萎结籽',
};
/* calligraphy:end */

export const SOURCES = {
  ng: 'https://www.nationalgallery.org.uk/paintings/vincent-van-gogh-sunflowers',
  ngAudio: 'https://www.nationalgallery.org.uk/audio/audio-descriptions/vincent-van-gogh-s-sunflowers',
  let666: 'https://vangoghletters.org/vg/letters/let666/letter.html',
  let743: 'https://vangoghletters.org/vg/letters/let743/letter.html',
  let765: 'https://vangoghletters.org/vg/letters/let765/letter.html',
  let806: 'https://vangoghletters.org/vg/letters/let806/letter.html',
  npj: 'https://www.nature.com/articles/s40494-021-00608-y',
  monico: 'https://pubmed.ncbi.nlm.nih.gov/26482035',
  vanmeert: 'https://cen.acs.org/articles/96/i11/Method-identifies-subtypes-yellow-pigment.html',
  revigo: 'https://www.vangoghmuseum.nl/',
};

export const HERO = {
  kicker: 'Vincent van Gogh · Arles · 1888',
  en: 'Sunflowers',
  enSub: 'A symphony in yellow',
  lead: '黄色调的极限交响乐。三十余种不同纯度与明度的黄——柠檬黄、铬黄、赭黄、土黄——堆砌成粗粝有刺的花盘，每一朵都像一颗跳跃的小太阳。',
  hints: [
    { k: '移动', v: '光标就是阿尔勒的太阳' },
    { k: '按住', v: '用侧光审视颜料的厚度' },
    { k: '点击', v: '让一朵花跳起来' },
  ],
  hintsTouch: [
    { k: '触摸', v: '手指就是阿尔勒的太阳' },
    { k: '长按', v: '用侧光审视颜料的厚度' },
    { k: '轻点', v: '让一朵花跳起来' },
  ],
  scroll: '向下滚动，走进画里',
};

export const CH1 = {
  no: '01',
  en: 'Thirty-three yellows',
  body: '梵高打破了学院派“调和色”的教条，几乎只用黄色去画黄色。我们把这幅画拆成数万笔真实的颜料笔触，再按明度重新排列——它们自己长成了一朵向日葵：最暗的黄在花心，最亮的黄在花瓣。',
  quote: '“用三种铬黄、黄赭和维罗纳绿画成，别无其他。”',
  quoteBy: '梵高致阿诺德·科宁，1889 年 1 月（信 740）',
  hint: '悬停色带聆听每一种黄 · 拖拽旋转这朵颜色之花',
  hintTouch: '轻点色带聆听每一种黄 · 左右拖动旋转这朵颜色之花',
};

export const CH2 = {
  no: '02',
  en: 'Bristling with life',
  body: '厚重的颜料堆出花盘粗粝有刺的质感。每一粒种子都沿黄金角 137.5° 生长，34 条与 55 条螺线彼此交织——这是向日葵自己的数学。',
  ng: '画中每一朵花，都处在生命周期的不同阶段。',
  ngBy: '英国国家美术馆',
  stages: [
    { zh: '蓓蕾', en: 'Bud', text: '从一粒种子开始。绿色的苞片还紧紧裹着尚未出世的黄色。' },
    { zh: '盛放', en: 'Bloom', text: '34 片外瓣、21 片内瓣，全都是斐波那契数。花盘像一颗燃烧的小太阳。' },
    { zh: '凋萎', en: 'Wilt', text: '“花谢得很快，必须一气呵成。”花瓣卷曲、下垂，铬黄退成赭黄。' },
    { zh: '结籽', en: 'Seed', text: '花瓣落尽，只剩沉甸甸的种子——生命把自己重新写成了螺线。' },
  ],
  hint: '拖拽旋转 · 滚动走完它的一生',
  spiral: '显示 34 / 55 螺线',
};

export const CH3 = {
  no: '03',
  en: 'Paintings fade like flowers',
  body: '梵高用的部分铬黄对光敏感。同步辐射研究证实，阿姆斯特丹版《向日葵》中的铬黄已发生化学变化，明亮的黄正缓慢变暗；画中的红色色淀也早已褪去。拖动时间，看光线如何在一百多年里改写黄色。',
  quote: '“画会像花一样褪色。”',
  quoteBy: '梵高致提奥，1889 年 4 月 30 日（信 765）',
  note: '* 艺术化视觉模拟，依据 Monico 等（2015）与 Vanmeert 等（2018）的研究方向，并非精确的色彩复原。',
  marks: [
    { y: 1888, t: '刚刚完成' },
    { y: 2026, t: '今天' },
    { y: 2150, t: '若不加保护' },
  ],
};

export const CH4 = {
  no: '04',
  en: 'Leave your stroke',
  body: '选一种黄，在画布上堆起颜料，侧光会照出每一道刷痕。或者点“种一朵”，看颜料自己长成向日葵。',
  grow: '种一朵向日葵',
  clear: '清空画布',
  save: '保存作品',
  size: '笔触',
  tip: '在画布上拖动作画',
};

export const OUTRO = {
  quote: '“整件作品将是一首蓝与黄的交响曲。我每天清晨日出就开始画，因为花谢得很快，必须一气呵成。”',
  quoteBy: '梵高致提奥，1888 年 8 月 21 或 22 日（信 666）',
  quote2: '“……就像向日葵之于黄色。”',
  quote2By: '梵高致提奥，1889 年 9 月 28 日（信 806）',
  credits: [
    '画面：由 gpt-image-2.5-sunburst 生成的再创作，灵感来自梵高《向日葵》，并非原作复制；再经图层拆分、配准与修补。',
    '技术：Three.js · WebGL2 · GLSL · React · TypeScript · Vite · Tailwind CSS · Web Audio',
    '资料：英国国家美术馆、梵高博物馆、vangoghletters.org、Monico 等 2015（Angew. Chem.）、Vanmeert 等 2018、npj Heritage Science 2021。',
  ],
  again: '回到开头',
};

export const LOADER = {
  mixing: '正在调和三十三种黄',
  enterSound: '带声音进入',
  enterMute: '静音进入',
  noWebgl: '你的浏览器不支持 WebGL2，以下为静态版本。',
};

/** auto mode (src/auto): a hands-free tour of every chapter */
export const AUTO = {
  start: '自动浏览',
  gate: '自动浏览 · 约 1 分钟',
  running: '自动浏览中',
  exit: '点此或按 Esc 退出',
};

export const NAV = ['向日葵', '三十三种黄', '生命', '褪色', '你的一笔', '尾声'];
