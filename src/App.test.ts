import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { fetchCurrentUser } from './api/iamAuth';
import { applyAdminBridge, adminState, createRuntimeRequest } from './adminState';

vi.mock('./api/iamAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/iamAuth')>();
  return {
    ...actual,
    fetchCurrentUser: vi.fn().mockResolvedValue({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] })
  };
});

function mountApp() {
  const router = createRouter({
    history: createWebHistory('/app/iam/'),
    routes: [
      { path: '/', component: { template: '<div>dashboard</div>' } },
      { path: '/organizations', component: { template: '<div>organizations</div>' } },
      { path: '/users', redirect: '/organizations' },
      { path: '/departments', redirect: '/organizations' },
      { path: '/user-groups', component: { template: '<div>user groups</div>' } },
      { path: '/roles', component: { template: '<div>roles</div>' } },
      { path: '/permissions', component: { template: '<div>permissions</div>' } },
      { path: '/trusted-applications', component: { template: '<div>trusted-applications</div>' } },
      { path: '/messages', component: { template: '<div>messages</div>' } }
    ]
  });
  return mount(App, {
    global: {
      plugins: [router]
    }
  });
}

describe('Admin App', () => {
  beforeEach(() => {
    applyAdminBridge();
    adminState.currentUser = null;
    adminState.authLoading = false;
    adminState.authError = '';
  });

  it('作为 IAM 子应用不重复展示 Portal 已承担的模块导航', async () => {
    applyAdminBridge({
      currentUser: { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] },
      request: createRuntimeRequest(async <T>() => undefined as T),
      refreshCurrentUser: async () => ({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }),
      refreshUnreadCount: async () => undefined,
      onUnauthorized: () => undefined
    });

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain('dashboard');
    expect(wrapper.find('.iam-module-nav').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('退出登录');
    expect(wrapper.find('.logout-button').exists()).toBe(false);
    expect(wrapper.find('.message-badge').exists()).toBe(false);
  });

  it('独立调试时应保留模块导航', async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('.iam-module-nav').exists()).toBe(true);
    expect(wrapper.text()).toContain('组织与成员');
    expect(wrapper.text()).toContain('协作组管理');
    expect(wrapper.text()).toContain('站内信');
  });

  it('非管理员进入 IAM 子应用应展示无权限状态', async () => {
    applyAdminBridge({
      currentUser: { userId: 2, username: 'user', displayName: '普通用户', admin: false, authorities: ['ROLE_iam_user'] },
      request: createRuntimeRequest(async <T>() => undefined as T),
      refreshCurrentUser: async () => ({ userId: 2, username: 'user', displayName: '普通用户', admin: false, authorities: ['ROLE_iam_user'] }),
      refreshUnreadCount: async () => undefined,
      onUnauthorized: () => undefined
    });

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain('当前账号没有统一身份与访问管理权限');
    expect(wrapper.text()).not.toContain('dashboard');
  });

  it('持页面权限码的委派用户：导航只留有权模块，页面正常渲染', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValueOnce({
      userId: 3, username: 'useradmin', displayName: '用户管理员', admin: false,
      authorities: ['ROLE_iam_user', 'iam:user:page', 'iam:user:api']
    });

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain('用户管理');
    expect(wrapper.text()).not.toContain('角色管理');
    expect(wrapper.text()).not.toContain('仪表盘');
    expect(wrapper.text()).toContain('dashboard');
  });
});
