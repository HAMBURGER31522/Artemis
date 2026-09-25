# Windows 桌面应用第一阶段 - Evidence


## EvidenceBundleDraft: slice-5-verification

- Artifact key: windows-smoke
- Slice ID: slice-5-verification
- Type: manual-smoke
- Source: Start artemis.exe; inspect process, window title, local port, /api/health, and /
- Summary: Artemis window stayed alive with title Artemis; Rust local service answered /api/health ok=true and returned the Artemis page; process then stopped.
- Verifier: Codex
- Evidence status: evidence-finalized

## EvidenceBundleDraft: slice-6-release

- Artifact key: release-installer
- Slice ID: slice-6-checkpoint
- Type: artifact-and-command
- Source: `release/Artemis_0.1.0_x64-setup.exe`; `npm run dist:windows`; `git diff --check`
- Summary: Windows x64 NSIS installer was rebuilt with the unified Cargo target directory and copied as the only binary deliverable in the repository release directory; source checks and whitespace checks passed.
- Verifier: Codex
- Evidence status: evidence-finalized

## EvidenceBundleDraft: slice-7-repair

- Artifact key: desktop-repair
- Slice ID: slice-7-repair
- Type: regression-and-artifact
- Source: `public/js/app.js`, `public/js/api.js`, `public/js/views/browse.js`, `public/js/views/detail.js`, `server.mjs`, `src-tauri/src/main.rs`, `src-tauri/src/server.rs`; `npm run dist:windows`
- Summary: Search submission is captured before the initial asynchronous route finishes, API requests use normalized Gutendex paths and native upstream transport, book cards reuse prefetched metadata, and the release binary uses the Windows GUI subsystem. Rebuilt desktop endpoints returned 200 for health, popular books, search, and Gutenberg HTML content.
- Verifier: Codex
- Evidence status: evidence-finalized

## EvidenceBundleDraft: slice-5-source-checks

- Artifact key: source-checks
- Slice ID: slice-5-source-checks
- Type: command
- Source: npm run check; npm run smoke:server; npm run check:rust
- Summary: JavaScript syntax, existing Node server health smoke, and Rust/Tauri compilation all passed.
- Verifier: Codex
- Evidence status: evidence-finalized

## EvidenceBundleDraft: slice-5-windows-build

- Artifact key: windows-build
- Slice ID: slice-5-windows-build
- Type: artifact
- Source: E:/tools/Artemis-Desktop/cargo-target/release/bundle/nsis/Artemis_0.1.0_x64-setup.exe
- Summary: Tauri generated the x64 NSIS installer successfully.
- Verifier: Codex
- Evidence status: evidence-finalized
