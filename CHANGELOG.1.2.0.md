# simple-iam-admin-web 1.2.0 Changelog

## 发布信息

- 版本：`1.2.0`
- 类型：Feature / 向后兼容能力扩展
- 基线版本：`1.1.1`

## 主要变更

- 用户相关操作统一使用公开稳定的 `subjectId`，不再在浏览器路由和请求中暴露数值主键。
- 新增用户 Excel 导入入口，按 IAM `1.3.0` 契约提交单个 xlsx 文件并展示逐行导入结果。
- 可信应用详情补齐资源校验客户端和所属人继承配置；用户、组织与协作组页面补齐相应的权限目录加载和错误态。
- 修复用户表邮箱列与新建用户输入框的可访问名称，保障窄屏横向滚动和自动化定位。

## 兼容性

| 依赖 | 兼容范围 |
| --- | --- |
| IAM Server | `1.3.0` 与 `1.3.x` 向后兼容 patch |
| IAM Contract | `1.3.0` 与 `1.3.x` 向后兼容 patch |
| Unified Application Portal Web | `1.2.0` |
| IAM Theme Contract | `1.0.3` |
| Frontend Contract | `1.0.0` |

## 验证范围

- `pnpm check` 通过：类型检查、ESLint、Vitest 覆盖率、生产构建和 Playwright 浏览器用例。
- 浏览器测试补齐可信应用、协作组和组织画像进入用户页后的全部并发请求 mock，不再依赖本地后端代理兜底。
