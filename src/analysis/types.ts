export const SNAPSHOT_SCHEMA_VERSION = 1 as const

export type Role = 'user' | 'assistant'

export interface TokenizedMessage {
  role: Role
  tokens: number
  characters: number
  timestamp: string | null
  model: string | null
}

export interface TokenizedConversation {
  id: string
  title: string
  createdAt: string | null
  updatedAt: string | null
  messages: TokenizedMessage[]
  recapTokens: number
  recapNodes: number
  internalArtifactNodes: number
}

export interface Totals {
  conversations: number
  prompts: number
  assistantReplies: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface Inventory {
  apiInputTokens: number
  apiOutputTokens: number
  apiTotalTokens: number
  recapNodes: number
  recapTokens: number
  internalArtifactNodes: number
}

export interface CostRow {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
}

export interface MonthlyRow {
  month: string
  conversations: number
  prompts: number
  assistantReplies: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
}

export interface DailyRow {
  day: string
  prompts: number
  assistantReplies: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
  cumulativeTokens: number
  cumulativeEstimatedCost: number
}

export interface HistogramBin { lowerBound: number; upperBound: number; conversations: number }

export interface ConversationRow {
  title: string
  firstMessageAt: string | null
  lastMessageAt: string | null
  userTurns: number
  assistantTurns: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  averageMessageTokens: number
  largestMessageTokens: number
  estimatedCost: number
  costsByModel: Record<string, number>
}

export interface Metrics {
  averageConversationTokens: number
  medianConversationTokens: number
  longestConversationTitle: string
  longestPromptCharacters: number
  longestReplyCharacters: number
  topDays: DailyRow[]
}

export interface AnalysisSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION
  analyzedAt: string
  source: { name: string; compressedBytes: number; conversationParts: number }
  totals: Totals
  inventory: Inventory
  summaryByModel: CostRow[]
  monthly: MonthlyRow[]
  daily: DailyRow[]
  conversationHistogram: HistogramBin[]
  metrics: Metrics
  topConversations: ConversationRow[]
}
