import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import { ShellManager } from './shell-manager'
import { ClaudeDetector } from './claude-detector'
import { registerAllHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null
const shellManager = new ShellManager()
const claudeDetector = new ClaudeDetector()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    title: 'Claude Code GUI',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  registerAllHandlers(shellManager, claudeDetector, mainWindow!)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  shellManager.destroyAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
