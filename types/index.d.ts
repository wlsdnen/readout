export type AgentStatus = 'running' | 'idle' | 'done'

export type AgentNode = {
  id: string
  parent?: string
  type: string
  description: string
  status: AgentStatus
  currentTool?: string
  toolCount: number
  startedAt: number
  endedAt?: number
}

export type JobView = {
  name: string
  stage: string
  pct?: number
  msg: string
  updatedAt: number
  metric?: string
  series: number[]
}

export type TurnRecord = {
  startedAt: number
  files: string[]
  toolErrors: number
}

export type CardHead = { title: string; status: string; verdict: string }

export type Board = {
  agents: Record<string, AgentNode>
  jobs: JobView[]
  now: number
  turn?: TurnRecord
  lastCard?: CardHead
}

declare module 'claude-code' {
  interface PluginState {
    'readout': { board: Shaped<Board> }
  }
}
