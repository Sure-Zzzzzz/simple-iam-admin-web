import { createApp, type App as VueApp } from 'vue';
import '@sure-zzzzzz/simple-iam-theme-contract/theme.css';
import { createRouter, createWebHistory, type Router } from 'vue-router';
import { qiankunWindow, renderWithQiankun } from 'vite-plugin-qiankun/dist/helper';
import App from './App.vue';
import type { RuntimeContext, Subscription } from '@sure-zzzzzz/simple-frontend-contract';
import { applyAdminBridge, type AdminBridge } from './adminState';
import { applyAdminTheme, createLightAdminThemeSnapshot } from './adminTheme';
import DashboardView from './view/DashboardView.vue';
import OrganizationsView from './view/OrganizationsView.vue';
import UsersView from './view/UsersView.vue';
import MessagesView from './view/MessagesView.vue';
import RolesView from './view/RolesView.vue';
import UserGroupsView from './view/UserGroupsView.vue';
import TrustedApplicationsView from './view/TrustedApplicationsView.vue';
import ForbiddenView from './view/ForbiddenView.vue';
import { ROUTE_PERMISSIONS, setupAdminRouterGuard } from './adminPermissions';
import './style.css';

let app: VueApp<Element> | null = null;
let router: Router | null = null;
let currentThemeSnapshot = createLightAdminThemeSnapshot();
let releaseThemeSubscription: () => void = () => undefined;

interface MountProps extends Partial<RuntimeContext>, Omit<AdminBridge, keyof RuntimeContext> {
  container?: Element | Document;
  routePrefix?: string;
  theme?: Subscription<typeof currentThemeSnapshot>;
}

function createAdminRouter(base: string) {
  return createRouter({
    history: createWebHistory(base),
    routes: [
      { path: '/', component: DashboardView },
      { path: '/organizations', component: OrganizationsView, meta: { permission: ROUTE_PERMISSIONS['/organizations'] } },
      { path: '/users', component: UsersView, meta: { permission: ROUTE_PERMISSIONS['/users'] } },
      { path: '/departments', redirect: '/organizations' },
      { path: '/user-groups', component: UserGroupsView, meta: { permission: ROUTE_PERMISSIONS['/user-groups'] } },
      { path: '/roles', component: RolesView, meta: { permission: ROUTE_PERMISSIONS['/roles'] } },
      { path: '/messages', component: MessagesView, meta: { permission: ROUTE_PERMISSIONS['/messages'] } },
      { path: '/trusted-applications', component: TrustedApplicationsView, meta: { permission: ROUTE_PERMISSIONS['/trusted-applications'] } },
      { path: '/403', name: 'forbidden', component: ForbiddenView }
    ]
  });
}

function applyHostTheme(root: HTMLElement, props: MountProps, subscribe = true) {
  if (props.theme) {
    currentThemeSnapshot = props.theme.current();
  }
  applyAdminTheme(root, currentThemeSnapshot);
  if (!subscribe || !props.theme) {
    return;
  }
  releaseThemeSubscription();
  releaseThemeSubscription = props.theme.subscribe(nextSnapshot => {
    currentThemeSnapshot = nextSnapshot;
    applyAdminTheme(root, currentThemeSnapshot);
  });
}

function render(props: MountProps = {}) {
  applyAdminBridge(props);
  router = createAdminRouter(qiankunWindow.__POWERED_BY_QIANKUN__
    ? `${props.routePrefix || '/app/iam'}/`
    : '/app/iam/');
  setupAdminRouterGuard(router);
  app = createApp(App);
  app.use(router);
  const container = props.container?.querySelector('#app') || document.querySelector('#app');
  if (container instanceof HTMLElement) {
    app.mount(container);
    const root = container.querySelector<HTMLElement>('.iam-admin-app');
    if (root) {
      applyHostTheme(root, props);
    }
  }
}

renderWithQiankun({
  bootstrap() {},
  mount(props) {
    render(props as MountProps);
  },
  unmount() {
    releaseThemeSubscription();
    releaseThemeSubscription = () => undefined;
    app?.unmount();
    app = null;
    router = null;
    currentThemeSnapshot = createLightAdminThemeSnapshot();
    applyAdminBridge();
  },
  update(props) {
    const mountProps = props as MountProps;
    applyAdminBridge(mountProps);
    const container = mountProps.container?.querySelector('#app') || document.querySelector('#app');
    const root = container instanceof HTMLElement ? container.querySelector<HTMLElement>('.iam-admin-app') : null;
    if (root) {
      applyHostTheme(root, mountProps, Boolean(mountProps.theme));
    }
  }
});

if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render();
}
