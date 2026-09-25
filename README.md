# Απόλλων Apollon

Απόλλων —— 光明、诗歌与预言之神。网页版公版书城 + 阅读器。书目来自 [古登堡计划](https://www.gutenberg.org)（经 [Gutendex](https://gutendex.com) API），79,000+ 部免费公版书。

## 运行

```bash
node server.mjs
# 打开 http://localhost:3311
```

零 npm 依赖，只需 Node 18+（自带 fetch）。

## Windows 桌面版（第一阶段）

桌面版使用 Tauri 2 承载同一套 `public/` 网页，并在窗口生命周期内启动 Rust 本地服务；后续 Android 继续复用这套前端和服务边界。

```powershell
npm install
npm run dev:desktop
```

生成 Windows 安装包 exe：

```powershell
npm run dist:windows
```

最终安装包会复制到 `release/`；Cargo/Tauri 中间产物统一写入 `E:\tools\Artemis-Desktop\cargo-target`。桌面版当前与浏览器版使用相同的书架和阅读器逻辑；安卓应用、账号和跨设备同步属于后续阶段。

## 它做什么

- **裂屏冷开场**：上页载「从奥斯汀到托尔斯泰」、下页载「欢迎你来到古登堡计划」，0.55s 后上页飞速滑向右、下页滑向左，裂开露出纯拼贴 hero（作者肖像手撕纸，无文字）。
- **书城**：作者肖像手撕纸拼贴 hero（公有领域照片，feTurbulence 撕裂边缘，静止展示无视差）→ 书帘带（Verlet 单摆荡入）→ 速度感应跑马灯 → 热榜（行级联）→ 书籍网格（卡片级联 + 丝带书签：悬停时从书顶垂落一截朱砂丝带）→ 语言/分类筛选。
- **出匣式详情（Slipcase Pull-out）**：点书后不弹窗——选中的书 FLIP 放大移到中央偏左（带书脊/书口/3D 转角的实体书），右侧从书匣抽出一份撕边羊皮纸导读折页。CTA 是火漆印章（外圈 conic 进度环随下载推进）。入架时折页收回、书合上飞入书架按钮，然后自动开读；Esc 关闭则原路飞回卡片。
- **书架**：IndexedDB 本地存储，离线可读；悬停浮现纸质腰封（继续阅读 / 读到 X% / 章节名）。
- **一键入架**：下载原书 → 浏览器内转换 → 收入书架 → 进入阅读器，全程本地完成：
  - 优先取 HTML 版（保留章节结构与斜体），回退 TXT 版（含编码探测 UTF-8 / Windows-1252）；
  - HTML 用 Range 跨容器切片分章，能处理嵌着插图题词的标题；
  - TXT 识别 `CHAPTER N` / `第X回` 等中英文章节锚点，重建段落；
  - 装饰性首字母图（dropcap）的 alt 文字自动还原为正文。
- **阅读器**：CSS multi-column 分页，拖拽跟手翻页（松手按位移+速度落页，下阻尼弹簧回弹）、滚轮 momentum guard、键盘 ←/→、目录抽屉、字号/行距/纸张（纸·旧·夜）设置、进度自动保存。

## 架构

```
server.mjs          零依赖 Node 服务器：静态托管 + 白名单代理
                    /api/gutendex/*  → gutendex.com（10min 缓存）
                    /api/content?url → www.gutenberg.org（内存 LRU 缓存，解决浏览器 CORS）
public/
  css/              tokens（设计令牌+动效令牌）/ base / reader
  js/
    motion.js       动效引擎：下阻尼弹簧、指数跟随、Verlet 书帘、飞行封面、marquee
    converter.js    内置转换器：HTML/TXT → 结构化章节
    shelf.js        IndexedDB（books + progress）
    api.js          Gutendex 客户端 + 下载源选择
    covers.js       生成式书封（无封面的书按 id 生成版式封）
    views/          browse（书城）/ detail（详情）/ shelfview（书架）/ reader（阅读器）
```

## 动效设计约定（来自 motion-web 体系）

- 动效即材质：冷开场撕纸揭幕、手撕纸拼贴视差（feTurbulence + feDisplacementMap 撕裂边缘）、书帘 Verlet 单摆（荡入入场）、书卡 3D 倾斜 + 光照跟随、速度感应跑马灯（skew 速度耦合）、入架飞行抛物线、翻页弹簧落页。
- 只动 transform / opacity（跑马灯 skew 亦在 transform 内）；重滤镜（撕裂）只作用于静态图版，一次性栅格化。
- `prefers-reduced-motion` 下全部动效降级为即时切换，内容完整可读。

## 素材来源与致谢

- 书目与正文：[Project Gutenberg](https://www.gutenberg.org) / [Gutendex API](https://gutendex.com)
- 作者肖像（Wikimedia Commons，公有领域）：Jane Austen、Mark Twain、Edgar Allan Poe、Charles Dickens、鲁迅、Leo Tolstoy。

## 已知边界

- EPUB/MOBI 不在内置转换范围（HTML/TXT 覆盖古登堡绝大多数书目）。
- 服务器代理仅放行 `gutenberg.org` / `www.gutenberg.org` 域名。
