# simple-iam-admin-web 1.2.3 CHANGELOG

- 用户详情抽屉新增内嵌操作反馈（EntityDrawer 可选 `notice`/`noticeType`）：抽屉打开期间页面顶横幅会被遮罩盖住，保存基础信息 / 重置密码 / 分配角色 / 部门与授权等抽屉内操作的成败提示改为渲染在抽屉头部正下方；页面顶横幅仅在抽屉关闭时出现，同一反馈不双处显示。
- 重置密码成功提示（"密码已重置"）随此修复在抽屉内即时可见；错误提示优先于成功提示展示。
- 既有六个视图零破坏：通知区为纯可选 props，未传notice行为与 1.2.2 完全一致。
- 兼容范围：IAM Server 1.3.2+（对 1.3.6 的 `mustChangePasswordReason`/`passwordExpiresInDays` 字段消费为后续版本，本版仅固化反馈位置修复）；IAM Theme Contract 1.0.4；无 API 契约变化。
