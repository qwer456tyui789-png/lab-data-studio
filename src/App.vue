<template>
  <div class="app">
    <div v-if="!store.loaded" class="splash">
      <div class="splash-mark">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path d="M3.5 19V11M9.5 19V5.5M15.5 19v-5.5M21.5 19H2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </div>
      <p>正在准备你的实验数据工作台…</p>
    </div>

    <template v-else>
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M3.5 19V11M9.5 19V5.5M15.5 19v-5.5M21.5 19H2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </div>
          <div class="brand-text">
            <strong>实验数据工坊</strong>
            <span>LabData Studio</span>
          </div>
        </div>

        <nav class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            class="tab"
            :class="{ active: store.ui.activeTab === tab.value }"
            @click="setActiveTab(tab.value)"
          >
            {{ tab.label }}
          </button>
        </nav>

        <div class="topbar-right">
          <span class="privacy-chip">纯前端 · 数据留在本机</span>
          <div class="save-state" :class="store.saveStatus">
            <span class="status-dot"></span>
            {{ saveText }}
          </div>
        </div>
      </header>

      <div class="workspace">
        <DatasetSidebar />
        <main class="main">
          <DataTable v-if="store.ui.activeTab === 'data'" :dataset="activeDataset" />
          <ChartView v-else-if="store.ui.activeTab === 'chart'" />
          <DashboardView v-else />
        </main>
      </div>
    </template>

    <ToastHost />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import DatasetSidebar from './components/DatasetSidebar.vue'
import DataTable from './components/DataTable.vue'
import ChartView from './components/ChartView.vue'
import DashboardView from './components/DashboardView.vue'
import ToastHost from './components/ToastHost.vue'
import { store, initStore, getActiveDataset, setActiveTab } from './store/useStore'

const tabs = [
  { value: 'data', label: '数据表格' },
  { value: 'chart', label: '图表' },
  { value: 'dashboard', label: '联动看板' }
]

const activeDataset = computed(() => getActiveDataset())

const saveText = computed(() => {
  if (store.saveStatus === 'saving') return '保存中…'
  if (store.saveStatus === 'error') return '保存失败'
  return '已保存'
})

onMounted(() => {
  initStore()
})
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  background: var(--bg);
}

.splash {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-3);
  font-size: 13px;
}

.splash-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 18px;
  background: linear-gradient(135deg, #3f63f0, #5a4be0);
  color: #fff;
  box-shadow: 0 16px 38px rgba(53, 87, 232, 0.3);
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.topbar {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 60px;
  flex: none;
  padding: 0 20px 0 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 5;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 238px;
  flex: none;
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, #3f63f0, #5a4be0);
  color: #fff;
  box-shadow: 0 6px 16px rgba(53, 87, 232, 0.28);
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-text strong {
  font-size: 14.5px;
  font-weight: 750;
  letter-spacing: 0.01em;
}

.brand-text span {
  font-size: 10.5px;
  color: var(--text-3);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tabs {
  display: flex;
  align-items: stretch;
  height: 100%;
}

.topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}

.privacy-chip {
  font-size: 11px;
  color: var(--text-3);
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  white-space: nowrap;
}

.save-state {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
  min-width: 64px;
  justify-content: flex-end;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9aa3b6;
}

.save-state.saved .status-dot {
  background: #1fae7f;
}

.save-state.saving .status-dot {
  background: #e0a01e;
  animation: blink 0.9s ease-in-out infinite;
}

.save-state.error {
  color: var(--danger);
}

.save-state.error .status-dot {
  background: var(--danger);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.workspace {
  flex: 1;
  display: flex;
  min-height: 0;
}

.main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px 26px;
  background:
    radial-gradient(900px 380px at 18% -8%, rgba(53, 87, 232, 0.055), transparent 65%),
    var(--bg);
}

@media (max-width: 1320px) {
  .privacy-chip {
    display: none;
  }

  .brand {
    width: 216px;
  }
}
</style>
