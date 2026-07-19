import { estimateCost, pricing, type PricingModel } from './pricing'
import { SNAPSHOT_SCHEMA_VERSION, type AnalysisSnapshot, type ConversationRow, type DailyRow, type HistogramBin, type MonthlyRow, type TokenizedConversation } from './types'

type Bucket = { prompts: number; assistantReplies: number; inputTokens: number; outputTokens: number; conversations: Set<string> }
const emptyBucket = (): Bucket => ({ prompts: 0, assistantReplies: 0, inputTokens: 0, outputTokens: 0, conversations: new Set() })
const datePart = (timestamp: string | null, length: number) => timestamp?.slice(0, length) ?? null
const byTimestamp = (values: (string | null)[]) => values.filter((value): value is string => value !== null).sort()

export function conversationHistogram(values: number[]): HistogramBin[] {
  if (!values.length) return []
  const min = Math.min(...values); const max = Math.max(...values)
  if (min === max) return [{ lowerBound: min, upperBound: max, conversations: values.length }]
  const width = (max - min) / 30
  const bins = Array.from({ length: 30 }, (_, index) => ({ lowerBound: min + index * width, upperBound: min + (index + 1) * width, conversations: 0 }))
  for (const value of values) {
    const index = value === max ? 29 : Math.min(29, Math.floor((value - min) / width))
    bins[index].conversations += 1
  }
  return bins
}

export class AnalyticsAccumulator {
  private readonly seen = new Set<string>()
  private readonly totals = { conversations: 0, prompts: 0, assistantReplies: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  private readonly inventory = { apiInputTokens: 0, apiOutputTokens: 0, apiTotalTokens: 0, recapNodes: 0, recapTokens: 0, internalArtifactNodes: 0 }
  private readonly monthly = new Map<string, Bucket>()
  private readonly daily = new Map<string, Bucket>()
  private readonly rows: ConversationRow[] = []
  private readonly conversationTotals: number[] = []
  private longestPromptCharacters = 0
  private longestReplyCharacters = 0

  add(conversation: TokenizedConversation): boolean {
    if (this.seen.has(conversation.id)) return false
    this.seen.add(conversation.id)
    const user = conversation.messages.filter((message) => message.role === 'user')
    const assistant = conversation.messages.filter((message) => message.role === 'assistant')
    const inputTokens = user.reduce((total, message) => total + message.tokens, 0)
    const outputTokens = assistant.reduce((total, message) => total + message.tokens, 0)
    const totalTokens = inputTokens + outputTokens
    const counts = conversation.messages.map((message) => message.tokens)
    const timestamps = byTimestamp(conversation.messages.map((message) => message.timestamp))
    const costsByModel = Object.fromEntries(pricing.map((model) => [model.name, estimateCost(inputTokens, outputTokens, model)]))
    this.rows.push({ title: conversation.title, firstMessageAt: timestamps[0] ?? conversation.createdAt, lastMessageAt: timestamps.at(-1) ?? conversation.updatedAt, userTurns: user.length, assistantTurns: assistant.length, inputTokens, outputTokens, totalTokens, averageMessageTokens: counts.length ? inputTokens + outputTokens ? (inputTokens + outputTokens) / counts.length : 0 : 0, largestMessageTokens: Math.max(0, ...counts), estimatedCost: estimateCost(inputTokens, outputTokens, pricing[0]), costsByModel })
    this.totals.conversations += 1; this.totals.prompts += user.length; this.totals.assistantReplies += assistant.length; this.totals.inputTokens += inputTokens; this.totals.outputTokens += outputTokens; this.totals.totalTokens += totalTokens
    this.inventory.recapNodes += conversation.recapNodes; this.inventory.recapTokens += conversation.recapTokens; this.inventory.internalArtifactNodes += conversation.internalArtifactNodes
    this.conversationTotals.push(totalTokens)
    for (const message of conversation.messages) {
      if (message.role === 'user') this.longestPromptCharacters = Math.max(this.longestPromptCharacters, message.characters)
      else this.longestReplyCharacters = Math.max(this.longestReplyCharacters, message.characters)
      const day = datePart(message.timestamp, 10); const month = datePart(message.timestamp, 7)
      for (const [key, target] of [[day, this.daily], [month, this.monthly]] as const) {
        if (!key) continue
        const bucket = target.get(key) ?? emptyBucket(); target.set(key, bucket); bucket.conversations.add(conversation.id)
        if (message.role === 'user') { bucket.prompts += 1; bucket.inputTokens += message.tokens } else { bucket.assistantReplies += 1; bucket.outputTokens += message.tokens }
      }
    }
    this.inventory.apiInputTokens = this.totals.inputTokens; this.inventory.apiOutputTokens = this.totals.outputTokens; this.inventory.apiTotalTokens = this.totals.totalTokens
    return true
  }

  finalize(source: AnalysisSnapshot['source'], analyzedAt = new Date().toISOString(), models: PricingModel[] = pricing): AnalysisSnapshot {
    const monthly: MonthlyRow[] = [...this.monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, bucket]) => ({ month, conversations: bucket.conversations.size, prompts: bucket.prompts, assistantReplies: bucket.assistantReplies, inputTokens: bucket.inputTokens, outputTokens: bucket.outputTokens, totalTokens: bucket.inputTokens + bucket.outputTokens, estimatedCost: estimateCost(bucket.inputTokens, bucket.outputTokens, models[0]) }))
    let cumulativeTokens = 0; let cumulativeEstimatedCost = 0
    const daily: DailyRow[] = [...this.daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, bucket]) => {
      const totalTokens = bucket.inputTokens + bucket.outputTokens; const estimatedCost = estimateCost(bucket.inputTokens, bucket.outputTokens, models[0]); cumulativeTokens += totalTokens; cumulativeEstimatedCost += estimatedCost
      return { day, prompts: bucket.prompts, assistantReplies: bucket.assistantReplies, inputTokens: bucket.inputTokens, outputTokens: bucket.outputTokens, totalTokens, estimatedCost, cumulativeTokens, cumulativeEstimatedCost }
    })
    const sortedTotals = [...this.conversationTotals].sort((a, b) => a - b)
    const middle = Math.floor(sortedTotals.length / 2)
    const median = !sortedTotals.length ? 0 : sortedTotals.length % 2 ? sortedTotals[middle] : (sortedTotals[middle - 1] + sortedTotals[middle]) / 2
    const longest = this.rows.reduce<ConversationRow | undefined>((best, row) => !best || row.totalTokens > best.totalTokens ? row : best, undefined)
    return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, analyzedAt, source, totals: { ...this.totals }, inventory: { ...this.inventory }, summaryByModel: models.map((model) => ({ model: model.name, inputTokens: this.totals.inputTokens, outputTokens: this.totals.outputTokens, totalTokens: this.totals.totalTokens, estimatedCost: estimateCost(this.totals.inputTokens, this.totals.outputTokens, model) })), monthly, daily, conversationHistogram: conversationHistogram(this.conversationTotals), metrics: { averageConversationTokens: this.conversationTotals.length ? this.totals.totalTokens / this.conversationTotals.length : 0, medianConversationTokens: median, longestConversationTitle: longest?.title ?? '—', longestPromptCharacters: this.longestPromptCharacters, longestReplyCharacters: this.longestReplyCharacters, topDays: [...daily].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 10) }, topConversations: [...this.rows].sort((a, b) => b.estimatedCost - a.estimatedCost).slice(0, 100) }
  }
}
