import { openWorkspace } from '../workspace/workspace'
import { getWorkingCopyChanges } from '../workspace/diff'
import { formatOutput } from '../cli/output'

interface StatusOptions { format?: string }

export async function status(options?: StatusOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const fileChanges = await getWorkingCopyChanges(ws.gitBackend)
  const parentChangeId = (await ws.metadataStore.getChange(ws.config.workingCopyChangeId))?.parentChangeIds?.[0]
  const parentChange = parentChangeId ? await ws.metadataStore.getChange(parentChangeId) : null
  const sessionInfo = ws.config.activeSessionId ? await ws.metadataStore.getSession(ws.config.activeSessionId) : null
  const taskInfo = ws.config.activeTaskId ? await ws.metadataStore.getTask(ws.config.activeTaskId) : null

  formatOutput(options?.format, {
    type: 'status', workingCopyChangeId: ws.config.workingCopyChangeId,
    parentChangeId: parentChangeId ?? null, parentDescription: parentChange?.description ?? null,
    activeSession: sessionInfo ? { id: sessionInfo.id, objective: sessionInfo.objective } : null,
    activeTask: taskInfo ? { id: taskInfo.id, description: taskInfo.description } : null,
    fileChanges,
  }, () => {
    console.log(`Working copy change: ${ws.config.workingCopyChangeId.slice(0, 12)}`)
    if (parentChange) console.log(`Parent change: ${parentChangeId!.slice(0, 12)} ${parentChange.description}`)
    if (sessionInfo) console.log(`Active session: ${sessionInfo.id.slice(0, 8)} "${sessionInfo.objective}"`)
    if (taskInfo) console.log(`Active task: ${taskInfo.id.slice(0, 8)} "${taskInfo.description}"`)
    if (fileChanges.length === 0) {
      console.log('\nNothing modified (clean working copy)')
    } else {
      console.log(`\n${fileChanges.length} file(s) changed:`)
      for (const fc of fileChanges) {
        const sym = fc.status === 'added' ? 'A' : fc.status === 'modified' ? 'M' : fc.status === 'deleted' ? 'D' : '?'
        console.log(`  ${sym} ${fc.filepath}`)
      }
    }
  })
}
