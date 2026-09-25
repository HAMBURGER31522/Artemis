# Artemis 本地书籍导入、Android 应用与跨设备同步

**文档类型**：Design Spec + Implementation Plan

**状态**：设计已由用户批准，待执行

**日期**：2026-09-25

**执行对象**：接手本任务的 coding agent

**TDD Route**：`Mode: auto`；`Decision: strict`，依据是本地持久化迁移、同步合并契约、OAuth 权限、Android/Windows producer-consumer 边界和离线恢复风险。先对 merge/fingerprint/migration/crypto envelope 运行 `node --test` 的 RED/GREEN 测试，再进行浏览器、Windows 和 Android 人工验收；项目没有现成 UI 测试框架，不把人工冒烟伪装成单元测试。

**工期估算**：阅读器与本地导入约 5–8 小时；Android 工程和设备验证约 3–6 小时；同步模型与离线 outbox 约 3–5 小时；Google OAuth/二维码/Drive transport 约 4–8 小时；双端回归和打包约 3–6 小时。合计约 18–33 小时。Android SDK、真实设备、Google OAuth client ID 或网络条件缺失时，计划只能完成到对应可验证边界，不能用模拟成功替代远程同步验收。

**Git 推送授权**：用户已明确授权本任务在执行前和每个已验证阶段性切片完成后推送。执行 agent 使用 `codex/reader-android-sync` 分支；不得直接向 `main` 推送未完成实现。执行前先记录 `HEAD`/diff，提交本计划和 checkpoint 作为基线并推送；每个 slice 通过其验证后做一个 scoped commit，再推送该分支。禁止 force-push、宽泛 `git add .`、提交 `E:\epub`、token、client secret、个人路径、node_modules、Android/Gradle/Cargo/Tauri 中间产物或未验证的“成功”代码。最终完整验收后再由用户决定是否合并/发布。

## 0. 计划由来与参考资料

本计划由三组已批准需求合并而来：

1. 用户要求先把本地 EPUB/PDF 阅读质量做到可验收，并用 `E:\epub` 的真实文件走完整流程。
2. 用户要求后续电脑与 Android 手机能够同步书架、阅读进度和书签；首版不自建 Artemis 服务器，使用 Google Drive API 作为托管同步存储，二维码只负责一次性配对和密钥交换。
3. 用户指定参考 Koodo Reader 的成熟导入和阅读行为。

Koodo 源码：<https://github.com/koodo-reader/koodo-reader.git>

本机参考副本：`E:\tools\Artemis-Desktop\references\koodo-reader`

执行 agent 必须在 Slice 0 阅读 Koodo 相关实现：

- `src/components/importLocal/component.tsx`：文件选择、拖拽导入、重复文件和导入阶段。
- `src/utils/file/bookUtil.ts`：本地书籍落盘、书籍内容和同步上传边界。
- `src/pages/reader/component.tsx`：阅读器启动、PDF/HTML 分流和生命周期。
- `src/containers/panels/progressPanel/component.tsx`：章节、页码、百分比和恢复位置。
- `src/utils/storage/syncService.ts`：同步服务抽象和 token/云端适配边界。
- `src/models/Book.ts`：书籍稳定 key、格式和本地元数据形状。

Koodo 使用 AGPL-3.0。只提取行为、边界和测试启发，禁止复制 Koodo 源码、压缩库或其具体实现；Artemis 继续保持自己的原生 ES Modules 架构。

## 1. 目标与完成定义

把 Artemis 当前只能阅读远程 Gutenberg HTML/TXT 的阅读器，扩展为可导入并稳定阅读本地 EPUB、PDF 的桌面/网页/Android 阅读器；同时建立本地优先、Google Drive 中转的双向同步能力。阅读体验参考 Koodo Reader 的格式覆盖、目录、进度和排版控制，但不复制 Koodo 的 AGPL 源码。

完成定义必须由真实文件证明：

1. 从书架选择“导入书籍”，导入 `E:\epub` 中至少一份 EPUB 和一份 PDF。
2. 导入完成后出现书架卡片，标题、作者/文件名和格式可识别。
3. EPUB 打开后正文可读，中文和英文段落没有重叠、裁切、异常空白或整页空白。
4. PDF 打开后保留页面原始排版，文字、图片和页边距清楚可读。
5. EPUB 可以通过上一页/下一页、点击热区、键盘和目录移动；PDF 可以翻页、显示当前页/总页数并缩放或适合窗口。
6. EPUB 与 PDF 的阅读进度分别保存；关闭阅读器后重新打开，恢复到上次章节/页或页码。
7. 应用重启后仍可打开已导入书籍，不依赖原始 `E:\epub` 文件路径或网络。
8. 重复导入同一个文件不会产生重复书卡；损坏或不支持的文件给出可理解错误，不写入半成品。
9. `npm run check`、`npm run check:rust`、`npm run smoke:server` 和 Windows 打包通过；发布版启动不显示终端窗口。
10. Aegis checkpoint 记录每个切片进度、验证证据、未覆盖范围和下一步。
11. Tauri Android 应用可以在真实 Android 设备或明确记录的模拟器上启动，复用同一套 `public/` 阅读器和导入流程。
12. Windows 与 Android 首次 OAuth 授权并完成二维码配对后，双方可以分别离线产生变更；恢复网络后通过 Google Drive 双向合并书架、阅读进度和书签，不要求两端同时在线。
13. Google Drive 只保存加密的变更记录和按需上传的正文 Blob；默认不把 Gutenberg 正文和本地书籍自动上传。
14. 两台设备的同步按钮不需要打开 Google Drive 应用；Artemis 通过 Google Drive API 自动上传、拉取、合并并显示结果。

## 2. 明确范围

### 本次必须实现

- 本地 `.epub` 导入、解析、目录、正文、图片资源和进度。
- 本地 `.pdf` 导入、PDF.js 页面渲染、翻页、页码、缩放/适合窗口和进度。
- 书架导入按钮、文件选择器、拖拽导入（可共用同一个导入函数）、导入阶段提示和错误恢复。
- IndexedDB schema 迁移，保留已有远程书和旧阅读进度。
- Tauri/浏览器都能运行，PDF.js worker 和解析依赖打进 `public/`，不使用 CDN。
- 窄窗口、键盘焦点、关闭路径、`prefers-reduced-motion` 和空状态验证。
- Tauri Android 工程使用同一套 `public/` 资源和清晰的平台适配边界，安装/构建中间文件写入 `E:\tools\Artemis-Desktop`。
- 双向同步核心、离线 outbox、Google Drive transport、二维码配对和设备密钥生命周期。

### 本次不做

- 阅读器笔记、划线、词典、TTS、翻译、DRM 破解。
- MOBI/AZW/CBZ/FB2 等其它格式。
- 重新设计书城首页或替换现有 Tauri 架构。
- 将 PDF 转换成纯文本或把 EPUB 简化成无法恢复图片的纯文本。
- Artemis 自建同步服务器、账号后台和服务端数据库；本计划使用 Google Drive API，不新增自有后端。
- PDF 文本搜索、连续滚动和跨设备正文自动上传；正文只在用户请求时传输。

## 3. 基线与 owner

执行 agent 必须先读取：

- `AGENTS.md`
- `README.md`
- `docs/CODE-STANDARDS.md`
- `public/js/converter.js`
- `public/js/shelf.js`
- `public/js/views/reader.js`
- `public/js/views/shelfview.js`
- `public/js/app.js`
- `public/css/reader.css`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `docs/DESKTOP-TOOLS.md`
- `docs/aegis/work/2026-09-25-desktop-exe/20-checkpoint.md`
- Koodo 参考文件（见第 0 节）

当前 canonical owner：

| 责任 | owner |
|---|---|
| 远程 Gutenberg HTML/TXT 清洗与转换 | `public/js/converter.js` |
| 本地 EPUB/PDF 解包和格式解析 | 新增 `public/js/local-import/`，不得塞进阅读器 |
| IndexedDB schema、书籍记录、进度 | `public/js/shelf.js` |
| 导入按钮、进度提示、书架卡片 | `public/js/views/shelfview.js` 与必要的 `public/js/import.js` wiring |
| 阅读器状态协调、目录和进度 HUD | `public/js/views/reader.js` |
| EPUB 排版页 | `public/css/reader.css` |
| PDF 页面舞台 | `public/css/reader.css` 中独立的 PDF 区块或独立 `pdf-reader.css` |
| 浏览器/Tauri 依赖静态资源 | `public/vendor/` 与 `scripts/vendor-reader-deps.mjs` |
| 跨格式稳定书籍 key、同步记录和离线变更队列 | 新增 `public/js/sync/` 与 `public/js/shelf.js` 的明确接口 |
| Google Drive OAuth、文件上传/拉取和 changes cursor | 新增 `public/js/sync/google-drive.js`，不把 token 写入 IndexedDB/localStorage |
| 二维码配对和设备密钥 | 新增 `public/js/sync/pairing.js` 与 Tauri Android/Windows 平台适配 |
| Android Tauri 工程和平台权限 | `src-tauri/`、`src-tauri/gen/android/`（生成物按工具目录规则处理） |
| Aegis 进度、证据、漂移 | `docs/aegis/work/2026-09-25-reader-import/` |

如果现有文件边界不足，可以新建 owner 文件；不要把 EPUB ZIP 解析、PDF.js 调用或 IndexedDB 迁移写进 `reader.js`。

## 4. 设计规格

### 4.1 统一阅读文档协议

阅读器通过明确的文档字段区分格式，不根据 HTML 字符串猜格式。建议形状：

```js
{
  id: 'local:<fingerprint>',
  format: 'epub' | 'pdf' | 'html' | 'txt',
  source: 'local' | 'gutenberg',
  title: String,
  authors: String[],
  language: String,
  cover: String | null,
  chapters: Array<{ title: String, html: String }>, // epub/html/txt
  resources: Array<{ path: String, mime: String, data: Blob }>, // epub
  pdfBlob: Blob | null, // pdf
  chars: Number,
  minutes: Number,
  addedAt: Number,
  sourceFingerprint: String
}
```

具体字段可以按当前代码风格调整，但必须满足：

- 远程数值 ID 继续可用；本地 ID 必须带前缀，不能与远程书冲突。
- PDF 不要求伪造 `chapters`；可以用 `format` 分支和 `pageCount`。
- Blob/ArrayBuffer 必须由 IndexedDB 结构化克隆保存，不能保存只在本次页面有效的 `blob:` URL。
- EPUB 章节 HTML 中的资源引用必须在打开时通过资源表恢复为 Object URL；关闭阅读器时释放 Object URL。
- `sourceFingerprint` 用文件名、大小、最后修改时间和内容摘要形成；同一个文件再次导入走更新/复用路径。

### 4.2 EPUB 解析

使用 `fflate` 或已批准的 ZIP 库处理 EPUB 容器。解析步骤必须保持可测试的小函数：

1. 读取 `META-INF/container.xml`，找到 rootfile。
2. 读取 OPF，建立 manifest、spine、metadata 和 base path。
3. 按 spine 排列 XHTML 文档；解析 EPUB 3 nav，回退 NCX，最后回退 spine 标题。
4. 对每个文档用 DOMParser 读取 body，移除 `script/style/link/iframe/object/form` 等危险节点和事件属性，只保留阅读需要的语义标签。
5. 解析图片、字体和其它允许资源的相对路径，存入 resources；不允许外链资源和任意协议。
6. 生成 `chapters[].html` 和目录。章节没有正文时跳过，整本没有正文时返回明确错误。
7. 从 metadata 读取书名、作者、语言、封面；缺失时使用文件名，不让导入失败。

清洗必须复用或抽取现有 `converter.js` 的白名单逻辑，避免维护第二套不一致的 HTML 安全边界。若抽取，保留远程 Gutenberg 行为并为两条调用路径补验证。

### 4.3 PDF 阅读

使用 `pdfjs-dist` 的浏览器构建版本。PDF.js worker 文件必须随 `public/vendor/` 打包，不能在运行时访问 CDN。

PDF reader 最小可用行为：

- 打开时异步加载文档并显示“正在加载第 X 页/共 Y 页”阶段。
- 单页高 DPI canvas 渲染；根据容器宽度计算初始 fit-width scale，支持 `−`、`+`、适合窗口。
- 上一页/下一页、左右热区、键盘 Arrow/PageUp/PageDown；页码输入或至少显示页码。
- 切换页或关闭时保存 `{ positionKind: 'pdf-page', page, scale, pct }`。
- 页面渲染失败显示错误和重试入口，不留下旧页面冒充新页面。
- 当前页 canvas 在切换前清理，避免大 PDF 打开后无限增加 canvas；关闭时销毁 PDF.js document 和相关 Object URL。

PDF 首版可使用 canvas 视觉阅读；不要为了“统一章节”把页面转成纯文本。文本选择、搜索和连续滚动属于后续增量，不得阻塞首版交付，但需在计划的非目标中明确。

### 4.4 EPUB 阅读与分页

- 复用现有章节翻页协议和进度 HUD，但检查列高、列宽、中文行宽、图片最大尺寸、章节边界和窗口 resize。
- `img` 加载或资源 Object URL 创建完成后重新分页，并按比例保持当前位置。
- 目录跳转要更新 `S.chapter`、`S.page` 并立即更新 HUD；不能只换 DOM 不换进度。
- 字号、行距、纸张/夜间主题只作用于 EPUB；PDF 使用缩放控制。
- 阅读器关闭时立即保存一次，不只依赖延迟 timer。

### 4.5 IndexedDB 迁移

- `DB_VER` 从 1 递增到 2（或当前实际版本 + 1），在 `onupgradeneeded` 中显式兼容旧 `books`/`progress`。
- 旧远程书记录保持可读；缺失的 `format/source` 使用 `kind` 或默认 `html` 推断一次。
- 新增字段不得改变旧字段含义；进度记录兼容旧 `{ chapter, page, pages, pct }`。
- 删除书籍必须同时删除本地 Blob/resources 和 progress。
- 导入解析失败时不能留下只有 metadata 没有正文的书卡；必要时用单事务写入。
- 大文件导入时不要在多个模块复制整份 ArrayBuffer；允许使用 Blob 并记录失败原因/容量限制。

### 4.6 本地优先同步协议

同步不是复制 IndexedDB，也不是把电脑当成唯一主设备。Windows 和 Android 都是对等客户端，各自可以离线产生变更，联网后再与 Google Drive 合并。

每台设备第一次启动生成稳定 `deviceId`。本地新增或修改书籍、进度、书签时，同时更新本地状态和 `sync_outbox`：

```js
{
  operationId: String,
  deviceId: String,
  sequence: Number,
  type: 'book-added' | 'progress-updated' | 'bookmark-updated' | 'book-removed',
  bookKey: String,
  payload: Object,
  logicalRevision: Number,
  createdAt: Number
}
```

核心约束：

- `bookKey` 对本地 EPUB/PDF 使用内容 SHA-256；Gutenberg 书使用稳定 Gutenberg ID 加源版本哈希。
- outbox 必须幂等；同一 `operationId` 重复拉取不能重复应用。
- 书架新增做集合合并；阅读进度按 `logicalRevision` 和 `deviceId` 稳定决胜；书签按稳定 ID 合并。
- 删除使用 tombstone，不在首版直接物理删除远端记录。
- `sync_outbox`、`sync_cursors`、`sync_devices` 是新增 IndexedDB store，schema 递增并提供迁移。
- 进度记录除百分比外，保留格式相关位置：EPUB 的章节/页和 PDF 的页码/scale；不能只同步“第几页”而忽略窗口排版差异。

同步按钮和应用恢复网络时执行同一个 `syncNow()`：刷新 OAuth token、上传本地 outbox、读取远端变更、验证解密、幂等合并、写入 cursor、标记已上传。阅读过程只本地写入，使用 debounce 或退出阅读器时触发上传，不能每翻一页都请求 Drive。

### 4.7 Google Drive 无自建服务器同步

Google Drive 是托管存储，不需要 Artemis 服务器；两台设备都直接调用 Drive API。默认使用同一个 Google 账号和 `appDataFolder` 最小权限；如果产品以后需要用户手动备份，再增加用户可见同步目录。

参考官方资料：

- <https://developers.google.com/drive/api/guides/appdata>
- <https://developers.google.com/identity/protocols/oauth2/native-app>
- <https://developers.google.com/identity/protocols/oauth2>

OAuth 要求：

- 使用 Authorization Code + PKCE 或经验证的原生应用流程；Windows 和 Android 都不能内置 client secret。
- `client_id` 通过构建配置注入，不能伪造、硬编码私密凭证或把用户 token 写入 `localStorage`/IndexedDB。
- access/refresh token 使用 Windows 凭据存储、Android Keystore 或 Tauri secure-store 适配；若所需插件不可用，先暂停并报告，不降级为明文存储。
- `drive.appdata` 只读写 Artemis 的隐藏应用目录；Google Drive API 访问失败时，所有本地变更保留在 outbox，界面显示待同步状态。

Drive 文件按设备追加，避免两个客户端并发覆盖同一个 JSON：

```text
appDataFolder/
  changes_<deviceId>_<sequence>.json.enc
  manifest_<bookKey>.json.enc
  content_<sha256>.blob.enc       # 仅用户请求正文传输时生成
```

变更文件和正文 Blob 使用应用层 AES-GCM 加密；二维码只携带一次性配对信息、公钥、同步空间标识和过期时间，绝不能携带 Google token。配对完成后两台设备分别访问 Drive，不需要再次扫码。

Gutenberg 书只同步稳定 ID、源版本和进度，另一台设备可以直接重新下载。手机本地导入的 EPUB/PDF 默认只同步元数据和进度；用户点击“获取正文”时才上传/下载加密 Blob，上传使用可恢复分块，完成后校验 SHA-256。

### 4.8 Android 应用边界

- 使用 Tauri 2 Android 目标复用 `public/`，不复制一套 React/原生阅读器。
- Android 入口负责生命周期、文件选择、二维码扫描、OAuth 回调和安全存储；解析、书架、阅读器和同步合并仍由共享 JS owner 负责。
- 需要验证 Android WebView 的 IndexedDB Blob 存储、EPUB 图片 Object URL、PDF.js worker、文件选择权限和应用恢复后 token 读取。
- Android 首版必须支持：本地 EPUB/PDF 导入、离线阅读、阅读进度写入、同步按钮、Google OAuth、二维码配对和同步状态展示。
- Android 先做真实设备或明确记录的模拟器验证；没有 Android SDK/NDK 或 OAuth client ID 时只能完成结构性代码和本地模式，不能声称远程同步完成。

## 5. 依赖与资源处理

推荐依赖：

- `fflate`：EPUB ZIP 解包，轻量、浏览器可用。
- `pdfjs-dist`：PDF 解析和 canvas 渲染。
- Google Drive REST API：通过原生 OAuth/PKCE 和 `drive.appdata`，不引入自建服务器。
- 二维码生成/扫描能力：优先使用 Tauri 2 兼容且维护明确的插件；若需要 JS 依赖，固定版本并按 vendor 规则处理。

执行步骤：

1. 在 `package.json`/lockfile 中固定版本。
2. 新增 `scripts/vendor-reader-deps.mjs`，把确定版本的浏览器模块和 worker 复制到 `public/vendor/`。
3. `npm run vendor:reader` 必须幂等；中间缓存、npm cache、Tauri/Cargo target 继续使用 `E:\tools\Artemis-Desktop`。
4. `public/vendor/` 只放运行时必需文件，源包、压缩包、临时解包目录不得提交。
5. 在普通浏览器 `node server.mjs` 和 Tauri `rust-embed` 两条路径都验证 worker URL 可访问。

Android 工具链和生成物必须放在 `E:\tools\Artemis-Desktop` 下相应目录；执行 agent 需要补充 `docs/DESKTOP-TOOLS.md` 的 Android SDK/NDK/Gradle 缓存说明，不能把 `src-tauri/gen/android` 的构建缓存、APK/AAB 和 Gradle 输出提交进 Git。

如果 Google OAuth client ID、Android SDK、二维码扫描插件或安全存储插件缺失，先完成接口和离线模式的可验证部分，再在 checkpoint 标记 `blocked/needs-verification`；禁止生成假 client ID、把 token 写入明文或用一个“同步成功”提示掩盖未完成的远程链路。

如果依赖包的入口或 worker 路径因版本改变，先修改 vendor 脚本和验证，不在页面里写多个猜测 fallback。

## 6. 分步执行任务

### Slice 0：接手与基线

**目的**：确认工作区没有未授权改动，恢复本任务状态。

- 读取本计划和 `docs/aegis/work/2026-09-25-reader-import/20-checkpoint.md`（若已存在）。
- 运行 `git status --short`、`git rev-parse HEAD`、`git worktree list --porcelain`。
- 运行现有 `npm run check`，记录基线结果。
- 不执行 `git reset/clean/stash`，不覆盖预先存在的改动。

**通过证据**：基线命令和当前 HEAD 已写入 checkpoint。

### Slice 1：依赖 vendor 和资源边界

**目标文件**：`package.json`、`package-lock.json`、`scripts/vendor-reader-deps.mjs`、`public/vendor/`、必要的 `.gitignore`。

- 安装并固定 `fflate`、`pdfjs-dist`。
- 写 vendor 脚本和 npm script；验证 vendor 文件可被静态服务器返回。
- 不引入 React、Electron、第二套构建系统或 CDN 运行时依赖。

**验收**：`npm run vendor:reader` 重复运行结果稳定；`npm run check` 通过；浏览器请求 PDF.js worker 返回 200。

### Slice 2：本地导入与 EPUB 解析

**目标文件**：`public/js/local-import/epub.js`、`public/js/local-import/sanitize.js`（如确需抽取）、`public/js/local-import/fingerprint.js`、必要的 `public/js/import.js`。

- 实现 `parseEpub(file, onStep)`，输出统一本地书籍记录所需数据。
- 覆盖 OPF/spine、EPUB3 nav/NCX 回退、metadata、封面、中文章节和图片资源。
- 为错误、损坏 ZIP、缺 rootfile、无正文和不允许资源提供可辨识异常。

**验收**：对 `E:\epub\葛兰西的二律反背.epub` 和另一份中文 EPUB 得到非空章节、非空标题、可显示正文；解析阶段可观察。

### Slice 3：IndexedDB v2 与书架导入入口

**目标文件**：`public/js/shelf.js`、`public/js/views/shelfview.js`、`public/index.html`、`public/css/base.css`、`public/js/app.js`（只做 wiring）。

- 完成 DB 迁移和本地字段保存。
- 书架显示“导入书籍”按钮、支持多选和拖拽，统一调用 `importLocalFiles(files)`。
- 导入过程中显示当前文件和阶段；失败只提示该文件并继续其它文件。
- 使用 `textContent`/现有 `esc` 处理文件名；禁止将文件名直接作为未转义 HTML。
- 重复 fingerprint 更新既有书记录并保留已有进度。

**验收**：导入后书架卡片出现；刷新页面、关闭并重启服务后卡片仍在；重复导入不增加数量；失败文件不产生半成品。

### Slice 4：EPUB reader 集成

**目标文件**：`public/js/views/reader.js`、`public/css/reader.css`，必要时 `public/js/local-import/resources.js`。

- 按 `format` 选择 EPUB/HTML/TXT 路径；不得把 PDF 逻辑塞进 CSS 分页分支。
- 恢复资源 Object URL、释放资源、修复图片导致的 reflow 和比例位置保持。
- 目录、字号、行距、主题、热区、拖拽、键盘和 progress 写入全部跑通。

**验收**：EPUB 正文在 1440×960 和窄窗口可读；上一页/下一页跨章节正确；关闭后重开章节/页码恢复；图片不溢出正文列。

### Slice 5：PDF reader

**目标文件**：`public/js/local-import/pdf.js`、`public/js/views/reader.js`、`public/css/reader.css`、`public/index.html`（PDF controls）。

- 实现 PDF.js worker 初始化、文档生命周期、单页 canvas、fit-width/zoom/page navigation。
- 进度记录和恢复使用独立字段；切换格式不会读错旧进度。
- 处理加载/渲染错误、空页面、超大文件内存和关闭释放。

**验收**：至少测试 `E:\epub\政治的人生 (王沪宁) (z-library.sk, 1lib.sk, z-lib.sk).pdf` 或同目录可用 PDF；页面布局、图片和文字可读；翻页/缩放/页码/重开恢复正常。

### Slice 6：阅读器完整流程与 Windows 打包

**目标文件**：`scripts/smoke-reader.mjs`（若适合）、Aegis work record、必要的 `README.md`/`docs`。

- 走真实浏览器流程：导入 EPUB → 打开 → 正文 → 翻页 → 目录/进度 → 关闭 → 重开。
- 走真实 PDF 流程：导入 → 页面 → 翻页 → 缩放 → 关闭 → 重开。
- 测试损坏 EPUB/PDF、重复导入、刷新、窄屏、键盘和 reduced motion。
- 运行 `npm run check`、`npm run smoke:server`、`npm run check:rust`、`npm run dist:windows`。
- 启动最终桌面产物，确认没有控制台窗口，确认导入和阅读路径在 Tauri 内工作。
- 不把 `E:\epub` 样本复制进仓库；不要提交 `node_modules`、Tauri target、Cargo target、vendor 临时源包或截图缓存。

**通过证据**：命令输出、应用启动结果、两种格式的人工可读性检查和 Aegis evidence/checkpoint。

### Slice 7：同步数据模型、离线 outbox 与迁移

**目标文件**：`public/js/shelf.js`、新增 `public/js/sync/model.js`、`public/js/sync/merge.js`、`public/js/sync/outbox.js`、必要的纯函数测试文件。

- 将 `bookKey`、`deviceId`、`logicalRevision`、操作 ID 和进度位置协议写成明确模块接口。
- IndexedDB 版本递增，新增 `sync_outbox`、`sync_cursors`、`sync_devices`，为旧书架和旧进度提供迁移。
- 所有本地导入、Gutenberg 入架、进度保存和书签变更都通过唯一 outbox owner 记录变更。
- 先为合并/指纹/迁移写失败测试并确认 RED，再实现纯函数并确认 GREEN；测试必须覆盖重复操作幂等、双端进度冲突、书签集合合并、删除 tombstone、同一内容哈希去重。

**验收**：没有网络时修改电脑和 Android 的本地模拟数据，重新联网后 outbox 可重放；重复同步不产生重复书卡；旧 DB 数据迁移后仍可阅读。

### Slice 8：Tauri Android 工程与共享阅读路径

**目标文件**：`src-tauri/`、`package.json`、`scripts/run-tauri.mjs`、`docs/DESKTOP-TOOLS.md`、必要的 `src-tauri/capabilities/`。

- 检查 Tauri 2 Android 目标、Rust Android target、Android SDK/NDK/JDK 和 Gradle；缓存与构建目录使用 `E:\tools\Artemis-Desktop`。
- 生成 Android 工程并让同一 `public/` 在 Android WebView 启动；不复制页面和阅读器。
- 配置必要的文件选择、网络、深链/OAuth 回调、二维码扫描和安全存储能力，权限最小化。
- 增加明确脚本（如 `android:init`、`android:dev`、`android:build`、`android:check`），脚本输出清楚失败原因。

**验收**：真实 Android 设备或可复现模拟器启动应用，能访问书架、导入 EPUB/PDF、离线打开已有书籍；Android 构建不把 APK/Gradle/Cargo 中间物写入仓库。

### Slice 9：Google OAuth、二维码配对与加密密钥

**目标文件**：新增 `public/js/sync/google-auth.js`、`public/js/sync/pairing.js`、`public/js/sync/crypto.js`、Tauri 平台安全存储/深链配置、`docs/DESKTOP-TOOLS.md` 的 OAuth 配置说明。

- 先完成 OAuth/PKCE 最小垂直切片：Windows 和 Android 各能登录同一 Google 账号，token 使用平台安全存储，刷新失败可重新授权。
- 使用 `drive.appdata`，验证 Drive API 的创建、上传、下载、changes cursor 和删除/撤销错误；不依赖用户打开 Drive 应用。
- 二维码只传一次性 pairing payload、公钥、同步空间 ID 和过期时间；不传 Google token。
- 两端确认设备名称后建立加密库密钥；密钥丢失或设备撤销有明确错误和恢复路径。

**验收**：用户点击“同步”时能自动刷新授权、上传和拉取变更；网络断开时进入待同步状态，恢复后重试；Drive 中只看到加密数据；没有 client secret、token 或个人路径进入仓库。

### Slice 10：双向同步与正文按需传输

**目标文件**：新增 `public/js/sync/engine.js`、`public/js/sync/google-drive.js`、`public/js/sync/status.js`、`public/js/views/shelfview.js`/`reader.js` 的最小 wiring、必要 CSS。

- 实现 `syncNow()`：刷新 token → 推送本地 outbox → 拉取远端变更 → 解密校验 → 幂等合并 → 写 cursor → 标记完成。
- 支持应用启动、网络恢复、阅读器退出和手动按钮触发；使用 debounce，不能每页访问 Drive。
- 同步书架、阅读进度和书签；正文仅当目标设备缺失且用户点击“获取正文”时传输。
- Gutenberg 正文优先由目标设备按稳定源重新下载；本地 EPUB/PDF 使用加密 Blob、分块上传/下载和 SHA-256 校验。
- 显示“已同步/待同步/授权失效/正文未同步/冲突已合并”，错误不能伪装为空书架。

**验收**：电脑和 Android 分别断网操作，之后不同时在线地先后联网，双方最终得到相同书架和进度；同一本本地文件只保留一个 bookKey；正文传输中断可以续传或重试。

### Slice 11：Android/Windows 端到端回归与发布检查

**目标文件**：Aegis work record、必要的 `scripts/smoke-sync.mjs`、README/桌面工具文档、最终 Tauri 配置。

- 阅读端到端：Android 导入 `E:\epub` 样本的复制文件或设备可访问样本，离线阅读、翻页、关闭、重开恢复；Windows 重复一次。
- 同步端到端：两台设备第一次 OAuth、二维码配对、各自离线添加书/改进度、先后联网点击同步、冲突合并、重新启动恢复。
- 书籍正文：Gutenberg 书在目标端在线重下；本地 PDF/EPUB 只在用户点击获取正文后传输并校验哈希。
- 运行完整 JS/Rust/Windows 检查，以及 Android debug/release 构建；人工记录真实设备、网络拓扑、文件名、进度和结果。
- 更新 checkpoint/evidence/reflection；没有 OAuth client ID、Android 设备或 Google Drive 可用性时如实标记未覆盖，不能声称远程同步完成。

**通过证据**：双向离线变更最终收敛、正文按需传输成功、应用重启后状态保留、Windows 安装包和 Android 构建产物可启动。

## 7. 代码质量约束

- 原生 ES Modules、2 空格、单引号、分号、`const` 优先。
- 异步请求和文件解析必须处理失败、取消/重复触发和阶段提示。
- 不在 `reader.js` 中新增格式解析器；不在 `shelfview.js` 中直接操作 IndexedDB。
- 不用全局变量、localStorage 或 innerHTML 建立新的隐式跨模块协议。
- 所有 Object URL、事件监听、定时器、PDF.js document 和 worker 生命周期必须可释放。
- 不新增“猜路径”的 fallback；资源路径、worker 路径和 ID 生成各有唯一 owner。
- 不修改远程 Gutenberg 代理安全白名单。
- 禁止复制 Koodo 源码；只记录采用的行为模式和依赖依据。
- Google Drive token 不进入 `localStorage`、IndexedDB、日志、二维码或 Git；client secret 不进入客户端。
- 同步核心不得把 Google Drive API 细节散落到书架/阅读器；transport 只实现上传、拉取、cursor 和 Blob 传输接口。
- 同步必须双向；不能把电脑或手机写死为主设备，也不能用整库覆盖隐藏离线冲突。
- Android 与 Windows 共用文档、书架、阅读器和合并逻辑；平台差异只放在文件选择、OAuth 回调、二维码和安全存储 adapter。
- 任何网络失败都保留本地状态和 outbox；不能因为同步失败清空书架或回滚阅读进度。

## 8. 验收命令

```powershell
npm run vendor:reader
npm run test:sync
npm run check
npm run smoke:server
npm run check:rust
npm run dist:windows
git diff --check

# Android 命令按 Slice 8 实际脚本名执行
npm run android:check
npm run android:build
```

浏览器/桌面人工验收必须记录：

- 使用的 EPUB 文件名、PDF 文件名和文件大小。
- 导入阶段是否完成、书架数量变化、书名/格式显示。
- EPUB 当前章节/页、PDF 当前页/总页、关闭后重开位置。
- 1440×960 和窄窗口截图或人工观察结论；截图放在 `E:\tools\Artemis-Desktop\reader-validation\`，不提交。
- 失败项、复现条件和修复后的再次验证结果。
- Android 设备/模拟器型号、Android SDK/NDK/JDK 版本、OAuth 配置是否真实可用。
- 两端 deviceId、同步前后 outbox 数量、Drive changes cursor、书架/进度合并结果；不要记录 token 或密钥。
- 网络拓扑：同一 Wi-Fi、不同 Wi-Fi、先后联网、完全断网；每种结果单独记录。

## 9. 停止条件与风险处理

遇到以下情况必须暂停当前 slice，更新 checkpoint 后再决定，而不是堆 fallback：

- PDF.js worker 在普通浏览器和 Tauri 的资源路径不一致。
- IndexedDB 旧数据无法迁移或大 PDF 触发配额/内存错误。
- EPUB 资源引用需要第二套清洗逻辑。
- 现有 `reader.js` 的分页算法需要大范围重写才能保证可读性。
- Tauri Android 的 IndexedDB/Blob、PDF.js worker、文件选择或安全存储行为与 Windows 不一致。
- Google OAuth client ID、PKCE 回调、`drive.appdata` 权限、token 刷新或 Drive changes API 无法在 Windows/Android 都通过。
- Android SDK/NDK/JDK 或二维码/深链插件缺失；此时暂停远程同步垂直切片，先报告环境阻塞，不伪造成功。
- 双端离线变更合并出现丢书、回退进度、重复操作或同一个 JSON 被并发覆盖。
- 验收连续三次失败，或修复后仍有同一类空白/错页症状。

暂停时记录：症状、最小复现、当前 owner、一个假设、验证结果、下一步；不要把失败尝试当作完成证据。

## 10. 交接给另一个 agent 的说明

把下面这段原样发给执行 agent，并附上本文件路径：

> 你要执行 `F:\project\Artemis\docs\aegis\plans\2026-09-25-reader-import.md`，它已经包含本地阅读器、Tauri Android、双向 Google Drive 同步和 Koodo 参考依据。先读取 `AGENTS.md`、README、计划和 `docs/aegis/work/2026-09-25-reader-import/20-checkpoint.md`，检查 git 状态后切换/创建 `codex/reader-android-sync` 分支，从 Slice 0 开始。执行前记录 HEAD/diff，把计划与 checkpoint 做基线 commit 并推送；每完成一个通过验证的 slice，更新 checkpoint/evidence，做 scoped commit 并推送到该分支。不要 force-push，也不要直接推送 main。必须阅读并参考 `https://github.com/koodo-reader/koodo-reader.git`；本机副本在 `E:\tools\Artemis-Desktop\references\koodo-reader`，重点看计划第 0 节列出的导入、阅读、进度和同步文件。只采用行为和边界，不复制 Koodo 的 AGPL 源码。按 owner 边界实现 EPUB + PDF 本地导入和高质量阅读，不要把解析逻辑塞进 `reader.js`，不要提交 `E:\epub` 文件和任何中间产物。继续完成 Android Tauri 工程，让同一 `public/` 可在真实 Android 设备/模拟器运行；实现本地优先 outbox、双向合并、Google OAuth/PKCE、二维码一次性配对、加密变更日志和 Google Drive `appDataFolder` transport。Google Drive 只同步书架/进度/书签，正文按需传输；不能把 token/client secret 写进源码或本地明文。每完成一个 slice 就更新 `docs/aegis/work/2026-09-25-reader-import/20-checkpoint.md` 和验证证据；必须用 `E:\epub` 的真实 EPUB、PDF 走导入→打开→阅读→翻页→目录/进度→关闭→重开，并在 Windows/Android 走双端离线变更、先后联网、同步按钮和重启恢复。最后运行全部 JS/Rust/Windows/Android 验收命令。遇到 OAuth client ID、Android SDK、设备、Drive API、架构或持久化边界不清，暂停并报告，不用 fallback 掩盖问题。禁止提交 token、client secret、E:\\epub、node_modules、Android/Gradle/Cargo/Tauri 中间产物。完成后返回 commit/push 记录、改动文件、完整验证结果、未覆盖风险和下一步。

## 11. 计划自审结论

- 需求状态：ready；用户已批准 EPUB + PDF、Android、双向离线变更、Google Drive 中转、二维码配对和按需正文传输。
- Change Necessity：`code-change`；现有转换器、Tauri 工程和 IndexedDB 无法满足本地格式、Android 运行时和跨网络双向同步。
- Existence Check：复用现有 `converter.js` 清洗思路、`shelf.js` 持久化 owner、`reader.js` 状态协调和 Tauri `public/` 复用边界；新增本地格式适配器、同步协议、Google Drive transport、Android adapter、二维码/安全存储 adapter 有明确创建理由。
- Architecture Integrity：格式解析、存储、同步合并、传输适配、平台能力和阅读呈现分别拥有唯一 owner；Google Drive 不是书架 source of truth，本地状态和 outbox 才是。
- TDD Route：模式 `auto`，决定 `strict`（持久化、同步合并、OAuth/权限、Android/Windows producer-consumer 边界）；先为 merge/fingerprint/migration/crypto envelope 写可运行的纯函数测试，再做真实设备和云端人工验收。
- Execution Route：`inline`；任务共享 IndexedDB、Android 工程、OAuth 配置和 reader 状态，不适合无协调并行修改。
- 兼容边界：远程书、Node 开发入口、Tauri Windows 服务、旧书架和旧进度保留；Android 复用 `public/`，不复制页面。
- 退役边界：没有删除旧格式路径或 Node 服务；只有新 reader 和同步路径通过完整验收后，才允许清理临时兼容代码。
