# Windows 桌面应用第一阶段 - Intent

## TaskIntentDraft

- Requested outcome: 把现有 Artemis 网页封装为可以打开的 Windows 桌面应用，并保留现有网页功能。
- Goal: 先完成可启动的桌面壳和可重复的 exe 打包入口，为后续安卓同步保留清晰边界。
- Success evidence:
- npm run dist 生成可执行安装包或便携 exe；启动后显示现有 Artemis 首页；/api/health 可用；关闭窗口能结束本地服务。
- Stop condition: done：Windows 桌面应用可以启动并显示现有网页；blocked：构建依赖或系统环境无法获得；needs-verification：构建成功但安装/启动冒烟未完成；scope-exceeded：出现安卓同步、账号、云端数据库等后续范围。
- Non-goals:
- 安卓应用与同步
- 账号、云端数据库和自动更新
- 重写前端 UI
- Scope: Tauri 2 桌面壳、Rust 本地服务、Windows 打包配置、构建和启动验证、Aegis 任务记录；保持 Android 可复用边界。
- Change kinds:
- distribution-surface
- Risk hints:
- 新桌面分发边界；涉及 Tauri 主进程、Rust 本地服务、端口生命周期和打包资源。

## BaselineReadSetHint

- README.md
- AGENTS.md
- server.mjs
- package.json（当前缺失）

## BaselineUsageDraft

- Required baseline refs:
- README.md
- AGENTS.md
- server.mjs
- package.json（当前缺失）
- Delivered context refs:
- none
- Acknowledged before plan:
- README.md
- AGENTS.md
- server.mjs
- Cited in plan:
- none
- Missing refs:
- package.json（当前缺失）
- Advisory decision: continue

## ImpactStatementDraft

- Compatibility boundary: 网页启动命令 node server.mjs 保持可用；桌面应用通过本地随机端口承载同一 public/。
- Affected layers:
- desktop distribution
- Owners:
- src-tauri/src/lib.rs + src-tauri/src/server.rs + package.json
- Invariants:
- 现有浏览器版仍可用；服务器代理白名单和书架 IndexedDB 行为不被桌面封装改变。
- Non-goals:
- 安卓应用与同步
- 账号、云端数据库和自动更新
- 重写前端 UI

These records are Method Pack drafts / hints, not authoritative runtime decisions.
