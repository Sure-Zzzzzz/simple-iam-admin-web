export interface AuthUser {
  userId: number | null;
  username: string;
  displayName: string | null;
  admin: boolean;
  authorities: string[];
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface PageQuery {
  page?: number;
  size?: number;
  keyword?: string;
}

export interface UserPageQuery extends PageQuery {
  status?: number;
  departmentId?: number;
  lastLoginAfter?: string;
  lockedUntilAfter?: string;
  noDepartment?: boolean;
}

export interface OrganizationWorkspaceQuery extends PageQuery {
  status?: number;
}

export interface StatusPageQuery extends PageQuery {
  status?: number;
}

export interface IamUser {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  departmentId: number | null;
  departmentName: string | null;
  identitySource: string | null;
  status: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const IDENTITY_SOURCE_LABELS: Record<string, string> = {
  'ldap-password': 'LDAP',
  'oidc': 'SSO'
};

export function identitySourceLabel(identitySource: string | null | undefined): string {
  if (!identitySource) {
    return '本地';
  }
  return IDENTITY_SOURCE_LABELS[identitySource] || identitySource;
}

export interface IamRole {
  id: number;
  code: string;
  name: string;
  description: string | null;
  builtIn: number;
}

export type RoleSource = 'direct' | 'department_inherited';

export const ROLE_SOURCE_LABELS: Record<RoleSource, string> = {
  direct: '个人直接',
  department_inherited: '部门继承'
};

export function roleSourceLabel(source: RoleSource | null | undefined): string {
  if (!source) {
    return '-';
  }
  return ROLE_SOURCE_LABELS[source] || source;
}

export interface RoleSummary extends IamRole {
  source: RoleSource;
}

export interface AdminDashboardRecentLogin {
  userId: number;
  username: string;
  displayName: string | null;
  departmentName: string | null;
  lastLoginAt: string;
}

export interface AdminDashboard {
  counts: {
    user: number;
    department: number;
    userGroup: number;
    role: number;
    permission: number;
    trustedApplication: number;
  };
  stats: {
    activeSessions: number;
    todayLoggedInUsers: number;
    lockedUsers: number;
    disabledUsers: number;
    usersWithoutDepartment: number;
  };
}

export interface AdminSession {
  sessionId: string;
  userId: number;
  username: string;
  clientId: string | null;
  remoteIp: string | null;
  userAgent: string | null;
  authTime: string | null;
  lastActiveAt: string | null;
  expiresAt: string | null;
}

export interface AdminSessionRevokeResult {
  revoked: number;
}

export type PermissionType = 'page' | 'api' | 'data';

export const PERMISSION_TYPE_LABELS: Record<PermissionType, string> = {
  page: '页面权限',
  api: '接口权限',
  data: '数据权限'
};

export function permissionTypeLabel(type: string | null | undefined): string {
  if (!type) {
    return '-';
  }
  return PERMISSION_TYPE_LABELS[type as PermissionType] || type;
}

export interface IamPermission {
  id: number;
  code: string;
  name: string;
  description: string | null;
  type: PermissionType;
  builtIn: number;
}

export interface MessageSendResponse {
  sendBatchId: string;
  recipientCount: number;
}

export interface MessageBatchSummary {
  sendBatchId: string;
  title: string;
  senderUsername: string;
  targetUserCount: number;
  targetDepartmentCount: number;
  targetUserGroupCount: number;
  targetIncludeChildDepartments: boolean;
  recipientCount: number;
  readCount: number;
  createdAt: string;
}

export interface MessageBatchDetail extends MessageBatchSummary {
  content: string;
}

export interface MessageBatchRecipient {
  userId: number;
  username: string;
  displayName: string;
  readAt: string | null;
}

export interface CreateMessagePayload {
  recipientUserId?: number;
  recipientUserIds?: number[];
  departmentIds?: number[];
  userGroupIds?: number[];
  includeChildDepartments?: boolean;
  title: string;
  content: string;
}

export interface IamDepartment {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  parentName: string | null;
  sortOrder: number;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentPayload {
  code?: string;
  name: string;
  parentId: number | null;
  sortOrder: number;
  status: number;
  memberIds?: number[];
}

export interface IamUserGroup {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserGroupPayload {
  code?: string;
  name: string;
  description: string;
  status: number;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  displayName: string;
  email: string;
  phone: string;
  departmentId: number | null;
}

export interface UpdateUserPayload {
  displayName: string;
  email: string;
  phone: string;
  departmentId: number | null;
  clearDepartment: boolean;
}

export interface RolePayload {
  code?: string;
  name: string;
  description: string;
}

export interface OrganizationTreeNode {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  status: number;
  sortOrder: number;
  directMemberCount: number;
  children: OrganizationTreeNode[];
}

export interface PermissionSummary {
  id: number;
  code: string;
  name: string;
  type: PermissionType;
  source: RoleSource;
}

export interface OrganizationUserProfile {
  user: IamUser;
  department: IamDepartment | null;
  userGroups: IamUserGroup[];
  roles: RoleSummary[];
  effectivePermissions: PermissionSummary[];
}

export interface OrganizationDepartmentWorkspace {
  department: IamDepartment;
  directChildren: IamDepartment[];
  members: PageResponse<IamUser>;
}

export interface PortalMenuItem {
  code: string;
  name: string;
  route: string;
  sortOrder: number;
}

export type PortalMenuNodeType = 'GROUP' | 'PAGE';

export type PortalPresentationMode = 'STANDARD' | 'IMMERSIVE';

export interface PortalMenuTreeNode {
  code: string;
  name: string;
  nodeType: PortalMenuNodeType;
  icon: string | null;
  route: string | null;
  requiredPagePermission: string | null;
  presentationMode: PortalPresentationMode | null;
  sortOrder: number;
  children: PortalMenuTreeNode[];
}

export interface PortalIntegration {
  enabled: boolean;
  routePrefix: string;
  entry: string | null;
  apiBase: string | null;
  /** 1.0 compatibility projection. */
  menus?: PortalMenuItem[];
  /** 1.1 recursive menu configuration. */
  menuTree?: PortalMenuTreeNode[];
  defaultEntry: PortalDefaultEntry | null;
  configVersion: number;
}

export interface PortalDefaultEntry {
  pageMenuCode: string;
  path: string;
}

export interface PortalIntegrationPayload {
  enabled: boolean;
  entry?: string;
  apiBase?: string;
  /** @deprecated Send menuTree from the 1.1 administration console. */
  menus?: Array<{
    code: string;
    name: string;
    route: string;
    sortOrder: number;
  }>;
  menuTree?: PortalMenuTreeNode[];
}

export interface PortalConfigurationPayload {
  enabled: boolean;
  entry?: string;
  apiBase?: string;
  menuTree: PortalMenuTreeNode[];
  defaultEntry: { pageMenuCode: string; entryPath?: string } | null;
  configVersion: number;
}

export interface PortalLoginLanding {
  applicationCode: string | null;
  version: number;
}

export interface TrustedApplication {
  id: number;
  applicationCode: string;
  applicationName: string;
  description: string | null;
  icon: string | null;
  clientCount: number;
  portalEnabled: boolean;
  builtIn: boolean;
}

export interface UserApplicationAuthorization {
  applicationId: number;
  admitted: boolean;
  authorizationVersion: number;
  manifestVersion: string | null;
  status: number;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface UserApplicationAuthorizationDetail extends UserApplicationAuthorization {
  roles: string[];
  pagePermissions: string[];
  apiPermissions: string[];
  // 重算前的临时精调结果：DATA 权威通道为角色规则并集，角色一变即被投影覆盖
  dataGrantDocument: DataGrantDocument | null;
}

export interface ApplicationGrantContent {
  roles: string[];
  pagePermissions: string[];
  apiPermissions: string[];
  // 提交时原样回传 GET 到的文档：null=清除；前端不做编辑
  dataGrantDocument: DataGrantDocument | null;
}

export interface TrustedApplicationDetail {
  id: number;
  applicationCode: string;
  applicationName: string;
  description: string | null;
  icon: string | null;
  builtIn: boolean;
  portal: PortalIntegration | null;
  clients: TrustedApplicationClient[];
}

export interface TrustedApplicationClient {
  id: string;
  clientId: string;
  clientName: string;
  clientType: 'PUBLIC' | 'CONFIDENTIAL';
  requireConsent: boolean;
  requireProofKey: boolean;
  redirectUris: string[];
  scopes: string[];
  grantTypes: string[];
  authenticationMethods: string[];
  clientIdIssuedAt: string | null;
  secretPresent: boolean;
}

export interface CreateTrustedApplicationClientPayload {
  clientId: string;
  clientName: string;
  clientType: 'PUBLIC' | 'CONFIDENTIAL';
  requireConsent: boolean;
  redirectUris: string[];
  scopes: string[];
  grantTypes: string[];
  authenticationMethods: string[];
}

export interface TrustedApplicationCreated {
  application: TrustedApplication;
  initialClientSecret: string | null;
}

export interface CreateTrustedApplicationPayload {
  applicationCode: string;
  applicationName: string;
  description: string;
  icon: string;
  portal?: PortalIntegrationPayload;
  initialClient: CreateTrustedApplicationClientPayload;
  roles?: string[];
  pagePermissions?: string[];
  apiPermissions?: string[];
}

export interface UpdateTrustedApplicationPayload {
  applicationName: string;
  description: string;
  icon: string;
  portal?: PortalIntegrationPayload;
}

export interface UpdateTrustedApplicationClientPayload {
  clientName: string;
  requireConsent: boolean;
  redirectUris: string[];
  scopes: string[];
}

export interface TrustedApplicationClientSecretResponse {
  id: string;
  clientId: string;
  clientSecret: string;
}

export interface TrustedApplicationResourceVerificationClient {
  clientId: string;
  applicationId: number;
  status: number;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface ResourceVerificationClientSecretResponse {
  clientId: string;
  clientSecret: string;
}

// 清单 DATA 资源申报：resource/actions/dimensions 是角色规则数据授权的码空间事实源，
// 规则模板里的资源、动作、维度只能从这里出（越界后端 400）
export interface DataResourceDeclaration {
  resource: string;
  actions: string[];
  dimensions: string[];
}

export interface DataGrantConstraint {
  dimension: string;
  // 契约仅支持大写 IN
  operator: 'IN';
  values: string[];
}

export interface DataGrant {
  resource: string;
  actions: string[];
  // true=全量（constraints 必须为空数组）
  all: boolean;
  constraints: DataGrantConstraint[];
}

// 数据授权文档：字段精确校验（不多不少）；grants 间 OR、grant 内约束 AND。
// protocol/version 为契约固定值，不得由调用方改写
export interface DataGrantDocument {
  protocol: 'simple-data-permission';
  version: '1.0';
  grants: DataGrant[];
}

export interface ApplicationPermissionManifest {
  applicationId: number;
  roles: string[];
  pagePermissions: string[];
  apiPermissions: string[];
  dataResources: DataResourceDeclaration[];
  manifestVersion: number;
  manifestDigest: string;
  createdAt: string;
  updatedAt: string;
}

export interface PutApplicationPermissionManifestPayload {
  roles: string[];
  pagePermissions: string[];
  apiPermissions: string[];
  dataResources: DataResourceDeclaration[];
}

export interface CsrfTokenResponse {
  headerName: string;
  parameterName: string;
  token: string;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('未登录');
  }
}

const LOGIN_BASE_URL = import.meta.env.VITE_LOGIN_BASE_URL || '';
const defaultNavigator = (url: string) => window.location.assign(url);

let adminNavigator = defaultNavigator;
let bridgeRequest: (<T>(url: string, init?: RequestInit) => Promise<T>) | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAdminRequestBridge(
  request: (<T>(url: string, init?: RequestInit) => Promise<T>) | null,
  onUnauthorized: (() => void) | null = null
) {
  bridgeRequest = request;
  unauthorizedHandler = onUnauthorized;
}

export function configureAdminNavigator(navigator = defaultNavigator) {
  adminNavigator = navigator;
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return request('/iam/web/auth/me');
}

export async function createMessage(payload: CreateMessagePayload): Promise<MessageSendResponse> {
  return request('/iam/admin/messages', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchMessageBatches(query: PageQuery = {}): Promise<PageResponse<MessageBatchSummary>> {
  return request(`/iam/admin/messages/page?${toPageSearchParams(query).toString()}`);
}

export async function fetchMessageBatch(sendBatchId: string): Promise<MessageBatchDetail> {
  return request(`/iam/admin/messages/${encodeURIComponent(sendBatchId)}`);
}

export async function fetchMessageBatchRecipients(
  sendBatchId: string,
  query: PageQuery = {}
): Promise<PageResponse<MessageBatchRecipient>> {
  return request(`/iam/admin/messages/${encodeURIComponent(sendBatchId)}/recipients?${toPageSearchParams(query).toString()}`);
}

export async function fetchUsers(query: UserPageQuery = {}): Promise<PageResponse<IamUser>> {
  return request(`/iam/admin/users?${toPageSearchParams(query).toString()}`);
}

export async function createUser(payload: CreateUserPayload): Promise<IamUser> {
  return request('/iam/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateUser(userId: number, payload: UpdateUserPayload): Promise<IamUser> {
  return request(`/iam/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function enableUser(userId: number): Promise<void> {
  await request(`/iam/admin/users/${userId}/enable`, { method: 'PUT' });
}

export async function disableUser(userId: number): Promise<void> {
  await request(`/iam/admin/users/${userId}/disable`, { method: 'PUT' });
}

export async function unlockUser(userId: number): Promise<void> {
  await request(`/iam/admin/users/${userId}/unlock`, { method: 'PUT' });
}

export async function resetUserPassword(userId: number, newPassword: string): Promise<void> {
  await request(`/iam/admin/users/${userId}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ newPassword })
  });
}

export async function deleteUser(userId: number): Promise<void> {
  await request(`/iam/admin/users/${userId}`, { method: 'DELETE' });
}

export async function fetchUserRoles(userId: number): Promise<IamRole[]> {
  return request(`/iam/admin/users/${userId}/roles`);
}

export async function assignUserRole(userId: number, roleId: number): Promise<void> {
  await request(`/iam/admin/users/${userId}/roles/${roleId}`, { method: 'POST' });
}

export async function revokeUserRole(userId: number, roleId: number): Promise<void> {
  await request(`/iam/admin/users/${userId}/roles/${roleId}`, { method: 'DELETE' });
}

export async function fetchUserApplicationAuthorizations(userId: number): Promise<UserApplicationAuthorization[]> {
  return request(`/iam/admin/users/${userId}/application-authorizations`);
}

export function fetchUserApplicationAuthorization(userId: number, applicationId: number): Promise<UserApplicationAuthorizationDetail> {
  return request(`/iam/admin/users/${userId}/application-authorizations/${applicationId}`);
}

// PUT 为全量替换 upsert；三类码须为应用权限清单子集，
// manifestVersion/Digest 由服务端按清单当前真值落库
export async function grantUserApplication(
  userId: number,
  applicationId: number,
  content: ApplicationGrantContent
): Promise<void> {
  await request(`/iam/admin/users/${userId}/application-authorizations/${applicationId}`, {
    method: 'PUT',
    body: JSON.stringify({
      admitted: true,
      roles: content.roles,
      pagePermissions: content.pagePermissions,
      apiPermissions: content.apiPermissions,
      dataGrantDocument: content.dataGrantDocument
    })
  });
}

export async function revokeUserApplication(userId: number, applicationId: number): Promise<void> {
  await request(`/iam/admin/users/${userId}/application-authorizations/${applicationId}`, { method: 'DELETE' });
}

export interface LoginProvider {
  code: string;
  displayName: string | null;
  type: string | null;
  enabled: boolean | null;
  description: string | null;
}

export function fetchLoginProviders(): Promise<LoginProvider[]> {
  return request<{ providers: LoginProvider[] }>('/iam/web/auth/providers').then(response => response.providers);
}

export async function bindExternalIdentity(userId: number, providerCode: string, externalId: string): Promise<void> {
  await request(`/iam/admin/users/${userId}/external-identity`, {
    method: 'POST',
    body: JSON.stringify({ providerCode, externalId })
  });
}

export async function unbindExternalIdentity(userId: number): Promise<void> {
  await request(`/iam/admin/users/${userId}/external-identity`, { method: 'DELETE' });
}

export async function fetchDepartments(): Promise<IamDepartment[]> {
  return request('/iam/admin/departments');
}

export async function fetchDepartmentPage(query: StatusPageQuery = {}): Promise<PageResponse<IamDepartment>> {
  return request(`/iam/admin/departments/page?${toPageSearchParams(query).toString()}`);
}

export async function createDepartment(payload: DepartmentPayload): Promise<IamDepartment> {
  return request('/iam/admin/departments', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateDepartment(departmentId: number, payload: DepartmentPayload): Promise<IamDepartment> {
  return request(`/iam/admin/departments/${departmentId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteDepartment(departmentId: number): Promise<void> {
  await request(`/iam/admin/departments/${departmentId}`, { method: 'DELETE' });
}

export async function fetchDepartmentRoles(departmentId: number): Promise<IamRole[]> {
  return request(`/iam/admin/departments/${departmentId}/roles`);
}

// 挂载后部门全体成员（个人直接角色之外）自动继承该角色
export async function assignDepartmentRole(departmentId: number, roleId: number): Promise<void> {
  await request(`/iam/admin/departments/${departmentId}/roles/${roleId}`, { method: 'POST' });
}

// 撤销 iam_admin 等最后管理员保护角色可能返回 409，错误消息需原样展示
export async function revokeDepartmentRole(departmentId: number, roleId: number): Promise<void> {
  await request(`/iam/admin/departments/${departmentId}/roles/${roleId}`, { method: 'DELETE' });
}

export async function fetchUserGroups(): Promise<IamUserGroup[]> {
  return request('/iam/admin/user-groups');
}

export async function fetchUserGroupPage(query: StatusPageQuery = {}): Promise<PageResponse<IamUserGroup>> {
  return request(`/iam/admin/user-groups/page?${toPageSearchParams(query).toString()}`);
}

export async function createUserGroup(payload: UserGroupPayload): Promise<IamUserGroup> {
  return request('/iam/admin/user-groups', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateUserGroup(groupId: number, payload: UserGroupPayload): Promise<IamUserGroup> {
  return request(`/iam/admin/user-groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteUserGroup(groupId: number): Promise<void> {
  await request(`/iam/admin/user-groups/${groupId}`, { method: 'DELETE' });
}

export async function fetchUserGroupUsers(groupId: number): Promise<IamUser[]> {
  return request(`/iam/admin/user-groups/${groupId}/users`);
}

export async function assignUserGroupUser(groupId: number, userId: number): Promise<void> {
  await request(`/iam/admin/user-groups/${groupId}/users/${userId}`, { method: 'POST' });
}

export async function revokeUserGroupUser(groupId: number, userId: number): Promise<void> {
  await request(`/iam/admin/user-groups/${groupId}/users/${userId}`, { method: 'DELETE' });
}

export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  return request('/iam/admin/dashboard');
}

export async function fetchDashboardRecentLogins(
  query: PageQuery = {}
): Promise<PageResponse<AdminDashboardRecentLogin>> {
  return request(`/iam/admin/dashboard/recent-logins?${toPageSearchParams(query).toString()}`);
}

export interface ActiveSessionQuery extends PageQuery {
  userId?: number;
}

export async function fetchActiveSessions(
  query: ActiveSessionQuery = {}
): Promise<PageResponse<AdminSession>> {
  const parameters = toPageSearchParams(query);
  if (query.userId !== undefined) {
    parameters.set('userId', String(query.userId));
  }
  return request(`/iam/admin/sessions?${parameters.toString()}`);
}

export async function revokeUserSessions(userId: number): Promise<AdminSessionRevokeResult> {
  return request(`/iam/admin/sessions/users/${userId}/revoke`, { method: 'PUT' });
}

export async function fetchRoles(): Promise<IamRole[]> {
  return request('/iam/admin/roles');
}

export async function fetchRolePage(query: PageQuery = {}): Promise<PageResponse<IamRole>> {
  return request(`/iam/admin/roles/page?${toPageSearchParams(query).toString()}`);
}

export async function createRole(payload: RolePayload): Promise<IamRole> {
  return request('/iam/admin/roles', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateRole(roleId: number, payload: RolePayload): Promise<IamRole> {
  return request(`/iam/admin/roles/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteRole(roleId: number): Promise<void> {
  await request(`/iam/admin/roles/${roleId}`, { method: 'DELETE' });
}

export async function fetchRolePermissions(roleId: number): Promise<IamPermission[]> {
  return request(`/iam/admin/roles/${roleId}/permissions`);
}

export async function fetchRoleMemberPage(
  roleId: number,
  query: PageQuery = {}
): Promise<PageResponse<IamUser>> {
  return request(`/iam/admin/roles/${roleId}/users/page?${toPageSearchParams(query).toString()}`);
}

// 该角色成员的继承来源部门，只读展示，不含子部门递归
export async function fetchRoleDepartments(roleId: number): Promise<IamDepartment[]> {
  return request(`/iam/admin/roles/${roleId}/departments`);
}

export async function assignRolePermission(roleId: number, permissionId: number): Promise<void> {
  await request(`/iam/admin/roles/${roleId}/permissions/${permissionId}`, { method: 'POST' });
}

export async function revokeRolePermission(roleId: number, permissionId: number): Promise<void> {
  await request(`/iam/admin/roles/${roleId}/permissions/${permissionId}`, { method: 'DELETE' });
}

export interface RoleAuthorizationRule {
  roleId: number;
  applicationId: number;
  pagePermissions: string[];
  apiPermissions: string[];
  // null=该角色无数据授权；grants 并集进用户投影
  dataGrantTemplate: DataGrantDocument | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PutRoleAuthorizationRulePayload {
  pagePermissions: string[];
  apiPermissions: string[];
  // null=清除数据授权
  dataGrantTemplate: DataGrantDocument | null;
}

// 角色对该应用无规则时后端返 404（合法空态），按 null 供编辑器呈现空规则
export async function fetchRoleAuthorizationRule(
  roleId: number,
  applicationId: number
): Promise<RoleAuthorizationRule | null> {
  try {
    return await request(`/iam/admin/roles/${roleId}/authorization-rules/${applicationId}`);
  } catch (error) {
    if (isHttpNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function putRoleAuthorizationRule(
  roleId: number,
  applicationId: number,
  payload: PutRoleAuthorizationRulePayload
): Promise<RoleAuthorizationRule> {
  return request(`/iam/admin/roles/${roleId}/authorization-rules/${applicationId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteRoleAuthorizationRule(roleId: number, applicationId: number): Promise<void> {
  await request(`/iam/admin/roles/${roleId}/authorization-rules/${applicationId}`, { method: 'DELETE' });
}

export async function fetchPermissions(): Promise<IamPermission[]> {
  return request('/iam/admin/permissions');
}

export async function fetchPermissionPage(query: PageQuery = {}): Promise<PageResponse<IamPermission>> {
  return request(`/iam/admin/permissions/page?${toPageSearchParams(query).toString()}`);
}

export async function fetchOrganizationTree(): Promise<OrganizationTreeNode[]> {
  return request('/iam/admin/organizations/tree');
}

export async function fetchOrganizationDepartmentWorkspace(
  departmentId: number,
  query: OrganizationWorkspaceQuery = {}
): Promise<OrganizationDepartmentWorkspace> {
  return request(`/iam/admin/organizations/departments/${departmentId}/workspace?${toPageSearchParams(query).toString()}`);
}

export async function fetchOrganizationUserProfile(userId: number): Promise<OrganizationUserProfile> {
  return request(`/iam/admin/organizations/users/${userId}/profile`);
}

export async function fetchTrustedApplications(query: PageQuery = {}): Promise<PageResponse<TrustedApplication>> {
  return request(`/iam/admin/trusted-applications/page?${toPageSearchParams(query).toString()}`);
}

// 用户授权区需全量应用做 join/可授权集合，size 有服务端 clamp 上限，
// 循环翻页直到 last 兜住应用数超过单页上限的场景
export async function fetchAllTrustedApplications(): Promise<TrustedApplication[]> {
  const applications: TrustedApplication[] = [];
  let page = 1;
  for (;;) {
    const response = await fetchTrustedApplications({ page, size: 100 });
    applications.push(...response.content);
    if (response.last || response.content.length === 0 || page >= response.totalPages) {
      return applications;
    }
    page += 1;
  }
}

export async function fetchTrustedApplication(applicationId: number): Promise<TrustedApplicationDetail> {
  return request(`/iam/admin/trusted-applications/${applicationId}`);
}

export async function createTrustedApplication(payload: CreateTrustedApplicationPayload): Promise<TrustedApplicationCreated> {
  return request('/iam/admin/trusted-applications', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateTrustedApplication(applicationId: number, payload: UpdateTrustedApplicationPayload): Promise<TrustedApplication> {
  return request(`/iam/admin/trusted-applications/${applicationId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function updateTrustedApplicationPortalConfiguration(
  applicationId: number,
  payload: PortalConfigurationPayload
): Promise<PortalIntegration> {
  return request(`/iam/admin/trusted-applications/${applicationId}/portal/configuration`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function fetchPortalLoginLanding(): Promise<PortalLoginLanding> {
  return request('/iam/admin/portal/login-landing');
}

export async function updatePortalLoginLanding(
  payload: { applicationCode: string | null; version: number }
): Promise<PortalLoginLanding> {
  return request('/iam/admin/portal/login-landing', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteTrustedApplication(applicationId: number): Promise<void> {
  await request(`/iam/admin/trusted-applications/${applicationId}`, { method: 'DELETE' });
}

export async function fetchTrustedApplicationClients(applicationId: number): Promise<TrustedApplicationClient[]> {
  return request(`/iam/admin/trusted-applications/${applicationId}/clients`);
}

export async function createTrustedApplicationClient(
  applicationId: number,
  payload: CreateTrustedApplicationClientPayload
): Promise<TrustedApplicationClientSecretResponse> {
  return request(`/iam/admin/trusted-applications/${applicationId}/clients`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateTrustedApplicationClient(
  applicationId: number,
  clientId: string,
  payload: UpdateTrustedApplicationClientPayload
): Promise<TrustedApplicationClient> {
  return request(`/iam/admin/trusted-applications/${applicationId}/clients/${encodeURIComponent(clientId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteTrustedApplicationClient(applicationId: number, clientId: string): Promise<void> {
  await request(`/iam/admin/trusted-applications/${applicationId}/clients/${encodeURIComponent(clientId)}`,
    { method: 'DELETE' });
}

export async function fetchResourceVerificationClients(
  applicationId: number
): Promise<TrustedApplicationResourceVerificationClient[]> {
  return request(`/iam/admin/trusted-applications/${applicationId}/resource-verification-clients`);
}

export async function createResourceVerificationClient(
  applicationId: number,
  payload: { clientId: string }
): Promise<ResourceVerificationClientSecretResponse> {
  return request(`/iam/admin/trusted-applications/${applicationId}/resource-verification-clients`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function rotateResourceVerificationClientSecret(
  applicationId: number,
  clientId: string
): Promise<ResourceVerificationClientSecretResponse> {
  return request(`/iam/admin/trusted-applications/${applicationId}/resource-verification-clients/${encodeURIComponent(clientId)}/secret`, {
    method: 'POST'
  });
}

export async function revokeResourceVerificationClient(applicationId: number, clientId: string): Promise<void> {
  await request(`/iam/admin/trusted-applications/${applicationId}/resource-verification-clients/${encodeURIComponent(clientId)}`,
    { method: 'DELETE' });
}

// 未登记清单时后端 404，按错误消息标记识别并返回 null（消息常量与后端 ServerErrorMessage 同源演进）
export async function fetchApplicationPermissionManifest(
  applicationId: number
): Promise<ApplicationPermissionManifest | null> {
  try {
    return await request(`/iam/admin/trusted-applications/${applicationId}/permission-manifest`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('可信应用未登记权限清单')) {
      return null;
    }
    throw error;
  }
}

export async function putApplicationPermissionManifest(
  applicationId: number,
  payload: PutApplicationPermissionManifestPayload
): Promise<ApplicationPermissionManifest> {
  return request(`/iam/admin/trusted-applications/${applicationId}/permission-manifest`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

function toPageSearchParams(
  query: PageQuery & {
    status?: number;
    departmentId?: number;
    lastLoginAfter?: string;
    lockedUntilAfter?: string;
    noDepartment?: boolean;
  }
): URLSearchParams {
  const parameters = new URLSearchParams({
    page: String(Math.max(query.page || 1, 1)),
    size: String(Math.min(Math.max(query.size || 20, 1), 100))
  });
  if (query.status !== undefined) {
    parameters.set('status', String(query.status));
  }
  if (query.departmentId !== undefined) {
    parameters.set('departmentId', String(query.departmentId));
  }
  if (query.lastLoginAfter) {
    parameters.set('lastLoginAfter', query.lastLoginAfter);
  }
  if (query.lockedUntilAfter) {
    parameters.set('lockedUntilAfter', query.lockedUntilAfter);
  }
  if (query.noDepartment) {
    parameters.set('noDepartment', 'true');
  }
  if (query.keyword?.trim()) {
    parameters.set('keyword', query.keyword.trim());
  }
  return parameters;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (bridgeRequest) {
    try {
      return await bridgeRequest(url, init);
    } catch (error) {
      if (error instanceof UnauthorizedError || (error instanceof Error && error.message === '未登录')) {
        handleUnauthorized();
      }
      throw error;
    }
  }
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined)
  };
  if (init.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const method = (init.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = await fetchCsrfToken();
    headers[csrf.headerName] = csrf.token;
  }
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers
  });
  if (response.status === 401) {
    handleUnauthorized();
    throw new UnauthorizedError();
  }
  if (response.status === 403) {
    const body = await response.text();
    let message = '';
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string' && parsed.message) message = parsed.message;
    } catch {
      // 非 JSON 响应体，使用兜底文案
    }
    throw new Error(message || '没有该操作的权限（403）');
  }
  if (response.status === 404) {
    const body = await response.text();
    let message = '';
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string' && parsed.message) message = parsed.message;
    } catch {
      // 无响应体（如授权规则合法空态 404），使用带标记的兜底文案
    }
    throw withHttpStatus(new Error(message || '资源不存在（404）'), 404);
  }
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string' && parsed.message) message = parsed.message;
    } catch {
      // 非 JSON 响应体（如网关纯文本错误），保持原文展示
    }
    throw new Error(message || '请求失败');
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  // assignRole 等接口返回 200 空 body，与 204 等价对待
  return (text ? JSON.parse(text) : undefined) as T;
}

function handleUnauthorized() {
  if (unauthorizedHandler) {
    unauthorizedHandler();
    return;
  }
  adminNavigator(`${LOGIN_BASE_URL}/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
}

function withHttpStatus(error: Error, status: number): Error {
  (error as Error & { httpStatus?: number }).httpStatus = status;
  return error;
}

// qiankun 桥接路径下错误跨 bundle 传递会丢失原型，靠 httpStatus 属性或稳定标记文案双重识别
export function isHttpNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (error as Error & { httpStatus?: number }).httpStatus === 404
    || error.message.includes('资源不存在（404）');
}

async function fetchCsrfToken(): Promise<CsrfTokenResponse> {
  const response = await fetch('/iam/web/auth/csrf', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('获取 CSRF Token 失败');
  }
  return response.json();
}
