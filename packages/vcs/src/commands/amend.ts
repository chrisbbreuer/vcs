import { openWorkspace } from '../workspace/workspace'
import { WorkingCopy } from '../workspace/working-copy'
import { formatOutput } from '../cli/output'

interface AmendOptions { message?: string; format?: string }

export async function amend(options?: AmendOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const wc = new WorkingCopy(ws.dir, ws.gitBackend, ws.metadataStore)
  const { change, commitOid } = await wc.amend({ message: options?.message, actor: ws.config.defaultActor })
  await ws.finalize()
  formatOutput(options?.format, { type: 'amend', changeId: change.id, commitOid, description: change.description }, () => {
    console.log(`Amended change ${change.id.slice(0, 12)}: ${change.description}`)
    console.log(`  new commit: ${commitOid.slice(0, 8)}`)
    console.log(`  predecessors: ${change.predecessors.length}`)
  })
}
