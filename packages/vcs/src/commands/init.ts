import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ActorInfo, ChangeId, WorkspaceConfig } from '../types'
import { IsomorphicGitBackend } from '../storage/isomorphic-git-backend'
import { JsonMetadataStore } from '../storage/json-metadata-store'
import { importGitRefs } from '../workspace/import-export'
import { generateChangeId, generateEntityId, generateOperationId } from '../utils/id'
import { NotARepoError, AlreadyInitError } from '../errors'

interface InitOptions {
  force?: boolean
}

export async function init(options?: InitOptions): Promise<void> {
  const dir = process.cwd()
  const gitdir = path.join(dir, '.git')
  const vcsdir = path.join(dir, '.vcs')

  // Verify .git exists
  try {
    await fs.access(gitdir)
  } catch {
    throw new NotARepoError(dir)
  }

  // Check .vcs/ doesn't already exist (unless --force)
  try {
    await fs.access(vcsdir)
    if (!options?.force) throw new AlreadyInitError()
  } catch (err) {
    if (err instanceof AlreadyInitError) throw err
    // .vcs/ doesn't exist — good
  }

  // Create .vcs/ directory structure
  const dirs = ['changes', 'sessions', 'tasks', 'transcripts', 'attestations', 'bookmarks', 'operations']
  for (const d of dirs) {
    await fs.mkdir(path.join(vcsdir, 'store', d), { recursive: true })
  }

  // Ensure .gitignore contains .vcs/
  await ensureGitignore(dir, '.vcs/')

  // Detect actor from git config
  const actor = await detectActor(dir)

  const gitBackend = new IsomorphicGitBackend(dir, gitdir)
  const metadataStore = new JsonMetadataStore(vcsdir)

  // Import existing git commits as changes
  const importResult = await importGitRefs(gitBackend, metadataStore, actor)

  // Create working copy change
  const head = await gitBackend.resolveRef('HEAD')
  let workingCopyChangeId: ChangeId

  if (head) {
    const headChange = await metadataStore.getChangeByCommit(head as any)
    if (headChange) {
      // Create new empty change on top of HEAD (like jj's @)
      workingCopyChangeId = generateChangeId()
      await metadataStore.putChange({
        id: workingCopyChangeId,
        currentCommitOid: head as any,
        predecessors: [],
        dependsOn: [],
        parentChangeIds: [headChange.id],
        sessionId: null,
        taskId: null,
        transcriptIds: [],
        description: '(working copy)',
        labels: [],
        abandoned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } else {
      workingCopyChangeId = generateChangeId()
    }
  } else {
    workingCopyChangeId = generateChangeId()
  }

  // Record init operation
  const opId = generateOperationId()
  await metadataStore.appendOperation({
    id: opId,
    parentId: null,
    type: 'init',
    description: 'Initialize VCS workspace (colocated)',
    command: 'vcs init',
    snapshotBefore: {},
    snapshotAfter: head ? { HEAD: head } : {},
    actor,
    timestamp: new Date().toISOString(),
  })

  // Write workspace config
  const config: WorkspaceConfig = {
    version: 1,
    workspaceId: generateEntityId(),
    colocated: true,
    gitDir: '.git',
    defaultActor: actor,
    workingCopyChangeId,
    operationHead: opId,
    activeSessionId: null,
    activeTaskId: null,
    settings: {
      defaultFormat: 'text',
      autoImportGit: true,
      autoExportGit: true,
    },
  }

  await metadataStore.putConfig(config)

  // Output
  console.log(`Initialized VCS workspace in ${dir}`)
  if (importResult.newChanges > 0) {
    console.log(`Imported ${importResult.newChanges} existing git commit(s) as changes`)
  }
  if (importResult.updatedBookmarks > 0) {
    console.log(`Imported ${importResult.updatedBookmarks} bookmark(s) from git branches`)
  }
  console.log(`Working copy change: ${workingCopyChangeId.slice(0, 12)}`)
}

async function ensureGitignore(dir: string, entry: string): Promise<void> {
  const gitignorePath = path.join(dir, '.gitignore')
  try {
    const content = await fs.readFile(gitignorePath, 'utf8')
    if (!content.split('\n').some(line => line.trim() === entry)) {
      await fs.appendFile(gitignorePath, `\n${entry}\n`)
    }
  } catch {
    await fs.writeFile(gitignorePath, `${entry}\n`)
  }
}

async function detectActor(dir: string): Promise<ActorInfo> {
  try {
    const proc = Bun.spawn(['git', 'config', 'user.name'], { cwd: dir, stdout: 'pipe' })
    const name = (await new Response(proc.stdout).text()).trim()
    const proc2 = Bun.spawn(['git', 'config', 'user.email'], { cwd: dir, stdout: 'pipe' })
    const email = (await new Response(proc2.stdout).text()).trim()
    return { name: name || 'Unknown', email: email || 'unknown@example.com' }
  } catch {
    return { name: 'Unknown', email: 'unknown@example.com' }
  }
}
