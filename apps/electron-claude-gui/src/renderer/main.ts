import '@xterm/xterm/css/xterm.css'
import './styles/variables.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/views.css'

import { store, ModelId } from './core/store'
import { Router } from './core/router'
import { HISTORY_KEY } from './core/constants'

import { TerminalBridge } from './services/terminal-bridge'
import { ChatParser } from './services/chat-parser'
import { ClaudeSession } from './services/claude-session'
import { PdcaWatcher } from './services/pdca-watcher'

import { ChatLog } from './components/chat-log'
import { PromptInput } from './components/prompt-input'
import { StatusPanel } from './components/status-panel'

import { LibraryView } from './views/library-view'
import { DashboardView } from './views/dashboard-view'
import { TaskView } from './views/task-view'
import { DecisionView } from './views/decision-view'
import { AgentView } from './views/agent-view'
import { ReportView } from './views/report-view'
import { NoticeView } from './views/notice-view'
import { OfficeView } from './views/office-view'
import { SettingsView } from './views/settings-view'

declare const window: Window & {
  desktopAPI: {
    saveSession: (payload: unknown) => Promise<{ canceled: boolean; path?: string }>
    loadSession: () => Promise<{ canceled: boolean; path?: string; data?: any }>
    [key: string]: any
  }
}

// --- Bootstrap ---
function el(id: string): HTMLElement {
  return document.getElementById(id)!
}

async function init(): Promise<void> {
  // 1. Hydrate store from localStorage
  store.hydrate()

  // 2. Init core services
  const bridge = new TerminalBridge(el('terminal'))
  const chatParser = new ChatParser()
  const session = new ClaudeSession(bridge)
  const pdcaWatcher = new PdcaWatcher()

  // Wire terminal data to chat parser
  bridge.setOnData((data) => chatParser.onData(data))

  // 3. Init router
  const router = new Router(el('topNav'), el('sideNav'))

  // 4. Init components
  const chatLog = new ChatLog(el('chatLog'))
  const promptInput = new PromptInput(
    el('promptInput') as HTMLTextAreaElement,
    el('btnSendPrompt'),
    el('history'),
    session
  )
  const statusPanel = new StatusPanel(el('claudeStatus'), el('cwdInfo'))

  // 5. Init views
  const libraryView = new LibraryView(session)
  const dashboardView = new DashboardView(session)
  const taskView = new TaskView()
  const decisionView = new DecisionView()
  const agentView = new AgentView(session)
  const reportView = new ReportView(bridge, session)
  const noticeView = new NoticeView()
  const officeView = new OfficeView(router)
  const settingsView = new SettingsView()

  // 6. Initial render
  chatLog.render()
  promptInput.renderHistory()
  settingsView.init()
  libraryView.render()
  libraryView.renderDocs()
  dashboardView.renderKpis()
  dashboardView.renderPdca()
  taskView.render()
  decisionView.render()
  agentView.render()
  noticeView.render()
  officeView.render()
  officeView.renderActivities()

  // Force initial route render
  router.navigate(store.getState().ui.route)

  // 7. Right-rail button handlers
  el('btnStartClaude').addEventListener('click', () => session.start())
  el('btnLogin').addEventListener('click', () => session.login())
  el('btnOpenBkitMarketplace').addEventListener('click', () => session.addMarketplace())
  el('btnInstallBkit').addEventListener('click', () => session.installBkit())
  el('btnRestartShell').addEventListener('click', () => {
    chatParser.reset()
    session.restartShell()
  })

  // Model selection
  const modelSelect = el('modelSelect') as HTMLSelectElement
  modelSelect.value = store.getState().claude.selectedModel

  el('btnApplyModel').addEventListener('click', async () => {
    store.update(prev => ({
      claude: { ...prev.claude, selectedModel: modelSelect.value as ModelId }
    }))
    await session.start()
    await session.applyModel(true)
  })
  modelSelect.addEventListener('change', () => {
    store.update(prev => ({
      claude: { ...prev.claude, selectedModel: modelSelect.value as ModelId }
    }))
  })

  // Session save/load
  el('btnSaveSession').addEventListener('click', async () => {
    try {
      const s = store.getState()
      const payload = {
        version: 2,
        savedAt: new Date().toISOString(),
        model: s.claude.selectedModel,
        history: JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'),
        chatMessages: s.chat.messages
      }
      const result = await window.desktopAPI.saveSession(payload)
      if (!result.canceled) bridge.writeInfo(`세션 저장 완료: ${result.path}`)
    } catch (error: any) {
      bridge.writeInfo(`세션 저장 실패: ${error.message}`)
    }
  })

  el('btnLoadSession').addEventListener('click', async () => {
    try {
      const result = await window.desktopAPI.loadSession()
      if (result.canceled || !result.data) return
      const payload = result.data
      if (!Array.isArray(payload.chatMessages) || !Array.isArray(payload.history)) {
        throw new Error('세션 형식이 올바르지 않습니다.')
      }
      const m = payload.model
      const model: ModelId = (m === 'sonnet' || m === 'opus' || m === 'haiku') ? m : 'sonnet'
      localStorage.setItem(HISTORY_KEY, JSON.stringify(payload.history.slice(0, 20)))
      promptInput.renderHistory()
      store.update(prev => ({
        claude: { ...prev.claude, selectedModel: model },
        chat: {
          ...prev.chat,
          messages: payload.chatMessages
            .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
            .slice(-200)
        }
      }))
      modelSelect.value = model
      bridge.writeInfo(`세션 로드 완료: ${result.path}`)
    } catch (error: any) {
      bridge.writeInfo(`세션 로드 실패: ${error.message}`)
    }
  })

  // 8. Start polling
  statusPanel.startPolling()
  pdcaWatcher.start()

  // 9. Cleanup on unload
  window.addEventListener('beforeunload', () => {
    pdcaWatcher.stop()
    statusPanel.stopPolling()
  })

  // 10. Start terminal
  await bridge.start()
  bridge.writeInfo('Ready. 메뉴를 전환해 기능을 사용하세요.')
}

init().catch((error) => {
  const termEl = document.getElementById('terminal')
  if (termEl) {
    const errDiv = document.createElement('div')
    errDiv.style.cssText = 'color:red;padding:12px'
    errDiv.textContent = `초기화 실패: ${error.message}`
    termEl.appendChild(errDiv)
  }
  console.error('Init failed:', error)
})
