export type Task = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  doneAt?: number
}

export type Run = {
  isRunning: boolean
  startedAt: number
  endedAt: number
  /** 目前在跑的工具與參數摘要 */
  current: string
  tasks: Task[]
}

declare module 'claude-code' {
  interface PluginState {
    'progress-band': { run: Run | null; now: number; isHidden: boolean }
  }
}
