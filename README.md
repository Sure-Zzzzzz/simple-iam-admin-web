# simple-iam-admin-web

IAM 管理端微前端，承载用户、组织、角色、权限、可信应用和站内信等 IAM 管理页面，以 `/app/iam/` 为基路径由门户宿主挂载。

组织管理支持部门挂载角色：成员的有效角色 = 个人直接角色 ∪ 所属直属部门挂载的角色，实时并集、不做一次性复制，转部门后立即生效；角色继承只认直属部门，不沿部门树向上级联。撤销个人 `iam_admin`、撤销部门挂载的 `iam_admin`、转部门、停用或删除管理员账号等入口均有最后管理员保护：全系统只剩一个可用管理员时，会使其失去 `iam_admin` 的操作被拒绝。

用户管理支持按状态、部门（含未挂部门）、关键字筛选；锁定中的账号可当场解锁；删除用户前有确认提示（会话、角色、协作组与应用授权一并清除且不可恢复，需要留案底应改用禁用）。工作台对禁用账号、未挂部门用户提供告警卡片，点击直达对应筛选视图。

拥有 `iam_admin` 角色的用户是平台管理员：具备全部应用的准入与权限清单申报范围的全量权限（解析时特权合并，不体现为单条授权记录），撤销其单应用授权不会生效，降权应摘除该角色。

## 兼容性与发布

- IAM Server：`1.1.x`
- IAM Contract：`1.1.x`
- `1.1.0` 对齐 IAM Server `1.1.0` 的递归菜单树、页面权限裁剪、沉浸展示、应用默认入口与 Portal 登录首页。
- 后续 Admin patch 可独立发布，但必须在 release notes 中声明兼容的 Server、Contract 与 Portal 范围。

权威 API 契约由 IAM Server 仓库的 `sdk/auth/iam/server/contract/` 维护；不得调用未声明接口。

## 本地开发

前置条件：Node.js 22+、pnpm 9.15.4，以及运行在 `http://localhost:8180` 的 IAM Server。

```bash
npx pnpm@9.15.4 install
npx pnpm@9.15.4 run dev
```

开发服务器固定使用 `5175`，基路径为 `/app/iam/`。`/iam` 与 `/oauth2` 代理至 IAM Server；Portal（`5176`）通过该入口挂载 Admin。

会话失效时跳转登录页的地址统一拼接 `VITE_LOGIN_BASE_URL` 前缀（默认空，即登录应用部署在域名根路径；部署形态不同时配置该变量），并携带当前位置作为回跳参数。

## 验证

```bash
npx pnpm@9.15.4 run type-check
npx pnpm@9.15.4 run lint
npx pnpm@9.15.4 run test:run
npx pnpm@9.15.4 run build
```
