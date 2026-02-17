import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'
import type { Change } from '../types'

interface LogOptions { zoom?: string; showTranscripts?: boolean; format?: string }

export async function log(options?: LogOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const zoom = options?.zoom ?? 'change'

  if (zoom === 'session') {
    const sessions = await ws.metadataStore.listSessions()
    sessions.sort((a: any, b: any) => b.startedAt.localeCompare(a.startedAt))
    formatOutput(options?.format, { type: 'log', zoom: 'session', entries: sessions }, () => {
      if (sessions.length === 0) { console.log('No sessions yet.'); return }
      for (const s of sessions) {
        const st = s.status === 'active' ? '*' : s.status === 'completed' ? '+' : '-'
        console.log(`${st} ${s.id.slice(0, 8)} "${s.objective}" (${s.taskIds.length} tasks, ${s.changeIds.length} changes)`)
      }
    })
    return
  }

  if (zoom === 'task') {
    const tasks = await ws.metadataStore.listTasks()
    tasks.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
    formatOutput(options?.format, { type: 'log', zoom: 'task', entries: tasks }, () => {
      if (tasks.length === 0) { console.log('No tasks yet.'); return }
      for (const t of tasks) {
        const st = t.status === 'in_progress' ? '*' : t.status === 'completed' ? '+' : t.status === 'failed' ? '!' : '-'
        console.log(`${st} ${t.id.slice(0, 8)} "${t.description}" (${t.changeIds.length} changes)`)
      }
    })
    return
  }

  // Default: change-level log
  const changes = await ws.metadataStore.listChanges()
  const bookmarks = await ws.metadataStore.listBookmarks()
  changes.sort((a: Change, b: Change) => b.updatedAt.localeCompare(a.updatedAt))

  formatOutput(options?.format, {
    type: 'log', zoom: 'change',
    entries: changes.map((c: Change) => ({
      changeId: c.id, commitOid: c.currentCommitOid, description: c.description,
      sessionId: c.sessionId, taskId: c.taskId, labels: c.labels,
      isWorkingCopy: c.id === ws.config.workingCopyChangeId, parentChangeIds: c.parentChangeIds, createdAt: c.createdAt,
    })),
  }, async () => {
    if (changes.length === 0) { console.log('No changes yet.'); return }
    for (const change of changes) {
      const isWc = change.id === ws.config.workingCopyChangeId
      const marker = isWc ? '@' : 'o'
      const bms = bookmarks.filter(b => b.changeId === change.id).map(b => b.name)
      const bmStr = bms.length > 0 ? ` (${bms.join(', ')})` : ''
      const labels = change.labels.length > 0 ? ` [${change.labels.join(', ')}]` : ''
      console.log(`${marker} ${change.id.slice(0, 12)} ${change.currentCommitOid.slice(0, 8)}${bmStr}${labels} | ${change.description}`)
      if (options?.showTranscripts && change.transcriptIds.length > 0) {
        for (const tid of change.transcriptIds) {
          const t = await ws.metadataStore.getTranscript(tid)
          if (t) console.log(`    transcript: ${tid.slice(0, 8)} (${t.turns.length} turns, ${t.model})`)
        }
      }
    }
  })
}
