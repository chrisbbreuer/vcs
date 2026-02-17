import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'

interface GitOptions { format?: string }

export async function gitFetch(remote?: string, options?: GitOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const remoteName = remote ?? 'origin'

  console.log(`Fetching from ${remoteName}...`)

  // Fetch branches
  const proc1 = Bun.spawn(['git', 'fetch', remoteName], { cwd: ws.dir, stdout: 'pipe', stderr: 'pipe' })
  const stderr1 = await new Response(proc1.stderr).text()
  await proc1.exited
  if (stderr1.trim()) console.log(stderr1.trim())

  // Fetch notes
  const proc2 = Bun.spawn(['git', 'fetch', remoteName, '+refs/notes/vcs/*:refs/notes/vcs/*'], { cwd: ws.dir, stdout: 'pipe', stderr: 'pipe' })
  await proc2.exited

  // Re-import
  const { importGitRefs } = await import('../workspace/import-export')
  const result = await importGitRefs(ws.gitBackend, ws.metadataStore, ws.config.defaultActor)

  formatOutput(options?.format, { type: 'git-fetch', remote: remoteName, newChanges: result.newChanges, updatedBookmarks: result.updatedBookmarks }, () => {
    console.log(`Fetched from ${remoteName}: ${result.newChanges} new change(s), ${result.updatedBookmarks} bookmark(s) updated`)
  })
}

export async function gitPush(remote?: string, options?: GitOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const remoteName = remote ?? 'origin'

  // Export bookmarks to git branches first
  await ws.finalize()

  console.log(`Pushing to ${remoteName}...`)

  // Push branches
  const proc1 = Bun.spawn(['git', 'push', remoteName, '--all'], { cwd: ws.dir, stdout: 'pipe', stderr: 'pipe' })
  const stderr1 = await new Response(proc1.stderr).text()
  await proc1.exited
  if (stderr1.trim()) console.log(stderr1.trim())

  // Push notes
  const proc2 = Bun.spawn(['git', 'push', remoteName, 'refs/notes/vcs/*:refs/notes/vcs/*'], { cwd: ws.dir, stdout: 'pipe', stderr: 'pipe' })
  const stderr2 = await new Response(proc2.stderr).text()
  await proc2.exited

  formatOutput(options?.format, { type: 'git-push', remote: remoteName }, () => {
    console.log(`Pushed to ${remoteName}`)
  })
}
