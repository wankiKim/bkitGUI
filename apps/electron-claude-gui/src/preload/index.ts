import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('desktopAPI', {
  // Terminal
  startTerminal: (options?: { cwd?: string; cols?: number; rows?: number }) =>
    ipcRenderer.invoke('terminal:start', options),
  writeTerminal: (data: string) =>
    ipcRenderer.invoke('terminal:write', data),
  resizeTerminal: (cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', cols, rows),
  stopTerminal: () =>
    ipcRenderer.invoke('terminal:stop'),

  // Terminal Events (returns cleanup function - S-03 fix)
  onTerminalData: (handler: (data: string) => void): (() => void) => {
    const wrapper = (_: IpcRendererEvent, data: string) => handler(data)
    ipcRenderer.on('terminal:data', wrapper)
    return () => ipcRenderer.removeListener('terminal:data', wrapper)
  },
  onTerminalExit: (handler: () => void): (() => void) => {
    const wrapper = () => handler()
    ipcRenderer.on('terminal:exit', wrapper)
    return () => ipcRenderer.removeListener('terminal:exit', wrapper)
  },

  // Claude
  checkClaude: (force?: boolean) =>
    ipcRenderer.invoke('claude:check', force),

  // App
  appMeta: () =>
    ipcRenderer.invoke('app:meta'),

  // Session
  saveSession: (payload: unknown) =>
    ipcRenderer.invoke('session:save', payload),
  loadSession: () =>
    ipcRenderer.invoke('session:load'),

  // PDCA (new)
  readPdcaStatus: () =>
    ipcRenderer.invoke('pdca:read-status'),
  readFile: (relativePath: string) =>
    ipcRenderer.invoke('fs:read-file', relativePath)
})
