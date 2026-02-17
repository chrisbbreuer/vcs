import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'
import type { Change, Session, Task, Transcript } from '../types'

interface ContextOptions { zoom?: string; tokenBudget?: string; format?: string }

export async function context(options?: ContextOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const zoom = options?.zoom ?? 'change'
  const tokenBudget = options?.tokenBudget ? parseInt(options.tokenBudget, 10) : undefined

  const result: Record<string, any> = { type: 'context', zoom }

  if (zoom === 'session' && ws.config.activeSessionId) {
    const session = await ws.metadataStore.getSession(ws.config.activeSessionId)
    if (session) {
      result.session = { id: session.id, objective: session.objective, status: session.status, environment: session.environment }
      const tasks = await ws.metadataStore.listTasks(session.id)
      result.tasks = tasks.map(t => ({ id: t.id, description: t.description, status: t.status, changeCount: t.changeIds.length }))
      result.changeCount = session.changeIds.length
      result.transcriptCount = session.transcriptIds.length
    }
  } else if (zoom === 'task' && ws.config.activeTaskId) {
    const task = await ws.metadataStore.getTask(ws.config.activeTaskId)
    if (task) {
      result.task = { id: task.id, description: task.description, status: task.status }
      const changes: any[] = []
      for (const cid of task.changeIds) {
        const c = await ws.metadataStore.getChange(cid)
        if (c) changes.push({ id: c.id, description: c.description, commitOid: c.currentCommitOid })
      }
      result.changes = changes
      const transcripts = await ws.metadataStore.listTranscripts({ sessionId: task.sessionId })
      result.transcripts = transcripts.filter(t => t.changeIds.some(cid => task.changeIds.includes(cid)))
        .map(t => ({ id: t.id, model: t.model, tokenCount: t.tokenCount, summary: t.summary }))
    }
  } else {
    // Change-level context
    const currentChange = await ws.metadataStore.getChange(ws.config.workingCopyChangeId)
    const parentChangeId = currentChange?.parentChangeIds?.[0]
    const parentChange = parentChangeId ? await ws.metadataStore.getChange(parentChangeId) : null

    result.workingCopyChangeId = ws.config.workingCopyChangeId
    if (parentChange) {
      result.parentChange = { id: parentChange.id, description: parentChange.description, commitOid: parentChange.currentCommitOid }
      if (parentChange.transcriptIds.length > 0) {
        const transcripts: any[] = []
        for (const tid of parentChange.transcriptIds) {
          const t = await ws.metadataStore.getTranscript(tid)
          if (t) {
            let turns = t.turns
            // Apply token budget if specified
            if (tokenBudget) {
              let budget = tokenBudget
              const trimmed: typeof turns = []
              for (const turn of turns) {
                const turnTokens = Math.ceil(turn.content.length / 4)
                if (budget <= 0) break
                if (turnTokens > budget) {
                  trimmed.push({ ...turn, content: turn.content.slice(0, budget * 4) + '... (truncated)' })
                  break
                }
                trimmed.push(turn)
                budget -= turnTokens
              }
              turns = trimmed
            }
            transcripts.push({ id: t.id, model: t.model, tokenCount: t.tokenCount, summary: t.summary, turns })
          }
        }
        result.transcripts = transcripts
      }
    }
    if (ws.config.activeSessionId) {
      const session = await ws.metadataStore.getSession(ws.config.activeSessionId)
      if (session) result.activeSession = { id: session.id, objective: session.objective }
    }
    if (ws.config.activeTaskId) {
      const task = await ws.metadataStore.getTask(ws.config.activeTaskId)
      if (task) result.activeTask = { id: task.id, description: task.description }
    }
  }

  // Context is primarily for agents, so default to JSON
  const format = options?.format ?? 'json'
  formatOutput(format, result, () => {
    console.log(JSON.stringify(result, null, 2))
  })
}
