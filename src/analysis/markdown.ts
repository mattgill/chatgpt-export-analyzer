import type { ParsedConversation } from './parser'

export interface MarkdownConversation { filename: string; contents: string }

function slug(value: string): string {
  const result = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72)
  return result || 'untitled-conversation'
}

export function markdownConversation(conversation: ParsedConversation): MarkdownConversation {
  const date = conversation.createdAt ?? conversation.updatedAt
  const prefix = date ? date.slice(0, 10) : 'undated'
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(conversation.title)}`,
    `conversation_id: ${JSON.stringify(conversation.id)}`,
    `created_at: ${conversation.createdAt ?? 'null'}`,
    `updated_at: ${conversation.updatedAt ?? 'null'}`,
    '---',
  ]
  const body = conversation.messages.flatMap((message) => [
    `## ${message.role === 'user' ? 'User' : 'Assistant'}${message.timestamp ? ` — ${message.timestamp}` : ''}`,
    '',
    message.text,
    '',
  ])
  return { filename: `${prefix}-${slug(conversation.title)}.md`, contents: [...frontmatter, '', `# ${conversation.title}`, '', ...body].join('\n').trimEnd() + '\n' }
}
