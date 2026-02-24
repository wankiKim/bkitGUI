import { store } from '../core/store'
import { TerminalBridge } from './terminal-bridge'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class ClaudeSession {
  constructor(
    private bridge: TerminalBridge
  ) {}

  async ensureTerminal(): Promise<void> {
    if (store.getState().terminal.ready) return
    await this.bridge.start()
  }

  async start(): Promise<void> {
    await this.ensureTerminal()
    if (!store.getState().claude.started) {
      await this.bridge.write('claude\n')
      store.update(prev => ({
        claude: { ...prev.claude, started: true }
      }))
      this.bridge.writeInfo('Claude 세션을 시작했습니다.')
      await sleep(500)
    }
    await this.applyModel(false)
  }

  async applyModel(force = false): Promise<void> {
    const s = store.getState()
    if (!s.claude.started) return
    if (!force && s.claude.selectedModel === s.claude.appliedModel) return

    await this.bridge.write(`/model ${s.claude.selectedModel}\n`)
    store.update(prev => ({
      claude: { ...prev.claude, appliedModel: prev.claude.selectedModel }
    }))
    this.bridge.writeInfo(`모델 적용: ${s.claude.selectedModel}`)
  }

  async sendPrompt(text: string): Promise<void> {
    await this.start()

    const s = store.getState()
    store.update({
      chat: {
        ...s.chat,
        messages: [...s.chat.messages, { role: 'user', text, at: new Date().toISOString() }],
        pendingPrompt: text
      }
    })

    await this.bridge.write(`${text}\n`)
    this.bridge.writeInfo('프롬프트 전송')
  }

  async sendCommand(command: string, infoMessage?: string): Promise<void> {
    await this.ensureTerminal()
    if (infoMessage) this.bridge.writeInfo(infoMessage)
    await this.bridge.write(`${command}\n`)
  }

  async login(): Promise<void> {
    store.update(prev => ({
      claude: { ...prev.claude, started: false, appliedModel: null }
    }))
    await this.sendCommand('claude login', 'Claude 로그인 명령 실행')
  }

  async installBkit(): Promise<void> {
    await this.start()
    await this.sendCommand('/plugin install bkit', 'bkit 플러그인을 설치합니다.')
  }

  async addMarketplace(): Promise<void> {
    await this.start()
    await this.sendCommand(
      '/plugin marketplace add popup-studio-ai/bkit-claude-code',
      'bkit 마켓플레이스를 추가합니다.'
    )
  }

  async restartShell(): Promise<void> {
    await this.bridge.stop()
    store.update({
      terminal: { ready: false, sessionId: null },
      claude: { ...store.getState().claude, started: false, appliedModel: null }
    })
    this.bridge.reset()
    await this.ensureTerminal()
    this.bridge.writeInfo('셸을 재시작했습니다.')
  }
}
