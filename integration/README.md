# IAM 1.3.2 真实门户条件写验收

`iam-open-roles.real.mjs` 通过实际 Portal 和 Admin 生产构建验证受委托角色业务。它不替换 qiankun，也不 mock IAM API；六类界面写入为角色改名、规则保存/清除、部门挂载/撤销、角色删除，另验证真实 428 无条件拒绝、412 并发冲突不重放和部门成员继承。

这是独立的隔离环境写验收，不在默认 `check` 中运行。它禁止共享域名及本机既有服务端口，不用于升级、重启、注册或修改现有联调环境。

## 拓扑

同一回环地址的静态入口服务当前两个仓库的 `dist`：

- `/app/index.html` 与 `/app/assets/`：Portal 生产构建。
- `/app/iam/index.html` 与 `/app/iam/assets/`：Admin 生产构建。
- `/app/iam/roles` 等深链：回退 Portal 的 `index.html`，由真实 qiankun 挂载 Admin。
- `/iam/`：原样代理到本轮独立 IAM 1.3.2 后端，保留 Cookie、CSRF（跨站请求保护标记）和条件请求头。

入口的域名必须是 `127.0.0.1`、`localhost` 或 `::1`，使用明确的新端口。脚本不会自行启动或停止静态服务及后端。

## 最小种子

所有对象仅存在于本輪独立数据库：

- 一个有效平台管理员，具有 `ROLE_iam_admin`，密码已完成初始化，不需要首次改密或人机验证。
- IAM 可信应用可见，`routePrefix=/app/iam`，`entry=/app/iam/index.html`，导航含角色、组织和用户管理。
- 一个有效业务应用，权限清单中至少有一个 PAGE（页面）编码和一个 API（接口）编码。
- 三个有效部门：委托组织根、根的直属子部门、根子树以外部门；部门名称互不相同。
- 一个 ACTIVE 受委托角色，固定业务应用和组织根，无初始授权规则，未挂到验收子部门，未直接分配给验收成员。
- 一个有效普通成员，直属部门为验收子部门，用于验证挂载后的部门继承；用户名在隔离库中唯一。

脚本只修改、挂载和删除传入的受委托角色，不创建用户、应用或部门，不更改其他角色。并发反证通过该角色的一次正式管理 API 更新制造，失败不执行额外清理或自动重放。

## 输入与运行

通过标准输入传入一份 JSON；由调用方在内存中构造并写入子进程标准输入。不要把密码、Cookie 或其他认证材料写入文件、命令行参数、环境变量回显或终端记录。

```json
{
  "fixture": "isolated-iam-132",
  "baseUrl": "http://127.0.0.1:19432",
  "administrator": { "username": "fixture-admin", "password": "<进程内注入>" },
  "role": {
    "id": 20,
    "code": "fixture-delegated",
    "openRoleId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "applicationId": 7,
    "rootDepartmentId": 10
  },
  "departments": {
    "root": { "id": 10, "name": "验收根部门" },
    "child": { "id": 11, "name": "验收子部门" },
    "outside": { "id": 12, "name": "验收外部部门" }
  },
  "application": { "pagePermission": "fixture.home", "apiPermission": "fixture.read" },
  "member": { "subjectId": "fixture-member", "username": "fixture-member" }
}
```

子进程命令为 `node integration/iam-open-roles.real.mjs`。加 `--validate-only` 只校验输入，不启动浏览器或请求服务。登录使用正式 `/iam/web/auth/csrf`、`/iam/web/auth/login` 接口，Cookie 保留在该次浏览器上下文内存中；登录页面本身不属于此脚本的覆盖范围。

## 证据

输出在 gitignored 的 `test-results/real-iam-132/<本次时间>/`：1280px 和 390px 门户截图，以及 `evidence.json`。截图遮蔽门户身份区；请求证据只保留 method、path、status、条件头，不保留请求/响应正文、完整 headers、查询参数、Cookie、CSRF、密码或令牌。不启用 trace、录像或会话存档。

只有实际运行完成并得到 `PASSED` 才能报告真实业务链通过；语法或输入校验不代表已执行浏览器验收，也不代表现有联调域名已部署本轮构建。
