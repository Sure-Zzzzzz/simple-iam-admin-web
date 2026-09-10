import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from './api/iamAuth';
import { adminState, applyAdminBridge } from './adminState';
import {
  ADMIN_NAV_ITEMS,
  canEnterAdminConsole,
  firstPermittedRoute,
  hasPagePermission,
  setupAdminRouterGuard,
  visibleNavItems
} from './adminPermissions';

function userWith(authorities: string[], admin = false): AuthUser {
  return { userId: 2, username: 'delegate', displayName: '委派用户', admin, authorities };
}

const USER_ADMIN = userWith(['ROLE_iam_user', 'iam:user:page', 'iam:user:api']);
const PLAIN_USER = userWith(['ROLE_iam_user']);
const API_ONLY = userWith(['ROLE_iam_user', 'iam:user:api']);
const ADMIN = userWith(['ROLE_iam_admin'], true);

function createGuardedRouter(): Router {
  const stub = { template: '<div />' };
  const router = createRouter({
    history: createMemoryHistory('/app/iam/'),
    routes: [
      { path: '/', component: stub },
      { path: '/users', component: stub, meta: { permission: 'iam:user:page' } },
      { path: '/roles', component: stub, meta: { permission: 'iam:role:page' } },
      { path: '/403', name: 'forbidden', component: stub }
    ]
  });
  setupAdminRouterGuard(router);
  return router;
}

describe('adminPermissions 纯函数', () => {
  it('canEnterAdminConsole 四象限：admin/页面码/纯 api 码/无码', () => {
    expect(canEnterAdminConsole(ADMIN)).toBe(true);
    expect(canEnterAdminConsole(USER_ADMIN)).toBe(true);
    expect(canEnterAdminConsole(API_ONLY)).toBe(false);
    expect(canEnterAdminConsole(PLAIN_USER)).toBe(false);
    expect(canEnterAdminConsole(null)).toBe(false);
  });

  it('visibleNavItems：admin 全量、页面码用户只留有权项、无码为空', () => {
    expect(visibleNavItems(ADMIN)).toHaveLength(ADMIN_NAV_ITEMS.length);
    expect(visibleNavItems(USER_ADMIN).map(item => item.label)).toEqual(['用户管理']);
    expect(visibleNavItems(API_ONLY)).toEqual([]);
    expect(visibleNavItems(null)).toEqual([]);
  });

  it('firstPermittedRoute：admin 回首页、页面码用户回首个有权页、无码回 403', () => {
    expect(firstPermittedRoute(ADMIN)).toBe('/');
    expect(firstPermittedRoute(USER_ADMIN)).toBe('/users');
    expect(firstPermittedRoute(PLAIN_USER)).toBe('/403');
  });

  it('hasPagePermission：admin 直通、按 authorities 判定、null 拒绝', () => {
    expect(hasPagePermission(ADMIN, 'iam:message:page')).toBe(true);
    expect(hasPagePermission(USER_ADMIN, 'iam:user:page')).toBe(true);
    expect(hasPagePermission(USER_ADMIN, 'iam:role:page')).toBe(false);
    expect(hasPagePermission(null, 'iam:user:page')).toBe(false);
  });
});

describe('adminPermissions 路由守卫', () => {
  beforeEach(() => {
    applyAdminBridge();
    adminState.currentUser = null;
    adminState.authLoading = false;
    adminState.authError = '';
  });

  it('页面码用户：有权页放行、无权页落 403、首页重定向到首个有权页', async () => {
    applyAdminBridge({ getCurrentUser: () => USER_ADMIN });
    const router = createGuardedRouter();

    await router.push('/users');
    expect(router.currentRoute.value.path).toBe('/users');

    await router.push('/roles');
    expect(router.currentRoute.value.path).toBe('/403');
    expect(router.currentRoute.value.query.from).toBe('/roles');

    await router.push('/');
    expect(router.currentRoute.value.path).toBe('/users');
  });

  it('admin：任意页放行', async () => {
    applyAdminBridge({ getCurrentUser: () => ADMIN });
    const router = createGuardedRouter();

    await router.push('/roles');
    expect(router.currentRoute.value.path).toBe('/roles');
    await router.push('/');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('无页面码用户：首页放行，交 App 层门禁整体不渲染', async () => {
    applyAdminBridge({ getCurrentUser: () => PLAIN_USER });
    const router = createGuardedRouter();

    await router.push('/');
    expect(router.currentRoute.value.path).toBe('/');
  });
});
