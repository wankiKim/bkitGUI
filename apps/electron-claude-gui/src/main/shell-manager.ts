import * as pty from 'node-pty'

export interface ShellSession {
  id: string
  process: pty.IPty
  cwd: string
  shell: string
  createdAt: Date
}

const SENSITIVE_PATTERNS = [
  /^(API|AUTH|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL)/i,
  /_(KEY|SECRET|TOKEN|PASSWORD)$/i
]

function filterEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const filtered: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(env)) {
    if (!SENSITIVE_PATTERNS.some(p => p.test(key))) {
      filtered[key] = value
    }
  }
  filtered.PATH = env.PATH
  filtered.HOME = env.HOME
  filtered.SHELL = env.SHELL
  filtered.TERM = 'xterm-256color'
  return filtered
}

function pickShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

export class ShellManager {
  private sessions = new Map<string, ShellSession>()
  private counter = 0

  create(options: { cwd?: string; cols?: number; rows?: number } = {}): ShellSession {
    const id = `shell-${++this.counter}`
    const shell = pickShell()
    const args = process.platform === 'win32' ? [] : ['-l']

    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: options.cols || 120,
      rows: options.rows || 36,
      cwd: options.cwd || process.cwd(),
      env: filterEnv(process.env)
    })

    const session: ShellSession = {
      id,
      process: proc,
      cwd: options.cwd || process.cwd(),
      shell,
      createdAt: new Date()
    }

    this.sessions.set(id, session)
    return session
  }

  get(id: string): ShellSession | undefined {
    return this.sessions.get(id)
  }

  getDefault(): ShellSession | undefined {
    const entries = [...this.sessions.values()]
    return entries[entries.length - 1]
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (session && cols > 0 && rows > 0) {
      session.process.resize(cols, rows)
    }
  }

  destroy(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.process.kill()
      this.sessions.delete(id)
    }
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.process.kill()
    }
    this.sessions.clear()
  }
}
