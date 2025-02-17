import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electronAPI', {
      processVideo: (path: string) => ipcRenderer.invoke('process-video', path),
      cleanupFrames: () => ipcRenderer.invoke('cleanup-frames'),
      onProgress: (callback: (progress: number) => void) => {
        ipcRenderer.on('video-progress', (_, progress) => callback(progress))
      },
      removeProgressListener: () => {
        ipcRenderer.removeAllListeners('video-progress')
      },
      getTheme: () => ipcRenderer.invoke('get-theme'),
      setTheme: (theme: 'system' | 'light' | 'dark') => ipcRenderer.invoke('set-theme', theme)
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
