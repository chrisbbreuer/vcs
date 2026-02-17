import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'
import { ChangeNotFoundError } from '../errors'

interface AbandonOptions { format?: string }

export async function abandon(changeIdPrefix: string, options?: AbandonOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const allChanges = await ws.metadataStore.listChanges()
  const match = allChanges.find(c => c.id.startsWith(changeIdPrefix))
  if (!match) throw new ChangeNotFoundError(changeIdPrefix)

  match.abandoned = true
  match.updatedAt = new Date().toISOString()
  await ws.metadataStore.putChange(match)
  await ws.gitBackend.deleteRef(`refs/vcs/changes/${match.id}`)
  await ws.finalize()

  formatOutput(options?.format, { type: 'abandon', changeId: match.id, description: match.description }, () => {
    console.log(`Abandoned change ${match.id.slice(0, 12)}: ${match.description}`)
  })
}
