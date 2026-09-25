# Artemis 本地书籍导入与阅读器 - Intent

## TaskIntentDraft

- **Outcome**：Artemis 可以导入并稳定阅读本地 EPUB/PDF，在 Windows 和 Android 离线使用，并通过 Google Drive 双向同步书架、阅读进度和书签。
- **Goal**：以真实 `E:\epub` 文件证明导入、正文可读、翻页、目录/页码、进度保存和重开恢复；以两端先后联网证明变更最终收敛。
- **Approved source**：用户 2026-09-25 对“EPUB + PDF 都支持真实阅读”、Android 开发、Google Drive 无自建服务器同步、二维码配对和 Koodo 参考的确认；详细计划见 `docs/aegis/plans/2026-09-25-reader-import.md`。
- **Scope**：EPUB ZIP/OPF/spine/nav 解析，PDF.js 页面渲染，IndexedDB 迁移，书架导入入口，阅读器格式分支，Tauri vendor 资源，Android 工程，OAuth/PKCE，二维码配对，离线 outbox，Google Drive appDataFolder transport，正文按需传输，完整验收和 Windows/Android 构建。
- **Non-goals**：Artemis 自建服务器、笔记/词典/TTS、MOBI/CBZ/FB2、DRM、PDF 文本搜索和连续滚动、正文默认自动上传。
- **Success evidence**：至少一份中文 EPUB 和一份 PDF 在 Windows/Android 导入、阅读、翻页、保存并恢复；两端能在不同时间联网后合并书架/进度；基础命令、Windows 安装包和 Android 构建通过。
- **Stop states**：`done`、`blocked`、`needs-verification`、`scope-exceeded`。

## BaselineUsageDraft

- **Required baseline refs**：`AGENTS.md`、`README.md`、`docs/CODE-STANDARDS.md`、`public/js/converter.js`、`public/js/shelf.js`、`public/js/views/reader.js`、`public/js/views/shelfview.js`、`public/js/app.js`、`public/css/reader.css`、`src-tauri/tauri.conf.json`、上一阶段 desktop checkpoint。
- **Acknowledged before plan**：全部已读取。
- **Cited in plan**：上述 owner 和兼容边界在计划第 3、4、7 节使用。
- **Missing refs**：无决策级缺失。
- **Decision**：`continue`。

## ImpactStatementDraft

- **Affected layers**：浏览器文件输入、格式解析、HTML 清洗、IndexedDB、阅读器状态、CSS 阅读舞台、静态 vendor 资源、Tauri 打包。
- **Canonical owners**：格式适配器负责解析；`shelf.js` 负责持久化；`reader.js` 只协调状态和呈现；vendor 脚本负责运行时依赖资产。
- **Invariants**：远程 Gutenberg 路径继续可用；外部/本地 HTML 都经过安全清洗；本地书不依赖原始路径或网络；进度按格式隔离；资源 URL 可释放。
- **Compatibility**：保留旧远程书和旧进度；IndexedDB 版本显式迁移；Node 浏览器入口与 Tauri Rust 服务不变。
- **Risks**：大 PDF 配额/内存、PDF.js worker 路径、EPUB 资源恢复、旧分页算法在窄屏上的可读性、Android WebView Blob/worker、OAuth/PKCE 回调、Drive quota/changes cursor、token/密钥安全和双端冲突。
