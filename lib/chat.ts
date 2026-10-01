export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'status'
  content: string
  tone?: 'info' | 'success' | 'error'
  createdAt?: number
  /** Clarification questions → rendered as one-click reply chips */
  questions?: string[]
}

export type ConsoleLine = {
  id: string
  at: number
  level: 'info' | 'ok' | 'warn' | 'error'
  text: string
}
