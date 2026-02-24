import { store } from '../core/store'
import { HISTORY_KEY, HISTORY_LIMIT } from '../core/constants'
import { ClaudeSession } from '../services/claude-session'

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

export class PromptInput {
  private textarea: HTMLTextAreaElement
  private sendBtn: HTMLElement
  private historyEl: HTMLElement

  constructor(
    textarea: HTMLTextAreaElement,
    sendBtn: HTMLElement,
    historyEl: HTMLElement,
    private session: ClaudeSession
  ) {
    this.textarea = textarea
    this.sendBtn = sendBtn
    this.historyEl = historyEl

    this.sendBtn.addEventListener('click', () => this.send())
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.send()
      }
    })
  }

  private async send(): Promise<void> {
    const flattened = this.textarea.value
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join(' ')

    if (!flattened) return

    await this.session.sendPrompt(flattened)
    this.addHistory(flattened)
    this.textarea.value = ''
  }

  private addHistory(prompt: string): void {
    const items = getJson<string[]>(HISTORY_KEY, [])
    items.unshift(prompt)
    setJson(HISTORY_KEY, items.slice(0, HISTORY_LIMIT))
    this.renderHistory()
  }

  renderHistory(): void {
    const items = getJson<string[]>(HISTORY_KEY, [])
    if (items.length === 0) {
      this.historyEl.innerHTML = '<div class="history-item">전송한 프롬프트가 여기에 표시됩니다.</div>'
      return
    }
    this.historyEl.innerHTML = items
      .map(item => {
        const div = document.createElement('div')
        div.className = 'history-item'
        div.textContent = item
        return div.outerHTML
      })
      .join('')
  }
}
