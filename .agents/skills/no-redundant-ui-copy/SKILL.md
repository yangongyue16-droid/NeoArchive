---
name: no-redundant-ui-copy
description: Removes and prevents redundant UI copy — gray subtitles under headings, field helper text, footer disclaimers, sentence-form status values, empty-state restatements. Use whenever writing, editing, or reviewing any frontend component, page, form, dialog, card, or empty state, even if the task is unrelated to copy; existing redundant copy in touched files must be deleted on sight.
---

# 零冗余 UI 文案

用户已经看见标题、控件和数据。任何复述它们的文字都删。

## 唯一判据

删掉这句话，用户还能完成操作吗？能 → 删，且不准新增。

## 逢见必清

编辑任何 UI 文件时，先检索再动手；命中项一律删除，不问、不保留、不搬进 placeholder / tooltip / title 属性。

```
rg -n "CardDescription|DialogDescription|SheetDescription|DrawerDescription|AlertDialogDescription|FormDescription|FieldDescription|EmptyDescription|helperText|description=" <file>
```

对同一文件里紧跟标题的 `text-muted-foreground` / `text-sm text-*-500` 段落逐条套用判据。

## 删

| 位置          | 例子                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 标题下导语    | 「共 515532 条检测结果，按时间倒序。筛选条件会写进地址栏，可以直接分享。」「账户、安全与账单。」「用 `ow_` 前缀调用…」 |
| 系统行为解释  | 「按时间倒序」「筛选会同步到 URL」「修改后实时保存」                                                                   |
| 字段帮助句    | 「请输入用户名」「不选则开放全部」「留空则跟账号额度走」                                                               |
| 页脚免责/复述 | 「列表只保存前缀」「完整密钥无法再次查看」（后者若为一次性警告，只在生成时弹一次）                                     |
| 句子式状态    | 「全部公开模型」→「全部」；「跟随账号额度」→「不受限」；「尚未使用」→「未使用」                                        |
| 空状态第二句  | 标题 + 主按钮即可，去掉「点击下方按钮新建」                                                                            |

## 留

- 控件自身的 Label、格式示范型 placeholder（`name@example.com`）、按钮字
- 当前值（邮箱、余额、过期时间）
- 一次性不可逆警告（密钥只显示一次、注销不可恢复、法律保留）
- 控件无法自行约束的输入规则（密码最少 12 位）
- 错误与进行中状态

## 组件层

```tsx
// 前
<CardHeader>
  <CardTitle>历史记录</CardTitle>
  <CardDescription>共 {total} 条，按时间倒序。筛选条件会写进地址栏。</CardDescription>
</CardHeader>

// 后
<CardHeader>
  <CardTitle>历史记录</CardTitle>
</CardHeader>
```

Radix `Dialog` / `AlertDialog` / `Sheet` 删掉 `*Description` 后会在控制台警告 `aria-describedby`。在
`*Content` 上加 `aria-describedby={undefined}`，不要为了消警告把描述留下或藏成 `sr-only`。

`FormDescription` 删掉后，若该字段确有硬约束（白名单第 4 条），改为写在 `FormMessage` 校验错误里，
而不是常驻在字段下方。

## 交付前

- 标题区无灰字
- 表单无 `*Description` / `helperText`
- 状态值是词，不是句
- 空状态只有标题 + 主按钮
- 本次触碰的文件里，存量冗余已一并删除
