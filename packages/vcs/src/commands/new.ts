import { openWorkspace } from '../workspace/workspace'
import { generateChangeId } from '../utils/id'
import { formatOutput } from '../cli/output'
import { ChangeNotFoundError } from '../errors'
import type { Change, ChangeId } from '../types'

interface NewOptions { format?: string }

export async function newChange(parentPrefix?: string, options?: NewOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  let parentChangeId: ChangeId
  if (parentPrefix) {
    const allChanges = await ws.metadataStore.listChanges()
    const match = allChanges.find(c => c.id.startsWith(parentPrefix))
    if (!match) throw new ChangeNotFoundError(parentPrefix)
    parentChangeId = match.id
  } else {
    const wc = await ws.metadataStore.getChange(ws.config.workingCopyChangeId)
    parentChangeId = wc?.parentChangeIds?.[0] ?? ws.config.workingCopyChangeId
  }

  const parent = await ws.metadataStore.getChange(parentChangeId)
  if (!parent) throw new ChangeNotFoundError(parentChangeId)

  const newId = generateChangeId()
  const newChange: Change = {
    id: newId, currentCommitOid: parent.currentCommitOid, predecessors: [], dependsOn: [],
    parentChangeIds: [parentChangeId], sessionId: ws.config.activeSessionId, taskId: ws.config.activeTaskId,
    transcriptIds: [], description: '(empty change)', labels: [], abandoned: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  await ws.metadataStore.putChange(newChange)

  // Switch working copy to the new change
  ws.config.workingCopyChangeId = newId
  await ws.metadataStore.putConfig(ws.config)
  await ws.finalize()

  formatOutput(options?.format, { type: 'new', changeId: newId, parentChangeId }, () => {
    console.log(`Created new change ${newId.slice(0, 12)} on top of ${parentChangeId.slice(0, 12)}`)
  })
}
