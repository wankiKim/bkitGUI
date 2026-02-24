import { ipcMain, BrowserWindow, session } from 'electron'
import * as os from 'os'
import * as fs from 'fs/promises'
import * as path from 'path'
import { ShellManager } from './shell-manager'
import { ClaudeDetector } from './claude-detector'
import { saveSession, loadSession } from './session-io'

export function registerAllHandlers(
  shellManager: ShellManager,
  claudeDetector: ClaudeDetector,
  mainWindow: BrowserWindow
): void {
  // --- Terminal ---
  ipcMain.handle('terminal:start', (_, payload: { cwd?: string; cols?: number; rows?: number } = {}) => {
    const existing = shellManager.getDefault()
    if (existing) {
      shellManager.destroy(existing.id)
    }

    const sess = shellManager.create(payload)

    sess.process.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', data)
      }
    })

    sess.process.onExit(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit')
      }
      shellManager.destroy(sess.id)
    })

    return { id: sess.id, shell: sess.shell, cwd: sess.cwd }
  })

  ipcMain.handle('terminal:write', (_, data: string) => {
    const sess = shellManager.getDefault()
    if (sess) sess.process.write(data)
    return true
  })

  ipcMain.handle('terminal:resize', (_, cols: number, rows: number) => {
    const sess = shellManager.getDefault()
    if (sess && cols > 0 && rows > 0) {
      sess.process.resize(cols, rows)
    }
    return true
  })

  ipcMain.handle('terminal:stop', () => {
    const sess = shellManager.getDefault()
    if (sess) shellManager.destroy(sess.id)
    return true
  })

  // --- Claude ---
  ipcMain.handle('claude:check', async (_, force?: boolean) => {
    return claudeDetector.check(force)
  })

  // --- App ---
  ipcMain.handle('app:meta', () => ({
    platform: process.platform,
    home: os.homedir(),
    cwd: process.cwd()
  }))

  // --- Session ---
  ipcMain.handle('session:save', async (_, payload) => {
    return saveSession(payload, mainWindow)
  })

  ipcMain.handle('session:load', async () => {
    return loadSession(mainWindow)
  })

  // --- PDCA (new) ---
  ipcMain.handle('pdca:read-status', async () => {
    const statusPath = path.join(process.cwd(), 'docs/.pdca-status.json')
    try {
      const content = await fs.readFile(statusPath, 'utf8')
      return JSON.parse(content)
    } catch {
      return null
    }
  })

  // --- File read (for PDCA doc preview) ---
  ipcMain.handle('fs:read-file', async (_, relativePath: string) => {
    const resolved = path.resolve(process.cwd(), relativePath)
    if (!resolved.startsWith(process.cwd())) {
      throw new Error('Access denied: path traversal detected')
    }
    try {
      return await fs.readFile(resolved, 'utf8')
    } catch {
      return null
    }
  })

  // --- CSP (S-02) ---
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "font-src 'self'; " +
          "img-src 'self' data:; " +
          "connect-src 'self'"
        ]
      }
    })
  })
}
