import * as fs from 'node:fs/promises'
import { openWorkspace } from '../workspace/workspace'
import { generateEntityId } from '../utils/id'
import { formatOutput } from '../cli/output'
import type { Transcript, TranscriptTurn, EntityId } from '../types'

interface TranscriptAttachOptions { format?: string }
interface TranscriptShowOptions { format?: string }
interface TranscriptListOptions { change?: string; session?: string; format?: string }

export async function transcriptAttach(filePath: string, options?: TranscriptAttachOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())

  // Read transcript from file or stdin
  let content: string
  if (filePath === '-') {
    const chunks: Buffer[] = []
    for await (const chunk of Bun.stdin.stream()) {
      chunks.push(Buffer.from(chunk))
    }
    content = Buffer.concat(chunks).toString('utf8')
  } else {
    content = await fs.readFile(filePath, 'utf8')
  }

  // Parse transcript (support JSON format with turns array)
  let turns: TranscriptTurn[]
  let model = 'unknown'
  let summary = ''

  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed.turns)) {
      turns = parsed.turns
      model = parsed.model ?? 'unknown'
      summary = parsed.summary ?? ''
    } else if (Array.isArray(parsed)) {
      turns = parsed.map((t: any) => ({
        role: t.role ?? 'assistant',
        content: typeof t.content === 'string' ? t.content : JSON.stringify(t.content),
        timestamp: t.timestamp ?? new Date().toISOString(),
        toolCalls: t.toolCalls,
      }))
    } else {
      // Single block of text - treat as one assistant turn
      turns = [{ role: 'assistant', content, timestamp: new Date().toISOString() }]
    }
  } catch {
    // Plain text transcript
    turns = [{ role: 'assistant', content, timestamp: new Date().toISOString() }]
  }

  // Store turn content as git blobs
  const blobOids: string[] = []
  for (const turn of turns) {
    const blob = new TextEncoder().encode(JSON.stringify(turn))
    const oid = await ws.gitBackend.writeBlob(blob)
    blobOids.push(oid)
  }

  // Compute token count (rough estimate: ~4 chars per token)
  const totalChars = turns.reduce((sum, t) => sum + t.content.length, 0)
  const tokenCount = Math.ceil(totalChars / 4)

  if (!summary && turns.length > 0) {
    summary = turns[0].content.slice(0, 200) + (turns[0].content.length > 200 ? '...' : '')
  }

  const currentChange = await ws.metadataStore.getChange(ws.config.workingCopyChangeId)
  const parentChangeId = currentChange?.parentChangeIds?.[0]

  const transcript: Transcript = {
    id: generateEntityId(),
    changeIds: parentChangeId ? [parentChangeId] : [],
    sessionId: ws.config.activeSessionId ?? ('' as EntityId),
    turns,
    model,
    tokenCount,
    summary,
    blobOids: blobOids as any[],
    createdAt: new Date().toISOString(),
  }

  await ws.metadataStore.putTranscript(transcript)

  // Link transcript to change
  if (parentChangeId) {
    const change = await ws.metadataStore.getChange(parentChangeId)
    if (change) {
      change.transcriptIds.push(transcript.id)
      await ws.metadataStore.putChange(change)
    }
  }

  // Update session with transcript
  if (ws.config.activeSessionId) {
    const session = await ws.metadataStore.getSession(ws.config.activeSessionId)
    if (session) {
      session.transcriptIds.push(transcript.id)
      await ws.metadataStore.putSession(session)
    }
  }

  // Add git note linking transcript to commit
  if (parentChangeId) {
    const change = await ws.metadataStore.getChange(parentChangeId)
    if (change) {
      const now = Math.floor(Date.now() / 1000)
      await ws.gitBackend.addNote({
        ref: 'refs/notes/vcs/transcripts',
        oid: change.currentCommitOid,
        note: JSON.stringify({ transcriptId: transcript.id, model, tokenCount, summary: summary.slice(0, 100) }),
        author: { name: ws.config.defaultActor.name, email: ws.config.defaultActor.email, timestamp: now, timezoneOffset: new Date().getTimezoneOffset() },
      })
    }
  }

  formatOutput(options?.format, { type: 'transcript-attach', transcriptId: transcript.id, turns: turns.length, tokenCount, model }, () => {
    console.log(`Attached transcript ${transcript.id.slice(0, 8)} (${turns.length} turns, ~${tokenCount} tokens, model: ${model})`)
    if (parentChangeId) console.log(`  linked to change: ${parentChangeId.slice(0, 12)}`)
  })
}

export async function transcriptShow(idPrefix: string, options?: TranscriptShowOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const transcripts = await ws.metadataStore.listTranscripts()
  const transcript = transcripts.find(t => t.id.startsWith(idPrefix))
  if (!transcript) { console.error(`Transcript not found: ${idPrefix}`); return }

  formatOutput(options?.format, { type: 'transcript-show', transcript }, () => {
    console.log(`Transcript: ${transcript.id}`)
    console.log(`Model: ${transcript.model}`)
    console.log(`Tokens: ~${transcript.tokenCount}`)
    console.log(`Changes: ${transcript.changeIds.join(', ') || 'none'}`)
    console.log(`Created: ${transcript.createdAt}`)
    console.log(`Summary: ${transcript.summary}`)
    console.log(`\n--- Turns (${transcript.turns.length}) ---\n`)
    for (const turn of transcript.turns) {
      const role = turn.role.toUpperCase()
      const content = turn.content.length > 500 ? turn.content.slice(0, 500) + '...' : turn.content
      console.log(`[${role}] ${content}\n`)
      if (turn.toolCalls?.length) {
        for (const tc of turn.toolCalls) {
          console.log(`  tool: ${tc.name}`)
        }
      }
    }
  })
}

interface TranscriptSearchOptions { format?: string }

export async function transcriptSearch(query: string, options?: TranscriptSearchOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const transcripts = await ws.metadataStore.listTranscripts()
  const queryLower = query.toLowerCase()

  const matches: Array<{ transcriptId: string; turnIndex: number; role: string; snippet: string }> = []

  for (const t of transcripts) {
    for (let i = 0; i < t.turns.length; i++) {
      const idx = t.turns[i].content.toLowerCase().indexOf(queryLower)
      if (idx !== -1) {
        const start = Math.max(0, idx - 50)
        const end = Math.min(t.turns[i].content.length, idx + query.length + 50)
        const snippet = (start > 0 ? '...' : '') + t.turns[i].content.slice(start, end) + (end < t.turns[i].content.length ? '...' : '')
        matches.push({ transcriptId: t.id, turnIndex: i, role: t.turns[i].role, snippet })
      }
    }
  }

  formatOutput(options?.format, { type: 'transcript-search', query, matches }, () => {
    if (matches.length === 0) { console.log(`No matches for "${query}"`); return }
    console.log(`${matches.length} match(es) for "${query}":\n`)
    for (const m of matches) {
      console.log(`  ${m.transcriptId.slice(0, 8)} turn ${m.turnIndex} [${m.role}]: ${m.snippet}`)
    }
  })
}

export async function transcriptList(options?: TranscriptListOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const filter: { changeId?: any; sessionId?: any } = {}
  if (options?.change) {
    const changes = await ws.metadataStore.listChanges()
    const match = changes.find(c => c.id.startsWith(options.change!))
    if (match) filter.changeId = match.id
  }
  if (options?.session) filter.sessionId = options.session as EntityId

  const transcripts = await ws.metadataStore.listTranscripts(filter)
  transcripts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  formatOutput(options?.format, { type: 'transcript-list', transcripts: transcripts.map(t => ({ id: t.id, model: t.model, tokenCount: t.tokenCount, turns: t.turns.length, summary: t.summary, createdAt: t.createdAt })) }, () => {
    if (transcripts.length === 0) { console.log('No transcripts.'); return }
    for (const t of transcripts) {
      console.log(`  ${t.id.slice(0, 8)} | ${t.model} | ${t.turns.length} turns | ~${t.tokenCount} tokens | ${t.summary.slice(0, 60)}`)
    }
  })
}
