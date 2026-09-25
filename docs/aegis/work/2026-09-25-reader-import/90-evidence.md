# Artemis 本地书籍导入与阅读器 - Evidence

状态：`partial`

当前没有实现证据。此文件只记录接手 agent 完成 slice 后的有界命令、真实样本和人工验收结果，不复制原始日志或完整 diff。

需要补充的终端证据：

- `npm run vendor:reader`
- `npm run check`
- `npm run smoke:server`
- `npm run check:rust`
- `npm run dist:windows`
- `git diff --check`

需要补充的真实文件证据：

- 一份 `E:\epub\*.epub`：导入、章节正文、翻页、目录、进度、关闭重开。
- 一份 `E:\epub\*.pdf`：导入、页面渲染、翻页、缩放、页码、进度、关闭重开。
- Tauri 发布版导入和阅读路径。

未覆盖范围：Android 真机/模拟器构建、Google OAuth/Drive 远程链路、PDF 文本选择/搜索/连续滚动、其它书籍格式；这些必须由后续 Slice 7-11 新鲜验证后更新。
