import type { Router } from 'vue-router';
import type { AuthUser } from './api/iamAuth';
import { adminState, ensureAdminUser } from './adminState';

declare module 'vue-router' {
  interface RouteMeta {
    permission?: string;
  }
}

export interface AdminNavItem {
  to: string;
  label: string;
  permission?: string;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { to: '/', label: '仪表盘' },
  { to: '/users', label: '用户管理', permission: 'iam:user:page' },
  { to: '/organizations', label: '组织与成员', permission: 'iam:department:page' },
  { to: '/user-groups', label: '协作组管理', permission: 'iam:user-group:page' },
  { to: '/roles', label: '角色管理', permission: 'iam:role:page' },
  { to: '/trusted-applications', label: '可信应用', permission: 'iam:trusted-application:page' },
  { to: '/messages', label: '站内信', permission: 'iam:message:page' }
];

export const ROUTE_PERMISSIONS: Readonly<Record<string, string>> = Object.fromEntries(
  ADMIN_NAV_ITEMS
    .filter(item => item.permission)
    .map(item => [item.to, item.permission as string])
);

export function hasPagePermission(user: AuthUser | null, permission: string): boolean {
  if (!user) {
    return false;
  }
  return user.admin || user.authorities.includes(permission);
}

export function canEnterAdminConsole(user: AuthUser | null): boolean {
  if (!user) {
    return false;
  }
  return user.admin || ADMIN_NAV_ITEMS.some(item => item.permission && user.authorities.includes(item.permission));
}

// 非 admin 过滤掉无 permission 的导航项（仪表盘）：其数据要 iam:dashboard:api，
// 部分权限用户直敲首页会被守卫重定向，导航也不该露出该入口
export function visibleNavItems(user: AuthUser | null): AdminNavItem[] {
  if (!user) {
    return [];
  }
  if (user.admin) {
    return [...ADMIN_NAV_ITEMS];
  }
  return ADMIN_NAV_ITEMS.filter(item => item.permission && user.authorities.includes(item.permission));
}

export function firstPermittedRoute(user: AuthUser | null): string {
  if (!user) {
    return '/403';
  }
  if (user.admin) {
    return '/';
  }
  const first = ADMIN_NAV_ITEMS.find(item => item.permission && user.authorities.includes(item.permission));
  return first ? first.to : '/403';
}

export function setupAdminRouterGuard(router: Router): void {
  router.beforeEach(async to => {
    await ensureAdminUser();
    const user = adminState.currentUser;
    if (!to.meta.permission) {
      if (to.path === '/' && user && !user.admin) {
        const target = firstPermittedRoute(user);
        return target === '/403' ? true : target;
      }
      return true;
    }
    if (!user) {
      // 未登录：fetchCurrentUser 已 401→跳登录；authError 态 App 整体不渲染 RouterView
      return true;
    }
    return hasPagePermission(user, to.meta.permission) ? true : { path: '/403', query: { from: to.fullPath } };
  });
}
