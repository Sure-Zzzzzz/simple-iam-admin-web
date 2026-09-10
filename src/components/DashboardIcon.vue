<script setup lang="ts">
defineProps<{
  name:
    | 'user'
    | 'department'
    | 'user-group'
    | 'role'
    | 'trusted-app'
    | 'session'
    | 'today-login'
    | 'lock';
}>();
</script>

<template>
  <svg
    class="dashboard-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'user'">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </template>
    <template v-else-if="name === 'department'">
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="3" y="16" width="6" height="5" rx="1" />
      <rect x="15" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v4M6 16v-2h12v2" />
    </template>
    <template v-else-if="name === 'user-group'">
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="7.5" r="2.4" />
      <path d="M16 14.3c2.7.2 4.5 2 4.5 4.7" />
    </template>
    <template v-else-if="name === 'role'">
      <path d="M12 3l7 3v5c0 4.5-3 8.1-7 10-4-1.9-7-5.5-7-10V6z" />
      <circle cx="12" cy="10.5" r="2.2" />
      <path d="M12 12.7v3" />
    </template>
    <template v-else-if="name === 'trusted-app'">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 9.5h16M8.5 7.2h.01M11 7.2h.01" />
    </template>
    <template v-else-if="name === 'session'">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'today-login'">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M3 12h11M10.5 8.5L14 12l-3.5 3.5" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" />
    </template>
  </svg>
</template>
