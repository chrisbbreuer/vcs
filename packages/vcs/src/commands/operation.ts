import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'

interface OpLogOptions { format?: string }

export async function opLog(options?: OpLogOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const operations = await ws.metadataStore.listOperations(50)

  formatOutput(options?.format, { type: 'op-log', entries: operations }, () => {
    if (operations.length === 0) { console.log('No operations yet.'); return }
    for (const op of operations) {
      const isHead = op.id === ws.config.operationHead
      const marker = isHead ? '@' : 'o'
      console.log(`${marker} ${op.id.slice(0, 8)} ${op.type} | ${op.description}`)
      console.log(`    ${op.timestamp} by ${op.actor.name} <${op.actor.email}>`)
      console.log(`    command: ${op.command}`)
    }
  })
}
