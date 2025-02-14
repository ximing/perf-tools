import { ElectronAPI } from '@electron-toolkit/preload'

export interface ElectronAPI {
  processVideo: (path: string) => Promise<FrameInfo[]>
  cleanupFrames: () => Promise<void>
  onProgress: (callback: (progress: number) => void) => void
  removeProgressListener: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    electronAPI: ElectronAPI
  }
}
