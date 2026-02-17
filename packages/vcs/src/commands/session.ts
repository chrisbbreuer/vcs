import { text } from '@stacksjs/clapp'
import { openWorkspace } from '../workspace/workspace'
import { generateEntityId } from '../utils/id'
import { formatOutput } from '../cli/output'
import { NoActiveSessionError } from '../errors'
import type { Session, EntityId } from '../types'

interface SessionStartOptions { message?: string; model?: string; tool?: string; format?: string }
interface SessionEndOptions { format?: string }
interface SessionListOptions { format?: string }
interface SessionShowOptions { format?: string }

export async function sessionStart(options?: SessionStartOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  let objective = options?.message
  if (!objective) {
    objective = await text({ message: 'Session objective:', validate: (v: string) => v.length > 0 ? undefined : 'Objective is required' }) as string
  }

  const session: Session = {
    id: generateEntityId(),
    objective,
    taskIds: [],
    changeIds: [],
    transcriptIds: [],
    status: 'active',
    environment: { model: options?.model, tool: options?.tool, cwd: process.cwd() },
    startedAt: new Date().toISOString(),
    endedAt: null,
  }

  await ws.metadataStore.putSession(session)
  ws.config.activeSessionId = session.id
  await ws.metadataStore.putConfig(ws.config)

  formatOutput(options?.format, { type: 'session-start', sessionId: session.id, objective }, () => {
    console.log(`Started session ${session.id.slice(0, 8)}: "${objective}"`)
  })
}

export async function sessionEnd(options?: SessionEndOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  if (!ws.config.activeSessionId) throw new NoActiveSessionError()

  const session = await ws.metadataStore.getSession(ws.config.activeSessionId)
  if (!session) throw new NoActiveSessionError()

  session.status = 'completed'
  session.endedAt = new Date().toISOString()
  await ws.metadataStore.putSession(session)

  ws.config.activeSessionId = null
  ws.config.activeTaskId = null
  await ws.metadataStore.putConfig(ws.config)

  formatOutput(options?.format, { type: 'session-end', sessionId: session.id, objective: session.objective }, () => {
    console.log(`Ended session ${session.id.slice(0, 8)}: "${session.objective}"`)
    console.log(`  changes: ${session.changeIds.length}, tasks: ${session.taskIds.length}`)
  })
}

export async function sessionList(options?: SessionListOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const sessions = await ws.metadataStore.listSessions()
  sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  formatOutput(options?.format, { type: 'session-list', sessions }, () => {
    if (sessions.length === 0) { console.log('No sessions.'); return }
    for (const s of sessions) {
      const active = ws.config.activeSessionId === s.id ? ' (active)' : ''
      const st = s.status === 'active' ? '*' : s.status === 'completed' ? '+' : '-'
      console.log(`${st} ${s.id.slice(0, 8)}${active} "${s.objective}"`)
      console.log(`    ${s.taskIds.length} tasks, ${s.changeIds.length} changes, ${s.transcriptIds.length} transcripts`)
    }
  })
}

export async function sessionShow(sessionIdPrefix: string, options?: SessionShowOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const sessions = await ws.metadataStore.listSessions()
  const session = sessions.find(s => s.id.startsWith(sessionIdPrefix))
  if (!session) { console.error(`Session not found: ${sessionIdPrefix}`); return }

  const tasks = await ws.metadataStore.listTasks(session.id)
  const transcripts = await ws.metadataStore.listTranscripts({ sessionId: session.id })

  formatOutput(options?.format, { type: 'session-show', session, tasks, transcripts }, () => {
    console.log(`Session: ${session.id}`)
    console.log(`Status:  ${session.status}`)
    console.log(`Objective: ${session.objective}`)
    console.log(`Started: ${session.startedAt}`)
    if (session.endedAt) console.log(`Ended:   ${session.endedAt}`)
    if (session.environment.model) console.log(`Model:   ${session.environment.model}`)
    if (session.environment.tool) console.log(`Tool:    ${session.environment.tool}`)
    console.log(`\nTasks (${tasks.length}):`)
    for (const t of tasks) {
      const st = t.status === 'in_progress' ? '*' : t.status === 'completed' ? '+' : t.status === 'failed' ? '!' : '-'
      console.log(`  ${st} ${t.id.slice(0, 8)} "${t.description}" (${t.changeIds.length} changes)`)
    }
    console.log(`\nChanges: ${session.changeIds.length}`)
    console.log(`Transcripts: ${transcripts.length}`)
  })
}
