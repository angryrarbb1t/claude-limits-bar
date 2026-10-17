export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'limits-bar': { windows: Limit[]; now: number; ratio: number; isHover: boolean }
  }
}
