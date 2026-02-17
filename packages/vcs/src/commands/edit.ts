import { openWorkspace } from '../workspace/workspace'
import { WorkingCopy } from '../workspace/working-copy'
import { formatOutput } from '../cli/output'
import { ChangeNotFoundError } from '../errors'

interface EditOptions { format?: string }

export async function edit(changeIdPrefix: string, options?: EditOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const allChanges = await ws.metadataStore.listChanges()
  const match = allChanges.find(c => c.id.startsWith(changeIdPrefix))
  if (!match) throw new ChangeNotFoundError(changeIdPrefix)

  const wc = new WorkingCopy(ws.dir, ws.gitBackend, ws.metadataStore)
  await wc.checkout(match.id)
  await ws.finalize()

  formatOutput(options?.format, { type: 'edit', changeId: match.id, description: match.description }, () => {
    console.log(`Switched to change ${match.id.slice(0, 12)}: ${match.description}`)
  })
}
