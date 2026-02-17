import { text } from '@stacksjs/clapp'
import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'
import { ChangeNotFoundError } from '../errors'

interface DescribeOptions { message?: string; format?: string }

export async function describe(changeIdPrefix: string, options?: DescribeOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const allChanges = await ws.metadataStore.listChanges()
  const match = allChanges.find(c => c.id.startsWith(changeIdPrefix))
  if (!match) throw new ChangeNotFoundError(changeIdPrefix)

  let message = options?.message
  if (!message) {
    message = await text({ message: 'New description:', initialValue: match.description, validate: (v: string) => v.length > 0 ? undefined : 'Description is required' }) as string
  }

  const oldDescription = match.description
  match.description = message
  match.updatedAt = new Date().toISOString()
  await ws.metadataStore.putChange(match)

  formatOutput(options?.format, { type: 'describe', changeId: match.id, oldDescription, newDescription: message }, () => {
    console.log(`Updated description of ${match.id.slice(0, 12)}:`)
    console.log(`  was: ${oldDescription}`)
    console.log(`  now: ${message}`)
  })
}
