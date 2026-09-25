# Artemis 项目开发规则

## 1. 项目定位

Artemis 是基于原生 HTML、CSS、浏览器 JavaScript ES Modules 和 Node.js 的公版书城与阅读器。
运行时不依赖 npm 包或数据库：Node 服务负责静态文件和受限上游代理，浏览器负责界面、正文转换、书架和阅读进度。

规则优先级为：用户当前明确要求 > 本文件 > `docs/` 中的项目文档 > 现有代码与测试证据 > 通用工作流建议。
用户没有明确要求时，不引入 Trellis PRD 流程；Aegis 只负责工程工作流和验证纪律，不拥有产品需求或最终验收权。

## 2. 开发前基线

开始非简单改动前，至少阅读：

- `README.md`
- 与任务相关的模块和视图
- `server.mjs`（涉及服务端、代理、缓存或安全边界时）
- `public/css/tokens.css`（涉及视觉或动效时）

先确认需求的 canonical owner、影响范围和不变边界，再修改最少的文件。不要因为调用方更方便就把新职责塞进过大的模块。

## 3. 模块所有权

| 模块 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| `server.mjs` | 静态托管、`/api/health`、Gutendex 元数据代理、Gutenberg 正文代理、缓存和上游超时 | 业务渲染、IndexedDB、浏览器状态 |
| `public/js/api.js` | Gutendex 请求、正文源选择、下载和图片代理 URL | DOM 渲染、书架持久化 |
| `public/js/converter.js` | HTML/TXT 解码、清洗、分章和正文结构化 | 网络请求、书架写入、阅读器状态 |
| `public/js/shelf.js` | IndexedDB 的 `books`/`progress` 读写和进度索引 | 视图模板、网络下载 |
| `public/js/app.js` | hash 路由、视图生命周期、全局角标和入口事件 | 具体视图 HTML、转换算法 |
| `public/js/views/browse.js` | 书城列表、筛选、分页和列表交互 | 书籍详情的下载流程 |
| `public/js/views/detail.js` | 书籍详情、入架流程和详情层生命周期 | 通用 API 实现、IndexedDB 底层实现 |
| `public/js/views/shelfview.js` | 书架展示和书架操作入口 | 阅读器分页算法 |
| `public/js/views/reader.js` | 阅读器排版、翻页、目录、设置和阅读进度协调 | 正文下载和转换 |
| `public/js/motion.js` | 可复用动效和动效生命周期 | 业务数据请求 |
| `public/css/tokens.css` | 颜色、字体、间距、时长、缓动和阴影令牌 | 具体页面结构 |
| `public/css/base.css` | 书城、详情、书架和通用布局样式 | 阅读器专属排版 |
| `public/css/reader.css` | 阅读器布局、分页和阅读器主题 | 书城布局 |

新增职责前，先判断现有 owner 能否承接；如果不能，说明原因并建立独立模块，不复制第二套状态或数据源。

## 4. JavaScript 规范

- 使用原生 ES Modules；浏览器代码使用 `import`/`export`，服务端保持 `.mjs`。
- 保持当前风格：2 个空格缩进、单引号、语句末尾分号、优先 `const`、早返回和小函数。
- 不为小功能引入框架、构建工具或 npm 依赖。确需新增依赖时，先说明运行时收益、替代方案和维护成本。
- 网络请求必须检查 `response.ok`，处理超时、失败和可重试边界；不能把上游异常伪装成空数据。
- 外部数据进入 HTML 前必须经过现有清洗/转义边界。纯文本使用 `textContent`；只有模板是受控且字段已转义时才使用 `innerHTML`。
- 不把 `innerHTML`、全局变量或 `localStorage` 作为新的隐式跨模块协议。跨模块状态优先通过明确函数参数和返回值传递。
- 事件监听、定时器、`requestAnimationFrame` 和 `IntersectionObserver` 必须有对应的生命周期清理，避免路由切换后重复绑定。
- IndexedDB schema 变更必须递增版本并提供迁移；不能静默改变已有记录字段的含义。
- 修复 bug 时先复现并定位 owner，再修改；不要用调用方 guard、重复 fallback 或吞错来掩盖根因。

## 5. CSS 与交互规范

- 新颜色、字体、间距、圆角、阴影、动效时长和缓动优先复用 `tokens.css`；不要散落同义魔法值。
- 动效优先使用 `transform` 和 `opacity`。避免在持续动画中触发布局或昂贵滤镜。
- 所有非即时动效都要兼容 `prefers-reduced-motion: reduce`，内容和交互不能因降级而缺失。
- 页面结构改变时同步检查窄屏、键盘焦点、关闭路径和空状态；新增交互不能只验证鼠标悬停。
- 视觉改动保持 Artemis 的纸张、墨色、朱砂和文学阅读器语义，除非用户明确要求改换视觉方向。

## 6. 服务端与安全边界

- `/api/content` 只允许明确的 HTTPS Gutenberg 域名；修改白名单必须说明安全理由和验证范围。
- 保持路径规范化和静态目录越界保护；不直接拼接未经校验的文件路径。
- 上游请求保留超时、一次有限重试和明确错误状态；不增加无限重试或无界缓存。
- 缓存修改必须说明 TTL、容量、淘汰策略和失败时行为。
- 不把 API key、个人路径、浏览器数据或本地凭证写入源码和文档。

## 7. 变更流程

1. 先读基线并写清目标、成功证据、非目标和受影响 owner。
2. 判断是 `docs/config-only`、`code-change` 还是 `needs-clarification`；没有必要的改动不写代码。
3. 按 owner 做最小充分变更；同时记录旧路径是删除、保留并说明原因，还是安排后续退役。
4. 运行与改动相匹配的新鲜验证，读完整输出后再报告结果。
5. 报告改动文件、验证命令、覆盖范围、未覆盖范围和残余风险。不能用“应该可以”代替证据。

## 8. 最小验证集

在没有更专门测试的情况下，代码改动至少执行：

```powershell
node --check server.mjs
Get-ChildItem -Recurse public\js -Filter *.js | ForEach-Object { node --check $_.FullName }
git diff --check
```

涉及服务器启动、API 或路由时，额外启动 `node server.mjs`，检查 `/api/health` 和目标路径后再结束进程。
涉及浏览器交互、布局或阅读器时，额外做一次实际浏览器冒烟检查，覆盖目标路径、错误路径和窄屏/降运动边界。

## 9. Git 边界

- 每次任务开始先记录 `git status` 和当前 diff；不覆盖用户已有改动。
- 只处理本任务涉及的文件，不使用宽泛的 `git add .`、reset、clean 或删除命令。
- 未经用户明确要求，不推送、合并、发布或删除分支。
- 完成报告中的“已完成”只覆盖本次新鲜验证实际覆盖的范围。
