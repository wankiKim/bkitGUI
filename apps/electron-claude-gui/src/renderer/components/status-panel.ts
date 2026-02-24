import { STATUS_POLL_INTERVAL } from '../core/constants'

declare const window: Window & {
  desktopAPI: {
    appMeta: () => Promise<{ platform: string; home: string; cwd: string }>
    checkClaude: (force?: boolean) => Promise<{ installed: boolean; detail: string }>
    [key: string]: any
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    )
  ])
}

export class StatusPanel {
  private statusEl: HTMLElement
  private cwdEl: HTMLElement
  private interval: ReturnType<typeof setInterval> | null = null

  constructor(statusEl: HTMLElement, cwdEl: HTMLElement) {
    this.statusEl = statusEl
    this.cwdEl = cwdEl
  }

  async refresh(): Promise<void> {
    try {
      const [meta, claude] = await Promise.all([
        withTimeout(window.desktopAPI.appMeta(), 3000, 'appMeta'),
        withTimeout(window.desktopAPI.checkClaude(), 9000, 'claudeCheck')
      ])

      this.cwdEl.textContent = meta.cwd

      if (claude.installed) {
        this.statusEl.textContent = `설치됨 (${claude.detail})`
        this.statusEl.style.color = '#16a34a'
      } else {
        this.statusEl.textContent = `미설치 또는 PATH 오류 (${claude.detail})`
        this.statusEl.style.color = '#dc2626'
      }
    } catch (error: any) {
      this.statusEl.textContent = `확인 실패 (${error.message})`
      this.statusEl.style.color = '#dc2626'
    }
  }

  startPolling(): void {
    this.refresh()
    this.interval = setInterval(() => this.refresh(), STATUS_POLL_INTERVAL)
  }

  stopPolling(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
}
