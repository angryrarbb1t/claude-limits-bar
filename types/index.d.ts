export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'limits-bar': { windows: Limit[]; now: number; ratio: number; seam: 'none' | 'near' | 'drag'; flash: Record<string, number>; design: number; ctx: number }
  }
}
