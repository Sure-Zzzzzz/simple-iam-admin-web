import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, type PropType } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView.vue';
import * as iamAuth from '../api/iamAuth';
import { adminState } from '../adminState';
import type { AdminDashboard, AdminDashboardRecentLogin, AdminSession, PageResponse } from '../api/iamAuth';

const dashboardFixture: AdminDashboard = {
  counts: { user: 12, department: 4, userGroup: 2, role: 6, permission: 15, trustedApplication: 3 },
  stats: { activeSessions: 5, todayLoggedInUsers: 7, lockedUsers: 2, disabledUsers: 0, usersWithoutDepartment: 0 }
};

const recentLoginFixture: AdminDashboardRecentLogin = {
  userId: 1,
  username: 'alice',
  displayName: '张三',
  departmentName: '研发部',
  lastLoginAt: '2026-08-31T08:00:00Z'
};

function recentPage(content: AdminDashboardRecentLogin[], totalElements = content.length): PageResponse<AdminDashboardRecentLogin> {
  return {
    content,
    totalElements,
    totalPages: Math.max(Math.ceil(totalElements / 10), 1),
    page: 1,
    size: 10,
    numberOfElements: content.length,
    first: true,
    last: totalElements <= 10,
    empty: content.length === 0
  };
}

const sessionFixture: AdminSession = {
  sessionId: 'sess-1',
  userId: 2,
  username: 'bob',
  clientId: 'console',
  remoteIp: '10.0.0.9',
  userAgent: 'Mozilla/5.0',
  authTime: '2026-09-01T07:00:00Z',
  lastActiveAt: '2026-09-01T08:00:00Z',
  expiresAt: '2026-09-01T09:00:00Z'
};

function sessionPage(content: AdminSession[]): PageResponse<AdminSession> {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    page: 1,
    size: 10,
    numberOfElements: content.length,
    first: true,
    last: true,
    empty: content.length === 0
  };
}

const routerLinkStub = defineComponent({
  props: {
    to: {
      type: [String, Object] as PropType<string | { path: string; query?: Record<string, string> }>,
      required: true
    }
  },
  setup(props) {
    const resolveHref = () => {
      if (typeof props.to === 'string') {
        return props.to;
      }
      const query = Object.entries(props.to.query ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      return query ? `${props.to.path}?${query}` : props.to.path;
    };
    return { resolveHref };
  },
  template: '<a :href="resolveHref()"><slot /></a>'
});

function mountDashboard() {
  return mount(DashboardView, {
    global: {
      stubs: { RouterLink: routerLinkStub }
    }
  });
}

describe('DashboardView', () => {
  afterEach(() => {
    adminState.currentUser = null;
    adminState.authError = '';
    vi.restoreAllMocks();
  });

  it('应渲染运行状态与数量总览九张同构卡片、小节标题、最近登录与管理员身份', async () => {
    vi.spyOn(iamAuth, 'fetchAdminDashboard').mockResolvedValue(dashboardFixture);
    vi.spyOn(iamAuth, 'fetchDashboardRecentLogins').mockResolvedValue(recentPage([recentLoginFixture]));
    adminState.currentUser = {
      userId: 9,
      username: 'admin',
      displayName: '管理员',
      admin: true,
      authorities: ['ROLE_iam_admin', 'iam:user:api', 'iam:role:api']
    };

    const wrapper = await mountDashboard();
    await flushPromises();

    expect(wrapper.findAll('.dashboard-runtime .dashboard-card')).toHaveLength(5);
    expect(wrapper.findAll('.dashboard-metrics .dashboard-card')).toHaveLength(5);
    expect(wrapper.text()).toContain('运行状态');
    expect(wrapper.text()).toContain('数量总览');

    expect(wrapper.text()).toContain('在线会话');
    expect(wrapper.text()).toContain('今日登录用户');
    expect(wrapper.text()).toContain('锁定账号');
    expect(wrapper.text()).toContain('禁用账号');
    expect(wrapper.text()).toContain('未挂部门');
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('4');

    expect(wrapper.text()).toContain('张三');
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.text()).toContain('研发部');

    expect(wrapper.text()).toContain('管理员');
    expect(wrapper.text()).toContain('iam_admin');
    expect(wrapper.text()).toContain('2 项');

    expect(wrapper.get('.dashboard-metrics a[href="/organizations"]').text()).toContain('部门');
    expect(wrapper.text()).toContain('组织成员与账号全量');
    expect(wrapper.find('.dashboard-actions').exists()).toBe(false);
  });

  it('运行状态卡下钻：今日登录与锁定卡带筛选参数跳转用户管理', async () => {
    vi.spyOn(iamAuth, 'fetchAdminDashboard').mockResolvedValue(dashboardFixture);
    vi.spyOn(iamAuth, 'fetchDashboardRecentLogins').mockResolvedValue(recentPage([recentLoginFixture]));

    const wrapper = await mountDashboard();
    await flushPromises();

    expect(wrapper.find('a[href="/users?lastLogin=today"]').exists()).toBe(true);
    expect(wrapper.get('a[href="/users?locked=1"]').text()).toContain('存在锁定中的账号');
    expect(wrapper.find('a[href="/users?status=0"]').exists()).toBe(true);
    expect(wrapper.get('a[href="/users?noDepartment=1"]').text()).toContain('全部账号已挂部门');
  });

  it('存在锁定账号时锁定卡展示警示样式', async () => {
    vi.spyOn(iamAuth, 'fetchAdminDashboard').mockResolvedValue(dashboardFixture);
    vi.spyOn(iamAuth, 'fetchDashboardRecentLogins').mockResolvedValue(recentPage([recentLoginFixture]));

    const wrapper = await mountDashboard();
    await flushPromises();

    expect(wrapper.get('.dashboard-runtime .dashboard-card.warning').attributes('href')).toBe('/users?locked=1');
  });

  it('无锁定账号不展示警示，最近登录为空时给出空态文案', async () => {
    vi.spyOn(iamAuth, 'fetchAdminDashboard').mockResolvedValue({
      ...dashboardFixture,
      stats: { activeSessions: 0, todayLoggedInUsers: 0, lockedUsers: 0, disabledUsers: 0, usersWithoutDepartment: 0 }
    });
    vi.spyOn(iamAuth, 'fetchDashboardRecentLogins').mockResolvedValue(recentPage([]));

    const wrapper = await mountDashboard();
    await flushPromises();

    expect(wrapper.find('.dashboard-card.warning').exists()).toBe(false);
    expect(wrapper.text()).toContain('暂无锁定账号');
    expect(wrapper.text()).toContain('暂无禁用账号');
    expect(wrapper.text()).toContain('全部账号已挂部门');
    expect(wrapper.text()).toContain('还没有用户登录过');
  });

  it('治理缺口非零时禁用卡与未挂部门卡警示并可下钻筛选', async () => {
    vi.spyOn(iamAuth, 'fetchAdminDashboard').mockResolvedValue({
      ...dashboardFixture,
      stats: { activeSessions: 5, todayLoggedInUsers: 7, lockedUsers: 0, disabledUsers: 3, usersWithoutDepartment: 2 }
    });
    vi.spyOn(iamAuth, 'fetchDashboardRecentLogins').mockResolvedValue(recentPage([recentLoginFixture]));

    const wrapper = await mountDashboard();
    await flushPromises();

    expect(wrapper.get('a[href="/users?status=0"]').text()).toContain('存在被禁用的账号');
    expect(wrapper.get('a[href="/users?noDepartment=1"]').text()).toContain('有账号尚未归属部门');
    expect(wrapper.text()).toContain('2');
  });

  it('最近登录分页：多页时展示翻页并按页请求', async () => {
    const logins = Array.from({ length: 5 }, (_, index) => ({ ...recentLoginFixture, userId: index + 1 }));
    const spy = vi.spyOn(iamAuth, 'fetchDashboardRecentLogins').mockResolvedValue(recentPage(logins, 12));
    vi.spyOn(iamAuth, 'fetchAdminDashboard').mockResolvedValue(dashboardFixture);

    const wrapper = await mountDashboard();
    await flushPromises();

    const pagination = wrapper.get('.dashboard-panel .pagination');
    expect(pagination.find('button.active').text()).toBe('1');
    expect(pagination.text()).toContain('下一页');

    const nextButton = pagination.findAll('button').find(button => button.text() === '下一页');
    expect(nextButton).toBeTruthy();
    await nextButton!.trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenLastCalledWith({ page: 2, size: 10 });
  });

  it('在线会话卡打开抽屉展示会话列表并可强制下线', async () => {
    vi.spyOn(iamAuth, 'fetchAdminDashboard').mockResolvedValue(dashboardFixture);
    vi.spyOn(iamAuth, 'fetchDashboardRecentLogins').mockResolvedValue(recentPage([recentLoginFixture]));
    const sessionsSpy = vi.spyOn(iamAuth, 'fetchActiveSessions')
      .mockResolvedValue(sessionPage([sessionFixture, { ...sessionFixture, sessionId: 'sess-2', username: 'carol' }]));
    const revokeSpy = vi.spyOn(iamAuth, 'revokeUserSessions').mockResolvedValue({ revoked: 2 });
    const dashboardSpy = vi.spyOn(iamAuth, 'fetchAdminDashboard');

    const wrapper = await mountDashboard();
    await flushPromises();

    await wrapper.get('.dashboard-runtime button.dashboard-card').trigger('click');
    await flushPromises();

    expect(wrapper.get('.entity-drawer').text()).toContain('在线会话');
    expect(wrapper.findAll('.entity-drawer tbody tr')).toHaveLength(2);
    expect(wrapper.get('.entity-drawer').text()).toContain('bob');
    expect(wrapper.get('.entity-drawer').text()).toContain('10.0.0.9');

    await wrapper.get('.entity-drawer .table-action').trigger('click');
    await flushPromises();

    const confirmDialog = wrapper.get('.confirm-dialog');
    expect(confirmDialog.text()).toContain('bob');
    await confirmDialog.get('.button-danger').trigger('click');
    await flushPromises();

    expect(revokeSpy).toHaveBeenCalledWith(2);
    expect(sessionsSpy).toHaveBeenCalledTimes(2);
    expect(dashboardSpy).toHaveBeenCalledTimes(2);
  });

  it('加载失败时展示错误与重试入口', async () => {
    vi.spyOn(iamAuth, 'fetchAdminDashboard').mockRejectedValue(new Error('加载失败'));
    vi.spyOn(iamAuth, 'fetchDashboardRecentLogins').mockResolvedValue(recentPage([recentLoginFixture]));

    const wrapper = await mountDashboard();
    await flushPromises();

    expect(wrapper.text()).toContain('加载失败');
    expect(wrapper.get('.dashboard-error').text()).toContain('重试读取概览');
  });
});
