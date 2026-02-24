import { execFile } from 'child_process'

export interface ClaudeCheckResult {
  installed: boolean
  version?: string
  path?: string
  detail: string
  checkedAt: Date
}

function pickShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

export class ClaudeDetector {
  private cachedResult: ClaudeCheckResult | null = null
  private readonly CACHE_TTL = 60_000

  async check(force = false): Promise<ClaudeCheckResult> {
    if (!force && this.cachedResult) {
      const elapsed = Date.now() - this.cachedResult.checkedAt.getTime()
      if (elapsed < this.CACHE_TTL) return this.cachedResult
    }

    const result = await this.detectClaude()
    this.cachedResult = result
    return result
  }

  private detectClaude(): Promise<ClaudeCheckResult> {
    return new Promise((resolve) => {
      const now = new Date()

      if (process.platform === 'win32') {
        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            "$cmd = Get-Command claude -ErrorAction SilentlyContinue; if ($cmd) { Write-Output ('__FOUND__' + $cmd.Path); claude --version }"
          ],
          { timeout: 7000 },
          (error, stdout, stderr) => {
            if (error || !stdout.includes('__FOUND__')) {
              resolve({
                installed: false,
                detail: (stderr || error?.message || 'claude command not found').trim(),
                checkedAt: now
              })
              return
            }
            const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
            const foundLine = lines.find(l => l.startsWith('__FOUND__'))
            const commandPath = foundLine ? foundLine.replace('__FOUND__', '') : 'unknown'
            const versionLine = lines.find(l => !l.startsWith('__FOUND__')) || 'version unknown'
            resolve({
              installed: true,
              path: commandPath,
              detail: `${versionLine} @ ${commandPath}`,
              checkedAt: now
            })
          }
        )
        return
      }

      const shell = pickShell()
      execFile(
        shell,
        ['-ilc', 'command -v claude >/dev/null 2>&1 && echo "__FOUND__$(command -v claude)" && claude --version'],
        { timeout: 7000 },
        (error, stdout, stderr) => {
          if (error || !stdout.includes('__FOUND__')) {
            resolve({
              installed: false,
              detail: (stderr || error?.message || 'claude command not found in login shell PATH').trim(),
              checkedAt: now
            })
            return
          }
          const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
          const foundLine = lines.find(l => l.startsWith('__FOUND__'))
          const commandPath = foundLine ? foundLine.replace('__FOUND__', '') : 'unknown'
          const versionLine = lines.find(l => !l.startsWith('__FOUND__')) || 'version unknown'
          resolve({
            installed: true,
            path: commandPath,
            detail: `${versionLine} @ ${commandPath}`,
            checkedAt: now
          })
        }
      )
    })
  }
}
