import {
  CHAT_STATE_KEY,
  OFFICE_STATE_KEY,
  OPS_STATE_KEY,
  APP_SETTINGS_KEY,
  CHAT_MESSAGES_LIMIT,
  CHAT_STATE_VERSION
} from './constants'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  at: string
}

export interface AgentInfo {
  id: string
  name: string
  role: string
  active: boolean
}

export interface OpsItem {
  id: string
  title?: string
  type?: string
  path?: string
  updatedAt?: string
  done?: boolean
  priority?: string
  owner?: string
  status?: string
  message?: string
  body?: string
  at?: string
  [key: string]: any
}

export interface OfficeTeam {
  current: number
  total: number
}

export interface OfficeState {
  planning: OfficeTeam
  dev: OfficeTeam
  design: OfficeTeam
  ops: OfficeTeam
}

export interface OpsState {
  docs: OpsItem[]
  activities: OpsItem[]
  decisions: OpsItem[]
  tasks: OpsItem[]
  notices: OpsItem[]
  agents: AgentInfo[]
}

export interface PdcaFeature {
  phase: string
  phaseNumber: number
  matchRate: number | null
  iterationCount: number
  documents: Record<string, string>
  timestamps: { started: string; lastUpdated: string }
}

export interface PdcaStatus {
  version: string
  primaryFeature: string
  activeFeatures: string[]
  features: Record<string, PdcaFeature>
}

export type ModelId = 'sonnet' | 'opus' | 'haiku'
export type LibraryTab = 'history' | 'skills'
export type Density = 'cozy' | 'compact'
export type Theme = 'light' | 'dark' | 'system'

export interface AppState {
  terminal: {
    ready: boolean
    sessionId: string | null
  }
  claude: {
    started: boolean
    status: { installed: boolean; detail: string } | null
    selectedModel: ModelId
    appliedModel: string | null
  }
  chat: {
    messages: ChatMessage[]
    history: string[]
    pendingPrompt: string | null
  }
  office: OfficeState
  ops: OpsState
  ui: {
    route: string
    libraryTab: LibraryTab
    libraryFilter: string
    density: Density
    theme: Theme
  }
  pdca: PdcaStatus | null
}

type Selector<T> = (state: AppState) => T
type Listener<T> = (value: T, prev: T) => void

interface Subscription {
  selector: Selector<any>
  listener: Listener<any>
  prev: any
}

function getJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function setJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

const DEFAULT_OFFICE: OfficeState = {
  planning: { current: 0, total: 2 },
  dev: { current: 0, total: 3 },
  design: { current: 0, total: 2 },
  ops: { current: 0, total: 2 }
}

const DEFAULT_OPS: OpsState = {
  docs: [],
  activities: [],
  decisions: [],
  tasks: [],
  notices: [],
  agents: [
    { id: 'gap-detector', name: 'Gap Detector', role: 'Design-Implementation 갭 분석', active: true },
    { id: 'pdca-iterator', name: 'PDCA Iterator', role: '자동 코드 개선', active: true },
    { id: 'code-analyzer', name: 'Code Analyzer', role: '코드 품질 분석', active: true },
    { id: 'report-generator', name: 'Report Generator', role: '완료 보고서 생성', active: true },
    { id: 'design-validator', name: 'Design Validator', role: '설계 문서 검증', active: false },
    { id: 'qa-monitor', name: 'QA Monitor', role: '제로 스크립트 QA', active: false }
  ]
}

export class Store {
  private state: AppState
  private subscriptions = new Set<Subscription>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.state = {
      terminal: { ready: false, sessionId: null },
      claude: { started: false, status: null, selectedModel: 'sonnet', appliedModel: null },
      chat: { messages: [], history: [], pendingPrompt: null },
      office: { ...DEFAULT_OFFICE },
      ops: { ...DEFAULT_OPS },
      ui: { route: 'office-home', libraryTab: 'history', libraryFilter: 'all', density: 'cozy', theme: 'light' as Theme },
      pdca: null
    }
  }

  getState(): Readonly<AppState> {
    return this.state
  }

  update(partial: Partial<AppState> | ((prev: AppState) => Partial<AppState>)): void {
    const changes = typeof partial === 'function' ? partial(this.state) : partial
    this.state = { ...this.state, ...changes }
    this.notifySubscribers()
    this.schedulePersist()
  }

  subscribe<T>(selector: Selector<T>, listener: Listener<T>): () => void {
    const sub: Subscription = { selector, listener, prev: selector(this.state) }
    this.subscriptions.add(sub)
    return () => this.subscriptions.delete(sub)
  }

  private notifySubscribers(): void {
    for (const sub of this.subscriptions) {
      const next = sub.selector(this.state)
      if (next !== sub.prev) {
        const prev = sub.prev
        sub.prev = next
        sub.listener(next, prev)
      }
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persist()
    }, 300)
  }

  persist(): void {
    const s = this.state
    setJson(CHAT_STATE_KEY, {
      version: CHAT_STATE_VERSION,
      model: s.claude.selectedModel,
      chatMessages: s.chat.messages
    })
    setJson(OFFICE_STATE_KEY, s.office)
    setJson(OPS_STATE_KEY, s.ops)
    setJson(APP_SETTINGS_KEY, { density: s.ui.density, theme: s.ui.theme })
  }

  hydrate(): void {
    const chatState = getJson<any>(CHAT_STATE_KEY, null)
    if (chatState && Array.isArray(chatState.chatMessages)) {
      const messages = chatState.chatMessages
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
        .slice(-CHAT_MESSAGES_LIMIT) as ChatMessage[]
      const m = chatState.model
      const model: ModelId = (m === 'sonnet' || m === 'opus' || m === 'haiku') ? m : 'sonnet'
      this.state.chat.messages = messages
      this.state.claude.selectedModel = model
    }

    this.state.office = { ...DEFAULT_OFFICE, ...getJson(OFFICE_STATE_KEY, DEFAULT_OFFICE) }
    this.state.ops = { ...DEFAULT_OPS, ...getJson(OPS_STATE_KEY, DEFAULT_OPS) }

    const settings = getJson<{ density?: string; theme?: string }>(APP_SETTINGS_KEY, { density: 'cozy', theme: 'light' })
    const d = settings.density
    this.state.ui.density = (d === 'cozy' || d === 'compact') ? d : 'cozy'
    const t = settings.theme
    this.state.ui.theme = (t === 'light' || t === 'dark' || t === 'system') ? t : 'light'

    this.notifySubscribers()
  }
}

export const store = new Store()
