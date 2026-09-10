import { reactive } from 'vue';
import type { RuntimeContext, RuntimeRequest, Subscription } from '@sure-zzzzzz/simple-frontend-contract';
import { fetchCurrentUser, setAdminRequestBridge, UnauthorizedError, type AuthUser } from './api/iamAuth';
import type { ThemeSnapshot } from '@sure-zzzzzz/simple-iam-theme-contract';
import { canEnterAdminConsole } from './adminPermissions';

export interface AdminBridge extends RuntimeContext {
  getCurrentUser?: () => AuthUser | null;
  currentUser?: AuthUser | null;
  refreshCurrentUser?: () => Promise<AuthUser | null>;
  refreshUnreadCount?: () => Promise<void>;
  onUnauthorized?: () => void;
  theme?: Subscription<ThemeSnapshot>;
}

export const adminState = reactive({
  currentUser: null as AuthUser | null,
  authLoading: true,
  authError: '',
  bridge: null as AdminBridge | null
});

export function createRuntimeRequest(request: <T>(url: string, init?: RequestInit) => Promise<T>): NonNullable<RuntimeContext['request']> {
  return {
    request<TResponse>({ method, path, body, signal }: Parameters<RuntimeRequest['request']>[0]) {
      return request<TResponse>(path, {
        ...(method === 'GET' ? {} : { method }),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(signal ? { signal } : {})
      });
    }
  };
}

export function applyAdminBridge(bridge?: Partial<AdminBridge>) {
  adminState.bridge = bridge?.request ? bridge : null;
  setAdminRequestBridge(adminState.bridge?.request ? createAdminRequestBridge(adminState.bridge.request) : null, adminState.bridge?.onUnauthorized || null);
  adminState.currentUser = bridge?.getCurrentUser?.() || bridge?.currentUser || null;
  adminState.authError = adminState.currentUser && !canEnterAdminConsole(adminState.currentUser) ? '当前账号没有统一身份与访问管理权限' : '';
  adminState.authLoading = false;
}

function createAdminRequestBridge(runtimeRequest: NonNullable<RuntimeContext['request']>) {
  return <T>(url: string, init: RequestInit = {}) => {
    const method = init.method || 'GET';
    return runtimeRequest.request<T>({
      method,
      path: url,
      ...(init.body === undefined ? {} : { body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body }),
      ...(init.signal ? { signal: init.signal } : {})
    });
  };
}

// 进行中的 /me 拉取去重：路由守卫与 App.onMounted 首次并发调用时共用同一请求
let ensureAdminUserInflight: Promise<AuthUser | null> | null = null;

export async function ensureAdminUser() {
  if (adminState.currentUser) {
    adminState.authError = canEnterAdminConsole(adminState.currentUser) ? '' : '当前账号没有统一身份与访问管理权限';
    adminState.authLoading = false;
    return adminState.currentUser;
  }
  if (ensureAdminUserInflight) {
    return ensureAdminUserInflight;
  }
  adminState.authLoading = true;
  adminState.authError = '';
  const inflight = (async () => {
    try {
      const user = adminState.bridge?.refreshCurrentUser ? await adminState.bridge.refreshCurrentUser() : await fetchCurrentUser();
      adminState.currentUser = user;
      adminState.authError = user && !canEnterAdminConsole(user) ? '当前账号没有统一身份与访问管理权限' : '';
      return user;
    } catch (error) {
      if (!(error instanceof UnauthorizedError || (error instanceof Error && error.message === '未登录'))) {
        adminState.authError = error instanceof Error ? error.message : '读取当前用户失败';
      }
      return null;
    } finally {
      adminState.authLoading = false;
      ensureAdminUserInflight = null;
    }
  })();
  ensureAdminUserInflight = inflight;
  return inflight;
}
