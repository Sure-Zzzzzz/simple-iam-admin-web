<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  description?: string;
  pending?: boolean;
  wide?: boolean;
  extraWide?: boolean;
  notice?: string;
  noticeType?: 'success' | 'error';
}>();

const emit = defineEmits<{
  close: [];
}>();

const drawer = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

async function focusDrawer() {
  if (!props.open) return;
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  drawer.value?.focus();
}

function close() {
  if (props.pending) return;
  emit('close');
  previouslyFocused?.focus();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open && !props.pending) {
    close();
  }
}

watch(() => props.open, focusDrawer);
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div v-if="open" class="drawer-backdrop" @click.self="close">
    <aside
      ref="drawer"
      class="entity-drawer"
      :class="{ 'entity-drawer-wide': wide, 'entity-drawer-extra-wide': extraWide }"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
    >
      <header class="drawer-header">
        <div>
          <h2>{{ title }}</h2>
          <p v-if="description">{{ description }}</p>
        </div>
        <button class="icon-button" type="button" aria-label="关闭" title="关闭" :disabled="pending" @click="close">
          &times;
        </button>
      </header>
      <!-- 操作反馈贴抽屉呈现：抽屉打开时页面顶横幅会被遮罩盖住，反馈必须进抽屉可见区 -->
      <p
        v-if="notice"
        class="admin-message"
        :class="noticeType === 'error' ? 'error' : 'success'"
        :role="noticeType === 'error' ? 'alert' : 'status'"
      >
        {{ notice }}
      </p>
      <div class="drawer-content">
        <slot></slot>
      </div>
    </aside>
  </div>
</template>
