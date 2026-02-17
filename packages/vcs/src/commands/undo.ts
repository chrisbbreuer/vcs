import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'

interface UndoOptions { format?: string }

export async function undo(options?: UndoOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const operations = await ws.metadataStore.listOperations(2)

  if (operations.length < 2) {
    console.log('Nothing to undo.')
    return
  }

  const lastOp = operations[0]
  // Restore refs from snapshotBefore
  for (const [ref, oid] of Object.entries(lastOp.snapshotBefore)) {
    if (oid) {
      await ws.gitBackend.writeRef(`refs/heads/${ref === 'HEAD' ? 'main' : ref}`, oid)
    }
  }

  ws.config.operationHead = operations[1].id
  await ws.metadataStore.putConfig(ws.config)
  await ws.finalize()

  formatOutput(options?.format, { type: 'undo', undoneOperation: lastOp.id, description: lastOp.description }, () => {
    console.log(`Undone operation ${lastOp.id.slice(0, 8)}: ${lastOp.description}`)
  })
}
