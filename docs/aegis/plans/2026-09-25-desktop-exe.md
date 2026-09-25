# Artemis Windows 桌面应用第一阶段实施计划

进度：`[██████████] 100%`（Tauri 本地服务、窗口、Windows NSIS 构建、启动冒烟和目标仓库推送已完成）

## Aegis 可见性与范围

这是一个新的 distribution surface：现有网页要被一个 Windows 桌面壳承载，并为后续 Android 复用同一套前端和本地服务边界。计划用于锁定边界、记录启动生命周期和打包验证，避免第一阶段混入账号或云同步。

目标是生成可以直接打开的 Windows `.exe`，启动后显示当前 Artemis 首页，桌面主进程拥有本地服务的启动和关闭生命周期。

明确不做：安卓应用、手机同步、账号、云端数据库、自动更新、前端 UI 重写、跨设备数据协议。

## 技术方案

- 桌面壳：Tauri 2，Windows 和 Android 共用 Rust 主进程与同一套前端资源。
- 本地服务：Rust `axum` 本地服务使用随机回环端口，承接静态资源、健康检查和 Gutenberg/Gutendex 代理；现有 `server.mjs` 保留为浏览器开发入口。
- 页面：继续加载同一个 `public/`，不复制一套桌面页面。
- 打包：Tauri bundler，第一阶段生成 Windows NSIS `.exe` 和 MSI 安装包。
- 工具目录：`E:\tools\Artemis-Desktop`，保存 npm/Tauri/Rust 缓存和生成产物。
- 数据边界：继续使用浏览器 IndexedDB；本阶段不改变书架数据结构。

## 基线与 owner

- `server.mjs`：浏览器开发模式的本地 HTTP 服务 owner。
- `src-tauri/src/server.rs`：桌面/移动本地 HTTP 服务和 API 代理 owner。
- `public/`：现有网页功能的 canonical owner。
- `src-tauri/src/lib.rs`：Tauri 窗口、应用生命周期和本地服务任务 owner。
- `package.json`、`src-tauri/tauri.conf.json`：桌面开发、构建和发布配置 owner。
- `AGENTS.md`：项目代码规范和验证边界。

## TDD Route

- 模式：`off`
- 决策：`skipped`
- 权威：用户没有明确要求严格 TDD；沿用当前项目没有测试框架的基线。
- 测试姿态：使用服务启动/健康检查、JavaScript 语法检查、打包产物存在性和桌面启动冒烟作为目标回归证据。

## 执行任务

- [x] `slice-1-baseline-plan`：读取 README、AGENTS、server，确认跨平台约束和验收条件。
- [x] `slice-1-first-principles`：否决仅 Windows 的 Electron 壳，选择可复用 Android 的 Tauri 2 方向。
- [x] `slice-2-native-server`：新增 Rust 本地服务，复用现有代理白名单、缓存边界、健康检查和静态资源回退。
- [x] `slice-3-desktop-shell`：新增 Tauri 主进程，启动本地服务、创建窗口、加载随机端口、退出时释放服务。
- [x] `slice-4-packaging`：配置 Tauri Windows 打包和后续 Android 生成入口，保留 Node 浏览器开发脚本。
- [x] `slice-5-verification`：安装依赖，运行 JS/Rust 检查，生成 NSIS `.exe`，做启动/关闭冒烟检查。
- [x] `slice-6-checkpoint`：更新进度条、证据包、漂移状态，提交必要文件并推送目标仓库。
- [x] `slice-7-repair`：修复启动期 Enter 刷新、Gutendex 代理请求、详情重复请求和 Windows 发布版控制台窗口。

## 兼容和退役

- 保留 `node server.mjs` 与 `http://localhost:3311` 的原有开发入口。
- 保留 `public/` 作为单一页面来源，不复制 desktop 专用页面。
- 本阶段没有旧路径退役；Tauri 是新增承载层，Node 服务保留给浏览器开发。若后续发现重复服务 owner，必须先重新评估再删除。

## 验证

```powershell
npm install
npm run check
npm run smoke:server
npm run check:rust
npm run dist:windows
```

已完成验证：`npm run check`、`npm run smoke:server`、`npm run check:rust`、`npm run dist:windows`；新桌面服务的榜单、搜索和 Gutenberg 正文代理均返回 200，发布版 PE subsystem 为 Windows GUI，直接启动编译产物时窗口标题为 `Artemis`，进程可保持并可结束。未覆盖安装器实际安装流程、安卓同步和跨设备数据一致性。

## 风险

- Rust/Tauri 下载和构建依赖较大，首次安装可能受网络或镜像影响。
- Windows 打包产物能生成不等于用户环境上的安装和网络访问都已验证。
- 当前页面依赖外部 Gutendex/Gutenberg 网络，桌面壳不会消除该依赖。
- Gutendex 仍可能按网络出口触发 Cloudflare 挑战；桌面服务已使用 Rust reqwest、有限重试和尾斜杠/空查询规范降低误判，但无法替代上游可用性。
