import { BrowserWindow, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

export interface SessionPayload {
  version: number
  savedAt: string
  model: string
  history: string[]
  chatMessages: Array<{ role: string; text: string; at: string }>
}

export async function saveSession(
  payload: SessionPayload,
  mainWindow: BrowserWindow
): Promise<{ canceled: boolean; path?: string }> {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const result = await dialog.showSaveDialog(win, {
    title: 'Save chat session',
    defaultPath: path.join(process.cwd(), 'claude-session.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
  return { canceled: false, path: result.filePath }
}

export async function loadSession(
  mainWindow: BrowserWindow
): Promise<{ canceled: boolean; path?: string; data?: SessionPayload }> {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const result = await dialog.showOpenDialog(win, {
    title: 'Load chat session',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  const filePath = result.filePaths[0]
  const content = await fs.readFile(filePath, 'utf8')
  return { canceled: false, path: filePath, data: JSON.parse(content) }
}
