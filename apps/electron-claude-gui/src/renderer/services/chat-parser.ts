import { store, ChatMessage } from '../core/store'
import { ANSI_RE, SKIP_PATTERNS, SKIP_PREFIXES, FLUSH_DELAY } from '../core/constants'

export class ChatParser {
  private buffer = ''
  private timer: ReturnType<typeof setTimeout> | null = null

  stripAnsi(str: string): string {
    return str.replace(ANSI_RE, '')
  }

  normalize(raw: string): string {
    const pending = store.getState().chat.pendingPrompt
    return this.stripAnsi(raw)
      .replace(/\r/g, '')
      .split('\n')
      .map(line => line.trimEnd())
      .filter(line => {
        if (!line.trim()) return false
        if (pending && line.trim() === pending) return false
        for (const pat of SKIP_PATTERNS) {
          if (line.includes(pat)) return false
        }
        for (const prefix of SKIP_PREFIXES) {
          if (line.startsWith(prefix)) return false
        }
        return true
      })
      .join('\n')
      .trim()
  }

  onData(rawData: string): void {
    if (!store.getState().claude.started) return

    const text = this.normalize(rawData)
    if (!text) return

    this.buffer += `${this.buffer ? '\n' : ''}${text}`
    this.clearTimer()
    this.timer = setTimeout(() => this.flush(), FLUSH_DELAY)
  }

  flush(): void {
    this.clearTimer()
    const text = this.buffer.trim()
    this.buffer = ''
    if (!text) return

    const s = store.getState()
    const msg: ChatMessage = { role: 'assistant', text, at: new Date().toISOString() }
    store.update({
      chat: {
        ...s.chat,
        messages: [...s.chat.messages, msg],
        pendingPrompt: null
      }
    })
  }

  reset(): void {
    this.clearTimer()
    this.buffer = ''
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
