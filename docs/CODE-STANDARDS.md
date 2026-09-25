# Artemis 代码规范

这份文档面向项目维护者；AI 编程代理执行时以根目录 `AGENTS.md` 为准。规范服务于当前的原生 Web 架构，不引入额外框架或构建层。

## 代码形态

- JavaScript 使用 ES Modules，2 空格缩进、单引号、分号和 `const` 优先。
- 文件按单一责任组织：API、转换器、IndexedDB、路由、视图和动效各自维护自己的 owner。
- 公开函数使用能表达输入/输出的名字；不要通过隐式全局变量共享状态。
- 异步操作明确处理成功、失败、超时和取消/重复触发。

## 数据和 DOM

- Gutendex/Gutenberg 数据属于不可信外部输入。
- 纯文本进入 DOM 使用 `textContent`；HTML 只能经过清洗或字段转义后渲染。
- 转换器是正文 HTML 的唯一清洗边界；阅读器不重新实现一套清洗逻辑。
- IndexedDB 的数据结构由 `shelf.js` 维护，版本升级必须有迁移策略。

## 样式和动效

- 颜色、排版、间距、圆角、阴影、时长和缓动优先使用 `public/css/tokens.css`。
- 持续动效只改变 `transform`/`opacity`；使用 `prefers-reduced-motion` 时立即完成或关闭动效，但保留内容和功能。
- 新交互必须考虑键盘、焦点、关闭、空状态、错误状态和窄屏布局。

## 修改前后

修改前先确认 canonical owner 和不变边界；修改后先执行与改动匹配的验证，再说明已覆盖和未覆盖范围。新增 fallback、适配层或兼容分支时，要同时写明真实兼容证据和退役条件。

推荐的基础检查：

```powershell
node --check server.mjs
Get-ChildItem -Recurse public\js -Filter *.js | ForEach-Object { node --check $_.FullName }
git diff --check
```
