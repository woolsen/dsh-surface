# dsh-surface

**对话里的活页面。预览、报表，或者问一句。**

[English](README.md) · 简体中文

`dsh-surface` 是一个 [DeepSeekRuntime](https://github.com/deepseek-ai/deepseek-harness) 插件：把一份完整的 HTML 页面渲染在对话里。可以用于前端 UI 预览、数据报表、mockup、计算器，也可以做成表单/审批——用户在页面上操作完，结构化结果**从同一个工具调用**回到模型。

![页面等待提交](docs/screenshot-waiting.png)

## 它解决什么

聊天界面通常只能显示文字或固定的组件树。页面不一样：它能排出一份真正的报表、跑图表、长得和你正在做的界面一样，也能把用户的选择直接收集成数据，而不是让用户再用一句话翻译一遍。

`dsh-surface` 只给模型一个工具：

- **渲染页面**：自包含 HTML，沙箱隔离，跟随宿主主题，自动高度；
- **可选地等**：工具调用原地阻塞，直到用户提交、取消或超时；
- **返回数据而不是描述**：页面调用 `dshSurface.submit(data, summary)`，模型在同一轮拿到 `{ answered, summary, data }`。

它不是组件库，也不是 artifact 管理器；它是模型和用户之间的一块页面。

## 特性

- 任意自包含 HTML：内联 CSS/JS、SVG、canvas，无外部请求。
- 默认沙箱：opaque origin，无 `allow-same-origin`；CSP 阻断网络、表单、嵌套页面和顶层跳转。
- 跟随主题：把 `--dsw-*` 映射成 `--background`、`--foreground`、`--chart-*`、`--radius` 等。
- 自动高度：iframe 上报内容高度，卡片自适应。
- 阻塞式回答：不需要额外的问答面板，页面提交即工具返回。
- 兼容 OpenChamber 页面：`window.openchamber.submit(data, summary)` 是 `window.dshSurface` 的别名。

## 安装

需要带 Web UI 的 DeepSeekRuntime（`dsh web`），Node.js `^22.19.0 || >=24`。

```sh
dsh plugin --profile web add dsh-surface
```

重启 `dsh web`，刷新浏览器，在新会话里生效。

> 如果从本地 checkout 安装：先 `npm install && npm run build`，再 `dsh plugin --profile web add link:/path/to/dsh-surface`。

## 使用

直接让模型画页面：

> 用 render 工具画一份 Q3 营收报表，包含柱状图和明细表，页面自包含。

> 把这份发布检查清单渲染成页面，带批准/拒绝和备注框；提交时调用 `dshSurface.submit({ decision, note }, summary)`。

模型调用 `render` 工具，页面出现在工具卡片里。如果页面调用了 `dshSurface.submit`，这次调用会一直等到用户提交。

### 工具参数

| 字段             | 类型   | 必填 | 含义                                                  |
| ---------------- | ------ | ---- | ----------------------------------------------------- |
| `html`           | string | 是   | 完整、自包含的 HTML 文档（最多 200,000 字节）。       |
| `title`          | string | 否   | 卡片标题；页面自己的 `<title>` 仍然决定 iframe 标题。 |
| `timeoutSeconds` | number | 否   | 等待提交的时间，默认 600，最大 3600。                 |

返回一个 JSON 字符串：

```json
{ "answered": true, "summary": "批准并备注", "data": { "decision": "approve", "note": "ship it" } }
```

超时返回 `{ "answered": false, "reason": "timeout" }`；取消则按宿主的取消错误失败。

### 页面 API

```html
<button onclick="dshSurface.submit({ decision: 'approve' }, '批准')">批准</button>
```

| API                                | 含义                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `dshSurface.submit(data, summary)` | 提交答案。`data` 必须可 JSON 序列化（≤ 16 KB）；`summary` 是一句人类可读的摘要（≤ 500 字符）。必须在用户手势里调用，返回 Promise。 |
| `dshSurface.answered`              | 是否已经接受过答案。                                                                                                               |
| `dshSurface.answer`                | 已接受的答案。                                                                                                                     |
| `dshRender` / `openchamber`        | 改名前的兼容别名。                                                                                                                 |

## 安全模型

- 页面运行在 `sandbox="allow-scripts allow-forms"` 且**没有** `allow-same-origin` 的 iframe 里，opaque origin，读不到宿主页面、cookie 或存储。
- 文档级 CSP 只允许内联脚本/样式和 `data:` 图片，阻断 `connect-src`、嵌套页面、表单和跳转。
- 提交路由注册在宿主认证过的 `/api` 通道上（`ctx.connection.fetch`），只有 owner peer 能到达；Host/Origin 和浏览器认证由宿主先校验。
- 限制：摘要 500 字符、数据 16 KB、HTML 200 KB。
- 页面不应该索要密钥；页面内容一律按不可信处理。

更多细节见 [docs/architecture.md](docs/architecture.md)。

## 兼容性

| 环境                    | 状态                                                    |
| ----------------------- | ------------------------------------------------------- |
| `dsh web`（0.2.1-rc.2） | 已端到端实测                                            |
| headless / TUI          | 没有页面层；工具会等到超时并返回 `answered: false`      |
| 桌面版（Electron）      | 尚未验证；自定义 fetch 是否走 IPC bridge 需要实机跑一次 |

## 已知限制

1. **轮次结束后页面会折叠。** 卡片在工具调用组里，turn 结束组会收起；答案仍在 transcript 中，展开工具组可以重新看到页面。计划用 `conversation.chat.turnTail` 解决。
2. **暂不支持本地图片。** 只渲染 `data:` / 内联图片；读取工作区文件并做预算还没做。
3. **HTML 在工具参数里。** 大页面会进入会话日志，后续轮次可能重复计入上下文；计划改成 artifact 文件 + 短 id。
4. **没有等待通知。** 切到别的会话时不会提示“有页面等你提交”。
5. **宿主重启丢失等待。** 等待表在内存里；重启后工具调用被中断，页面变成只读。
6. **没有持久化和版本。** 插件不存储内容，每次渲染都是一次新调用。

## 开发

```sh
npm install
npm run check      # lint + typecheck + 测试 + 构建 + 格式检查
npm test           # node:test
npm run build      # lib/index.js + lib/client.js
```

贡献前请读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT © 2026 woolsen
