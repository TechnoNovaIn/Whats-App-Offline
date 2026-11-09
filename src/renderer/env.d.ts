/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI: import('../shared/types').ElectronAPI;
  }
}
