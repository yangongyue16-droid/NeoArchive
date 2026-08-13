# NeoArchive

一个面向个人研究与原型验证的《Blue Archive》风格剧情编辑器蓝本，使用 React、TypeScript 与 Vite+ 构建。

## 维护状态

这是一个可运行的原型项目，目前不设全职主维护者。原作者会按自身需求偶尔补充功能，但不承诺固定的发布周期、Issue 响应时间或长期路线图。

欢迎社区接手日常维护、提交 Pull Request，或基于本项目继续开发。若出现愿意长期维护的贡献者，仓库可以转移至新的维护者或共同组织；原作者仍可作为普通贡献者按需参与。

代码以 Apache License 2.0 发布。仓库中的许可证只覆盖本项目原创代码，不授予《Blue Archive》名称、角色、美术、音频、Spine 数据或其他第三方素材的使用权。

当前阶段只建立素材研究基线，不把第三方游戏素材纳入项目版本控制、发行包或商业分发。所有研究素材统一放在 `research-assets/`，并由 `.gitignore` 排除。

素材来源、目录约定和本轮筛选结果见 [`docs/RESOURCE_INVENTORY.md`](docs/RESOURCE_INVENTORY.md)。

AzureArchive 前身调研见 [`docs/AZUREARCHIVE_RESEARCH.md`](docs/AZUREARCHIVE_RESEARCH.md)。

编辑器、播放器、Python 后端与工程格式的实施蓝本见 [`docs/ARCHITECTURE_BLUEPRINT.md`](docs/ARCHITECTURE_BLUEPRINT.md)。

Galgame 创作模式、播放器能力、变量/存档模型与功能优先级见 [`docs/GALGAME_FEATURE_BLUEPRINT.md`](docs/GALGAME_FEATURE_BLUEPRINT.md)。

舞台过场的 GSAP/PixiJS 分层方案、内置预设与扩展约定见 [`docs/TRANSITION_SYSTEM.md`](docs/TRANSITION_SYSTEM.md)。

## 当前脚手架

- Vite+ 统一前端开发、检查、格式化、测试、构建与依赖管理入口。
- React/TypeScript 编辑器与独立播放器入口。
- 编辑器和播放器共用的 `StoryRuntime` 与版本化 Project/Scene/Cue 模型。
- 场景增删改切换、完整 Cue 剧本行 Timeline，以及对白、角色、背景、音频和等待 Inspector。
- 文字与角色坐标即时投影到选中 Cue 预览，连续编辑自动合并撤销记录。
- 版本化本地草稿、Python 工程库正式保存/打开、revision 冲突保护与 JSON 离线备份。
- Galgame 逐字播放、自动模式、已读快进、对话历史、隐藏 UI 和快速存读。
- GSAP 舞台过场 Cue：黑白淡化、档案闸门、光环收束与基沃托斯色带，支持逐项调节时长、停留和强度。
- Zustand 编辑状态、撤销/重做和 TanStack Query 服务状态。
- FastAPI/Pydantic 本地 API、原子 JSON 工程仓库、跨场景校验、ZIP 播放包导出，以及 `pyturso` 素材索引。
- OpenAPI → Orval TypeScript 客户端生成。
- Tauri 2 桌面壳、PyInstaller sidecar 和 Windows NSIS 构建流水线。

## 本地开发

先安装 [Vite+](https://viteplus.dev/guide/)；项目固定使用 Node.js 24/25 与 npm 11：

```bash
vp install
uv sync --project backend
```

只启动 Web 编辑器：

```bash
vp dev
```

另开终端启动 Python/Turso 服务：

```bash
vp run dev:api
```

浏览器入口：

- 编辑器：`http://127.0.0.1:5173/`
- 播放器：`http://127.0.0.1:5173/player`

同时启动 Tauri 开发窗口和 Python API：

```bash
vp run dev:desktop
```

macOS 首次构建 Tauri/PyInstaller 二进制前，需要先由本机用户接受 Xcode license：

```bash
sudo xcodebuild -license
```

## 验证与构建

```bash
vp check
vp test
vp run lint:api
vp run typecheck:api
vp run test:api
vp build
```

`vp check` 一次完成前端格式、lint 与 TypeScript 类型检查；需要自动修复时运行 `vp run format`。

生成 OpenAPI 与前端客户端：

```bash
vp run api:schema
vp run api:generate
```

Windows `.exe` 应在 Windows 环境或仓库提供的 GitHub Actions workflow 中构建：

```bash
vp run build:desktop
```
