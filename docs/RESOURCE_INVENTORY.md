# 资源研究清单

更新日期：2026-08-13

## 使用边界

- 用途：个人研究、界面原型和素材结构分析。
- 不进入应用发行包，不作为项目自身资产再分发。
- `research-assets/` 已加入 `.gitignore`，代码只引用后续制作的占位资源或用户自行配置的本地资源路径。
- 原始素材的著作权与商标权归其各自权利方；本清单不授予额外许可。

## 目录约定

```text
research-assets/
├── archives/        # 原始 ZIP，保留来源包
├── extracted/       # 完整解压内容，供研究检索
├── curated/         # 与当前原型目标直接相关的候选素材
├── references/      # 已下载但不属于当前目标的旁支参考
└── ba-public-pack/  # 民间公开剧情素材包，由 scripts/sync_ba_public_pack.py 同步
```

## 民间公开剧情素材包

目录：`research-assets/ba-public-pack/`
同步命令：`vp run assets:sync` 或 `python3 scripts/sync_ba_public_pack.py`

这是当前能公开下到、且可直接给剧情编辑器使用的最完整包。它不是官方日服客户端整包。

| 来源 | 角色 | 日期 |
| --- | --- | --- |
| [ba-archive `ba-all-data`](https://yuuka.cdn.diyigemt.com/image/ba-all-data/) | 剧情背景 JPG、立绘 PNG、BGM OGG、命名 Spine、Excel 清单 | 清单 `Last-Modified: 2026-06-23`；普通背景多在 `2025-08-06`，活动 CS 图可到 `2026-03-09` |
| [ba-all-data-spine42](https://yuuka.cdn.diyigemt.com/image/ba-all-data-spine42/) | `CH*` / `NP*` 的 Spine 4.2 骨骼 | 有 `CH0300`（2025-07），没有 2026 夏活 `CH0348` |
| [SchaleDB JP](https://schaledb.com/data/jp/students.json) | 现行日服学生元数据与头像/立绘 WebP | 2026-08 仍在更新，272 名学生 |

本机已同步结果（2026-08-13，约 1.32 GB / 5602 个文件）：

| 类别 | 数量 |
| --- | --- |
| 平面背景 JPG | 1943 / 1947（缺 4） |
| 剧情立绘 PNG | 546 / 549（3 张公开源没有：泰拉重械、小号手天使、霞 NPC 变体） |
| BGM OGG | 364 / 364；热门曲有中文译名，其余保留官方英文曲名 |
| 编辑器汉化 | 背景/角色/音效下拉为中文优先，仍可用原文件名搜索。词表在 `scripts/ba_zh_tokens.json` |
| 剧情 SE WAV | 由 `scripts/ba_story_se.json` 按剧情 JSON 引用从 `Audio/Sound/` 拉取；不是完整游戏音效包 |
| 可用 Spine（skel+atlas+png） | 543 |
| SchaleDB 学生图 | 1088（272 人 × collection/icon/portrait/lobby） |
| 表情/常用 SE | 32 |

核对过、但不能作为本包来源的更新渠道：

- `feilongproject/ba-data` 最后一次推送是 2025-12，且 Excel 多为 Git LFS 指针，没有可直接用的完整媒体。
- `kiraio-moe/Schale-Archive` 最后更新 2025-01，只含 Spine，体积约 2 GB git。
- `archive.blue-archive.io` 有 Cloudflare 挑战，脚本无法直接拉。
- `Deathemonic/BA-AD` 一类工具是从官方游戏 CDN 拉整包 AssetBundle，不是已经公开解好的剧情素材，这里不使用。

结论：没有找到 2026-08 的完整日服解包镜像。开发包以 2026-06-23 的 ba-archive 清单为准，媒体能下就下；2026 新学生至少能从 SchaleDB 拿到头像和资料卡。

## 角色：Sakurako (Pop Idol) - 0274

- 来源页：https://www.spriters-resource.com/mobile/bluearchive/asset/513088/
- 原始包：`research-assets/archives/characters/sakurako_pop_idol_0274.zip`
- 解压目录：`research-assets/extracted/characters/sakurako_pop_idol_0274/`
- 内容：15 个 PNG，包括 Home/Sprite 图集、头像、收藏头像、技能头像、羁绊图标、神名文字图标和武器图标。
- 校验：ZIP 完整性检查通过。

注意：`CH0274_home*.png` 与 `CH0274_spr.png` 是供动画骨骼使用的纹理图集，并非已经合成的角色立绘。头像类 PNG 可以直接用于列表、卡片和导航原型。

## 十张可直接使用的平面背景

目录：`research-assets/curated/backgrounds/`

| 文件 | 场景 | 尺寸 |
| --- | --- | --- |
| `BG_AronaRoom.jpg` | Arona 房间 | 1600×1124 |
| `BG_ClassRoom.jpg` | 教室 | 1280×900 |
| `BG_CityTown.jpg` | 城镇 | 1280×900 |
| `BG_GameDevRoom.jpg` | 游戏开发部房间 | 1280×900 |
| `BG_MainOffice.jpg` | 主办公室 | 1280×900 |
| `BG_Park.jpg` | 公园 | 1280×900 |
| `BG_RamenYa.jpg` | 拉面店 | 1280×900 |
| `BG_SchoolRooftop.jpg` | 学校屋顶 | 1280×900 |
| `BG_ShoppingMall.jpg` | 商场 | 1280×900 |
| `BG_View_Kivotos.jpg` | Kivotos 城市全景 | 1600×1124 |

资源路径结构来自 ba-archive 剧情播放器的公开资源约定：

- 项目：https://github.com/ba-archive/blue-archive
- 资源根：https://yuuka.cdn.diyigemt.com/image/ba-all-data/
- 背景目录：`UIs/03_Scenario/01_Background/`

这些 JPG 均已检查文件格式和尺寸，并抽样进行视觉核对。

## 十组 Lobby 原始分层包

这些包保留在 `archives/background-packs/`，完整内容位于 `extracted/background-packs/`。多数素材是 Spine 动画的分层纹理，不能直接当作完整背景；它们更适合后续研究骨骼动画、前后景分层和视差效果。

| 本地包名 | 来源页 |
| --- | --- |
| `arona_plana_workpage.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/515716/ |
| `aru_lobby.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/515224/ |
| `chihiro_lobby.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/515900/ |
| `chinatsu_hot_spring_lobby.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/515730/ |
| `hina_dress_lobby.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/515726/ |
| `kotama_camping_lobby.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/515922/ |
| `koyuki_lobby.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/520144/ |
| `shiroko_terror_lobby.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/515729/ |
| `sora_shop.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/515724/ |
| `tsubaki_guide_lobby.zip` | https://www.spriters-resource.com/mobile/bluearchive/asset/516513/ |

所有十个 ZIP 均通过完整性检查。

## UI 资源

目标已经修正为“界面 UI 与对话框 UI”。活动入口 Banner、活动主视觉和 Lobby 前景不再计入 UI 成果。

### 通用界面 UI

- 来源：https://github.com/ba-archive/blue-archive/tree/main/lib/ba-story-player/lib/layers/uiLayer
- 素材目录：`research-assets/curated/ui/interface-assets/`
- 数量：14 个 SVG、PNG 或 WebP。
- 内容：关闭、菜单、设置、快进、显示/隐藏、方向箭头、音量状态、滑块节点、标题 Banner、多边形底纹、按钮底纹及按钮角部装饰。

这些资源对应剧情播放器中的菜单、设置、选择按钮和弹窗控件，属于可构成界面骨架的 UI，而不是活动宣传图。

### 对话框 UI

- 来源：https://github.com/ba-archive/blue-archive/tree/main/lib/ba-story-player/lib/layers/textLayer
- 素材目录：`research-assets/curated/ui/dialog-assets/`
- 数量：5 个 SVG 或 WebP。
- 内容：四个标题框角与一个“继续对话”指示器。
- 参考实现：`research-assets/curated/ui/reference-components/StoryDialog.vue`

剧情对话框的主体并不是一张固定底图，而是由底部深色透明渐变、角色姓名、社团/身份副标题、分隔线、正文和下一句指示器组合出来。这样才能随屏幕比例和文字长度自适应。参考实现中可直接测得这些层次、间距和透明度。

### 界面组件参考

目录：`research-assets/curated/ui/reference-components/`

- `StoryInterface.vue`：剧情界面菜单与交互层。
- `StoryDialog.vue`：底部剧情对话框与标题/地点层。
- `ModalDialog.vue`：设置类模态弹窗。
- `BaButton.vue`：通用按钮。
- `BaSelector.vue`：剧情选项按钮组。
- `LICENSE-AGPL-3.0.txt`：上游代码许可证。

这些 Vue 文件仅作为研究参考保存于已忽略的素材目录。若直接复制代码进入应用，需要按上游 AGPL-3.0 许可证处理；正式原型更适合根据观察结果独立实现自己的组件。

### Schale-Archive 核对结果

项目：https://github.com/kiraio-moe/Schale-Archive

该仓库主要包含角色、Lobby、背景和 Raid Boss 的 Spine 资源。仓库内没有一套通用按钮、导航、弹窗和剧情对话框资源，因此它适合补充动画素材，不适合作为本次界面 UI 的主来源。

### 旁支参考：活动与 Lobby UI

- 来源页：https://www.spriters-resource.com/mobile/bluearchive/asset/515144/
- 原始包：`research-assets/archives/ui-packs/serenade_event_833.zip`
- 完整解压：`research-assets/extracted/ui-packs/serenade_event_833/`
- 数量：103 个 PNG。
- 内容：多语言活动标题、入口图、快速入口 Banner、任务/商店/舞台背景、玩法说明图和调查证物图标。
- 降级目录：`research-assets/references/event-ui/serenade_event_833/`。
- Sora Shop 前景：`research-assets/references/lobby-ui/sora_shop/`。

### 选型结论

当前 UI 基线由“小型纹理/图标 + 自适应组件”构成。对话框、模态框、按钮、分页与导航应在原型中以 CSS/组件重建，只让纹理和图标承担装饰角色；这比固定尺寸的大 PNG 更容易维护、换肤和适配不同分辨率。

## 本轮统计

- 民间公开剧情包：`research-assets/ba-public-pack/`，约 1.32 GB，清单日期 2026-06-23。
- 编辑器可点选：1943 张背景、543 个 Spine 角色、364 首 BGM。
- 角色资源抽样：1 个 ZIP / 15 个 PNG。
- Lobby 分层资源：10 个 ZIP。
- 早期 curated 平面背景：10 张 JPG，仍作为示例工程别名保留。
- 通用界面与对话素材：19 个图像文件。
- UI 参考组件：5 个 Vue 文件，并保留上游 AGPL-3.0 许可证。
- 旁支活动 UI：1 个 ZIP / 103 个 PNG，不计入当前 UI 成果。
- 全部原始 ZIP 均通过完整性检查。
