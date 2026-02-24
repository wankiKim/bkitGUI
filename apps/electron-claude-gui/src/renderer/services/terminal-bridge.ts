import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { store } from '../core/store'

declare const window: Window & {
  desktopAPI: {
    startTerminal: (options?: { cwd?: string; cols?: number; rows?: number }) => Promise<{ id: string; shell: string; cwd: string }>
    writeTerminal: (data: string) => Promise<void>
    resizeTerminal: (cols: number, rows: number) => Promise<void>
    stopTerminal: () => Promise<void>
    onTerminalData: (handler: (data: string) => void) => () => void
    onTerminalExit: (handler: () => void) => () => void
    [key: string]: any
  }
}

export class TerminalBridge {
  readonly terminal: Terminal
  readonly fitAddon: FitAddon
  private cleanupData: (() => void) | null = null
  private cleanupExit: (() => void) | null = null
  private onDataCallback: ((data: string) => void) | null = null

  constructor(container: HTMLElement) {
    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1.3,
      convertEol: true,
      theme: { background: '#0d1117', foreground: '#e6edf3' }
    })
    this.fitAddon = new FitAddon()
    this.terminal.loadAddon(this.fitAddon)
    this.terminal.loadAddon(new WebLinksAddon())
    this.terminal.open(container)
    this.fitAddon.fit()

    this.terminal.onData((data) => {
      window.desktopAPI.writeTerminal(data)
    })

    window.addEventListener('resize', () => {
      this.fit()
      window.desktopAPI.resizeTerminal(this.terminal.cols, this.terminal.rows)
    })
  }

  setOnData(callback: (data: string) => void): void {
    this.onDataCallback = callback
  }

  async start(cwd?: string): Promise<void> {
    this.stopListeners()

    const result = await window.desktopAPI.startTerminal({
      cwd,
      cols: this.terminal.cols,
      rows: this.terminal.rows
    })

    this.cleanupData = window.desktopAPI.onTerminalData((data: string) => {
      this.terminal.write(data)
      this.onDataCallback?.(data)
    })

    this.cleanupExit = window.desktopAPI.onTerminalExit(() => {
      store.update({
        terminal: { ready: false, sessionId: null },
        claude: { ...store.getState().claude, started: false, appliedModel: null }
      })
      this.writeInfo('터미널 세션이 종료되었습니다. 버튼으로 다시 시작할 수 있습니다.')
    })

    store.update({ terminal: { ready: true, sessionId: result.id } })
    this.writeInfo(`Shell started: ${result.shell}`)
  }

  async write(data: string): Promise<void> {
    await window.desktopAPI.writeTerminal(data)
  }

  fit(): void {
    this.fitAddon.fit()
  }

  writeInfo(message: string): void {
    this.terminal.writeln(`\r\n\x1b[36m${message}\x1b[0m`)
  }

  writeError(message: string): void {
    this.terminal.writeln(`\r\n\x1b[31m${message}\x1b[0m`)
  }

  async stop(): Promise<void> {
    this.stopListeners()
    await window.desktopAPI.stopTerminal()
  }

  reset(): void {
    this.terminal.reset()
    this.fitAddon.fit()
  }

  private stopListeners(): void {
    this.cleanupData?.()
    this.cleanupData = null
    this.cleanupExit?.()
    this.cleanupExit = null
  }

  destroy(): void {
    this.stopListeners()
    this.terminal.dispose()
  }
}
