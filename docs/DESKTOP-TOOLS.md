# Artemis Tauri 桌面工具链

Windows 桌面构建工具统一放在：`E:\tools\Artemis-Desktop`

目录约定：

```text
E:\tools\Artemis-Desktop\
├─ npm-cache/       npm 下载缓存
├─ rustup-home/     Rust toolchain 管理目录
├─ cargo-home/      Rust/Cargo 工具链和 crate 缓存
├─ cargo-target/    Cargo/Tauri 编译目标和打包中间产物
├─ rustup-download/ rustup 安装程序
└─ release/         生成的 Windows 安装包和中间产物
```

项目源码仍在 `F:\project\Artemis`，项目依赖安装在源码目录的 `node_modules/`，该目录已被 Git 忽略。工具链缓存、Cargo 目标目录和安装包不进入仓库。

## 首次安装

Rust 已安装在工具目录。新终端中执行：

```powershell
cd F:\project\Artemis
$env:npm_config_cache = 'E:\tools\Artemis-Desktop\npm-cache'
$env:RUSTUP_HOME = 'E:\tools\Artemis-Desktop\rustup-home'
$env:CARGO_HOME = 'E:\tools\Artemis-Desktop\cargo-home'
$env:CARGO_TARGET_DIR = 'E:\tools\Artemis-Desktop\cargo-target'
$env:Path = "E:\tools\Artemis-Desktop\cargo-home\bin;$env:Path"
npm install --cache $env:npm_config_cache
```

## 启动 Tauri 开发版

```powershell
cd F:\project\Artemis
$env:RUSTUP_HOME = 'E:\tools\Artemis-Desktop\rustup-home'
$env:CARGO_HOME = 'E:\tools\Artemis-Desktop\cargo-home'
$env:CARGO_TARGET_DIR = 'E:\tools\Artemis-Desktop\cargo-target'
$env:Path = "E:\tools\Artemis-Desktop\cargo-home\bin;$env:Path"
npm run dev:desktop
```

## 生成 Windows exe

```powershell
cd F:\project\Artemis
$env:RUSTUP_HOME = 'E:\tools\Artemis-Desktop\rustup-home'
$env:CARGO_HOME = 'E:\tools\Artemis-Desktop\cargo-home'
$env:CARGO_TARGET_DIR = 'E:\tools\Artemis-Desktop\cargo-target'
$env:Path = "E:\tools\Artemis-Desktop\cargo-home\bin;$env:Path"
npm run dist:windows
```

项目脚本会自动设置 `CARGO_TARGET_DIR`；显式设置环境变量只是为了让命令行为清晰。Tauri 会在 Cargo 目标目录的 `release/bundle/nsis/` 生成安装版 `.exe`。验证通过后，只复制最终安装包到项目 `release/` 再提交；安装后可以从开始菜单或桌面快捷方式打开 Artemis。后续 Android 构建继续使用同一个 `src-tauri/` 工程。

## 验证

```powershell
npm run check
npm run check:rust
npm run smoke:server
```

如果构建失败，先检查 Node.js 18+、npm、Rust MSVC toolchain、Visual Studio C++ Build Tools、网络和 `E:\tools\Artemis-Desktop` 的写入权限。不要把缓存目录、安装包或凭证提交到 Git。
