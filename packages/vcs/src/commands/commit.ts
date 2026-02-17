import { text } from '@stacksjs/clapp'
import { openWorkspace } from '../workspace/workspace'
import { WorkingCopy } from '../workspace/working-copy'
import { formatOutput } from '../cli/output'

interface CommitOptions {
  message?: string
  session?: string
  task?: string
  format?: string
}

export async function commit(options?: CommitOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  let message = options?.message
  if (!message) {
    message = await text({ message: 'Commit message:', validate: (v: string) => v.length > 0 ? undefined : 'Message is required' }) as string
  }
  const wc = new WorkingCopy(ws.dir, ws.gitBackend, ws.metadataStore)
  const { change, commitOid } = await wc.snapshot({
    message,
    actor: ws.config.defaultActor,
    sessionId: (options?.session as any) ?? ws.config.activeSessionId ?? undefined,
    taskId: (options?.task as any) ?? ws.config.activeTaskId ?? undefined,
  })
  await ws.finalize()
  formatOutput(options?.format, { type: 'commit', changeId: change.id, commitOid, description: change.description }, () => {
    console.log(`Change ${change.id.slice(0, 12)} committed: ${change.description}`)
    console.log(`  commit: ${commitOid.slice(0, 8)}`)
  })
}
