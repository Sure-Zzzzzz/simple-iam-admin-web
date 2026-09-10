import {
  applyTheme,
  createLightThemePreference,
  type ThemeSnapshot
} from '@sure-zzzzzz/simple-iam-theme-contract';

export type AdminThemeSnapshot = ThemeSnapshot;

export function createLightAdminThemeSnapshot(): AdminThemeSnapshot {
  return createLightThemePreference();
}

export function applyAdminTheme(root: HTMLElement, snapshot: AdminThemeSnapshot) {
  applyTheme(root, snapshot);
}
