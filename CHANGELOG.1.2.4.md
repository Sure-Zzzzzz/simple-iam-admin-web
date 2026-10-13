# simple-iam-admin-web 1.2.4 CHANGELOG

- 角色详情抽屉「继承来源部门」面板接入客户端分页：挂载部门超过 8 条时分页展示（契约 `Pagination` 组件，隐藏页容量选择），标题计数保持全量；切换角色或关闭抽屉自动归位第一页。此前为全量平铺，挂载部门多时抽屉无限拉长。
- 管理端点本就一次性返回全部挂载部门，本版为纯展示层改动，无 API 契约变化。
- 兼容范围：IAM Server 1.3.7（兼容 1.3.x）；IAM Theme Contract 1.0.4；Frontend Contract 1.0.1。
