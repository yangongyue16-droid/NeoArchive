# NeoArchive agent guidance

## UI 文案

编辑、重构或审查 `src/` 中的界面、表单、对话框和空状态前，必须读取
[零冗余 UI 文案 skill](.agents/skills/no-redundant-ui-copy/SKILL.md)。

本次触碰的 UI 文件中，存量冗余文案一并剔除；不得转移到 placeholder、tooltip 或隐藏文本。
保留控件标签、当前值、输入硬约束、错误与进行中状态，以及不可逆操作的必要警告。

## 验证

沿用项目的 Vite+ 检查、测试与构建命令。保留任务开始前已有的未提交、未跟踪文件；
报告已有检查阻塞，不通过覆盖这些文件来取得检查通过。
