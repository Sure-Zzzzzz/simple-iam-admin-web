# simple-iam-admin-web 1.2.2 CHANGELOG

- 角色管理列表接入 IAM Theme Contract `DataTable` 契约组件（`1.0.4` 新增）：列声明替代手写表头/表体模板，操作列与类型徽章走 `#cell-{key}` 作用域插槽，空态由组件占位行统一渲染（空页钉子用例固化 `colspan` 与文案）。
- IAM Theme Contract 依赖 `1.0.3` → `1.0.4`（精确坐标）。同版修复随包生效：`FormSelect` 弹层方向改为视口与最近裁剪祖先双通道判定，角色页每页条数下拉不再被数据卡片容器（`overflow: hidden`）裁剪。
- 表格行交互不变：主列双行按钮、选中行高亮（`selectedKey`）、hover、删除按钮间距（`.table-action + .table-action` 选择器放宽，不再依赖 `td.table-actions`）。
- 兼容范围：IAM Server `1.3.2`、IAM Contract `1.3.0`、Unified Application Portal Web `1.2.1`、Frontend Contract `1.0.1`，与 `1.2.1` 一致；本次为前端组件化与依赖升级，无 API 契约变化。
