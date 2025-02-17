import { ElectronAPI } from '@electron-toolkit/preload'

export interface ElectronAPI {
  processVideo: (path: string) => Promise<FrameInfo[]>
  cleanupFrames: () => Promise<void>
  onProgress: (callback: (progress: number) => void) => void
  removeProgressListener: () => void
  getTheme: () => Promise<'system' | 'light' | 'dark'>
  setTheme: (theme: 'system' | 'light' | 'dark') => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    electronAPI: ElectronAPI
  }
}
