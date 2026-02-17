import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import git from 'isomorphic-git'
import { IsomorphicGitBackend } from '../src/storage/isomorphic-git-backend'
import { JsonMetadataStore } from '../src/storage/json-metadata-store'
import { WorkingCopy } from '../src/workspace/working-copy'
import { importGitRefs, exportToGitRefs } from '../src/workspace/import-export'
import { getWorkingCopyChanges } from '../src/workspace/diff'
import { renderGraph } from '../src/cli/graph-renderer'
import { generateChangeId, generateEntityId, generateOperationId } from '../src/utils/id'
import type { Change, ChangeId, CommitOid, Session, Task, Transcript, Attestation, WorkspaceConfig, EntityId } from '../src/types'

async function createTestRepo(): Promise<{
  dir: string
  gitBackend: IsomorphicGitBackend
  metadataStore: JsonMetadataStore
  config: WorkspaceConfig
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vcs-integration-'))
  const nodeFs = await import('node:fs')
  await git.init({ fs: nodeFs, dir })

  // Configure git
  await git.setConfig({ fs: nodeFs, dir, path: 'user.name', value: 'Test User' })
  await git.setConfig({ fs: nodeFs, dir, path: 'user.email', value: 'test@example.com' })

  const gitBackend = new IsomorphicGitBackend(dir)
  const vcsdir = path.join(dir, '.vcs')

  for (const d of ['changes', 'sessions', 'tasks', 'transcripts', 'attestations', 'bookmarks', 'operations']) {
    await fs.mkdir(path.join(vcsdir, 'store', d), { recursive: true })
  }

  const config: WorkspaceConfig = {
    version: 1,
    workspaceId: generateEntityId(),
    colocated: true,
    gitDir: '.git',
    defaultActor: { name: 'Test User', email: 'test@example.com' },
    workingCopyChangeId: generateChangeId(),
    operationHead: generateOperationId(),
    activeSessionId: null,
    activeTaskId: null,
    settings: { defaultFormat: 'text', autoImportGit: true, autoExportGit: true },
  }

  const metadataStore = new JsonMetadataStore(vcsdir)
  await metadataStore.putConfig(config)

  // Create initial working copy change
  await metadataStore.putChange({
    id: config.workingCopyChangeId,
    currentCommitOid: '' as CommitOid,
    predecessors: [],
    parentChangeIds: [],
    dependsOn: [],
    sessionId: null,
    taskId: null,
    transcriptIds: [],
    description: '(working copy)',
    labels: [],
    abandoned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  return { dir, gitBackend, metadataStore, config }
}

// ─── Core Workflow ──────────────────────────────────────────

describe('core workflow: commit, amend, log', () => {
  let dir: string
  let gitBackend: IsomorphicGitBackend
  let metadataStore: JsonMetadataStore
  let config: WorkspaceConfig

  beforeEach(async () => {
    const repo = await createTestRepo()
    dir = repo.dir
    gitBackend = repo.gitBackend
    metadataStore = repo.metadataStore
    config = repo.config
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('commit creates a change with stable ID', async () => {
    await fs.writeFile(path.join(dir, 'file.txt'), 'hello')
    await gitBackend.add('file.txt')

    const wc = new WorkingCopy(dir, gitBackend, metadataStore)
    const { change, commitOid } = await wc.snapshot({
      message: 'Add file',
      actor: config.defaultActor,
    })

    expect(change.id).toBeTruthy()
    expect(change.description).toBe('Add file')
    expect(commitOid).toHaveLength(40)

    // Verify the commit exists in git
    const commit = await gitBackend.readCommit(commitOid)
    expect(commit.message).toContain('Add file')
    expect(commit.message).toContain('Change-Id:')

    // Verify change ref was created
    const refs = await gitBackend.listRefs('refs/vcs/changes/')
    expect(refs.length).toBeGreaterThanOrEqual(1)
    const changeRef = refs.find(r => r.ref.includes(change.id))
    expect(changeRef).toBeTruthy()
  })

  it('amend preserves Change ID while updating commit', async () => {
    await fs.writeFile(path.join(dir, 'file.txt'), 'v1')
    await gitBackend.add('file.txt')

    const wc = new WorkingCopy(dir, gitBackend, metadataStore)
    const { change: original } = await wc.snapshot({
      message: 'Initial',
      actor: config.defaultActor,
    })

    // Refresh config after commit
    config = await metadataStore.getConfig()

    // Modify and amend
    await fs.writeFile(path.join(dir, 'file.txt'), 'v2')

    const { change: amended, commitOid: newOid } = await wc.amend({
      message: 'Improved initial',
      actor: config.defaultActor,
    })

    expect(amended.id).toBe(original.id) // Same Change ID
    expect(amended.currentCommitOid).not.toBe(original.currentCommitOid) // Different commit
    expect(amended.predecessors).toContain(original.currentCommitOid) // Tracks history
    expect(amended.description).toBe('Improved initial')
  })

  it('multiple commits create a chain of changes', async () => {
    const wc = new WorkingCopy(dir, gitBackend, metadataStore)

    await fs.writeFile(path.join(dir, 'a.txt'), 'a')
    await gitBackend.add('a.txt')
    const { change: c1 } = await wc.snapshot({ message: 'Add a', actor: config.defaultActor })
    config = await metadataStore.getConfig()

    await fs.writeFile(path.join(dir, 'b.txt'), 'b')
    await gitBackend.add('b.txt')
    const { change: c2 } = await wc.snapshot({ message: 'Add b', actor: config.defaultActor })

    // c2 should have c1 as parent
    expect(c2.parentChangeIds).toContain(c1.id)

    // List should show both changes (not working copy)
    const changes = await metadataStore.listChanges()
    const nonWc = changes.filter(c => c.description !== '(working copy)')
    expect(nonWc.length).toBe(2)
  })
})

// ─── Git Interop ────────────────────────────────────────────

describe('git interop: import and export', () => {
  let dir: string
  let gitBackend: IsomorphicGitBackend
  let metadataStore: JsonMetadataStore
  let config: WorkspaceConfig

  beforeEach(async () => {
    const repo = await createTestRepo()
    dir = repo.dir
    gitBackend = repo.gitBackend
    metadataStore = repo.metadataStore
    config = repo.config
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('imports git commits created outside VCS', async () => {
    // Create a commit directly via isomorphic-git (simulating `git commit`)
    await fs.writeFile(path.join(dir, 'external.txt'), 'created by git')
    await gitBackend.add('external.txt')
    const oid = await gitBackend.commit({
      message: 'External commit',
      author: { name: 'Git User', email: 'git@test.com', timestamp: Math.floor(Date.now() / 1000), timezoneOffset: 0 },
    })

    // Create a branch pointing to it
    await gitBackend.writeRef('refs/heads/main', oid)

    // Import
    const result = await importGitRefs(gitBackend, metadataStore, config.defaultActor)
    expect(result.newChanges).toBeGreaterThanOrEqual(1)
    expect(result.updatedBookmarks).toBeGreaterThanOrEqual(1)

    // Verify change was created
    const changes = await metadataStore.listChanges()
    const imported = changes.find(c => c.description === 'External commit')
    expect(imported).toBeTruthy()
    expect(imported!.currentCommitOid).toBe(oid)
  })

  it('exports bookmarks to git branches', async () => {
    // Create a commit
    await fs.writeFile(path.join(dir, 'test.txt'), 'test')
    await gitBackend.add('test.txt')
    const oid = await gitBackend.commit({
      message: 'Test',
      author: { name: 'T', email: 't@t.com', timestamp: Math.floor(Date.now() / 1000), timezoneOffset: 0 },
    })

    const changeId = generateChangeId()
    await metadataStore.putChange({
      id: changeId,
      currentCommitOid: oid as CommitOid,
      predecessors: [],
      parentChangeIds: [],
      dependsOn: [],
      sessionId: null,
      taskId: null,
      transcriptIds: [],
      description: 'Test',
      labels: [],
      abandoned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await metadataStore.putBookmark({
      name: 'feature-branch',
      changeId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const result = await exportToGitRefs(gitBackend, metadataStore)
    expect(result.updatedBranches).toBeGreaterThanOrEqual(1)

    // Verify git branch exists
    const ref = await gitBackend.resolveRef('refs/heads/feature-branch')
    expect(ref).toBe(oid)
  })
})

// ─── Sessions and Tasks ─────────────────────────────────────

describe('sessions and tasks', () => {
  let dir: string
  let metadataStore: JsonMetadataStore

  beforeEach(async () => {
    const repo = await createTestRepo()
    dir = repo.dir
    metadataStore = repo.metadataStore
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('session lifecycle: start, add tasks, end', async () => {
    const session: Session = {
      id: generateEntityId(),
      objective: 'Implement auth',
      taskIds: [],
      changeIds: [],
      transcriptIds: [],
      status: 'active',
      environment: { model: 'claude-opus-4-6', tool: 'claude-code' },
      startedAt: new Date().toISOString(),
      endedAt: null,
    }

    await metadataStore.putSession(session)
    const retrieved = await metadataStore.getSession(session.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.objective).toBe('Implement auth')
    expect(retrieved!.status).toBe('active')

    // Add task
    const task: Task = {
      id: generateEntityId(),
      sessionId: session.id,
      description: 'Add JWT middleware',
      changeIds: [],
      transcriptIds: [],
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      completedAt: null,
    }

    await metadataStore.putTask(task)
    session.taskIds.push(task.id)
    await metadataStore.putSession(session)

    // Complete task
    task.status = 'completed'
    task.completedAt = new Date().toISOString()
    await metadataStore.putTask(task)

    // End session
    session.status = 'completed'
    session.endedAt = new Date().toISOString()
    await metadataStore.putSession(session)

    const final = await metadataStore.getSession(session.id)
    expect(final!.status).toBe('completed')
    expect(final!.taskIds).toHaveLength(1)

    // List tasks by session
    const tasks = await metadataStore.listTasks(session.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].description).toBe('Add JWT middleware')
  })
})

// ─── Transcripts ────────────────────────────────────────────

describe('transcripts', () => {
  let dir: string
  let metadataStore: JsonMetadataStore
  let gitBackend: IsomorphicGitBackend

  beforeEach(async () => {
    const repo = await createTestRepo()
    dir = repo.dir
    metadataStore = repo.metadataStore
    gitBackend = repo.gitBackend
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('stores and retrieves transcripts with blob content', async () => {
    const turns = [
      { role: 'human' as const, content: 'Add JWT auth', timestamp: new Date().toISOString() },
      { role: 'assistant' as const, content: 'I will implement JWT...', timestamp: new Date().toISOString() },
    ]

    const blobOids: string[] = []
    for (const turn of turns) {
      const blob = new TextEncoder().encode(JSON.stringify(turn))
      blobOids.push(await gitBackend.writeBlob(blob))
    }

    const transcript: Transcript = {
      id: generateEntityId(),
      changeIds: [],
      sessionId: generateEntityId(),
      turns,
      model: 'claude-opus-4-6',
      tokenCount: 42,
      summary: 'JWT implementation discussion',
      blobOids: blobOids as CommitOid[],
      createdAt: new Date().toISOString(),
    }

    await metadataStore.putTranscript(transcript)
    const retrieved = await metadataStore.getTranscript(transcript.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.turns).toHaveLength(2)
    expect(retrieved!.model).toBe('claude-opus-4-6')

    // Verify blobs are readable
    for (const oid of blobOids) {
      const blob = await gitBackend.readBlob(oid)
      expect(blob.length).toBeGreaterThan(0)
      const turn = JSON.parse(new TextDecoder().decode(blob))
      expect(turn.role).toBeTruthy()
    }
  })

  it('filters transcripts by session', async () => {
    const sessionA = generateEntityId()
    const sessionB = generateEntityId()

    await metadataStore.putTranscript({
      id: generateEntityId(), changeIds: [], sessionId: sessionA,
      turns: [], model: 'a', tokenCount: 0, summary: 'A', blobOids: [], createdAt: new Date().toISOString(),
    })
    await metadataStore.putTranscript({
      id: generateEntityId(), changeIds: [], sessionId: sessionB,
      turns: [], model: 'b', tokenCount: 0, summary: 'B', blobOids: [], createdAt: new Date().toISOString(),
    })

    const all = await metadataStore.listTranscripts()
    expect(all).toHaveLength(2)

    const filtered = await metadataStore.listTranscripts({ sessionId: sessionA })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].summary).toBe('A')
  })
})

// ─── Attestations ───────────────────────────────────────────

describe('attestations', () => {
  let dir: string
  let metadataStore: JsonMetadataStore

  beforeEach(async () => {
    const repo = await createTestRepo()
    dir = repo.dir
    metadataStore = repo.metadataStore
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('stores and retrieves attestations by change', async () => {
    const changeId = generateChangeId()

    const attestation: Attestation = {
      id: generateEntityId(),
      changeId,
      commitOid: 'abc123' as CommitOid,
      name: 'unit-tests',
      command: 'bun test',
      exitCode: 0,
      stdout: 'All tests passed',
      stderr: '',
      durationMs: 1234,
      environmentHash: 'env-hash',
      environment: { platform: 'darwin-arm64', runtime: 'bun', runtimeVersion: '1.0.0', lockfileHash: 'lock-hash' },
      passed: true,
      createdAt: new Date().toISOString(),
    }

    await metadataStore.putAttestation(attestation)

    const all = await metadataStore.listAttestations(changeId)
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('unit-tests')
    expect(all[0].passed).toBe(true)
  })
})

// ─── Graph Rendering ────────────────────────────────────────

describe('graph renderer', () => {
  it('renders basic graph with working copy marker', () => {
    const wc: Change = {
      id: 'kkkkllllmmmmnnnn' as ChangeId,
      currentCommitOid: 'a1b2c3d4' as CommitOid,
      predecessors: [], parentChangeIds: ['ooooppppqqqqrrrr' as ChangeId], dependsOn: [],
      sessionId: null, taskId: null, transcriptIds: [],
      description: '(working copy)', labels: [], abandoned: false,
      createdAt: '2026-01-02', updatedAt: '2026-01-02',
    }

    const parent: Change = {
      id: 'ooooppppqqqqrrrr' as ChangeId,
      currentCommitOid: 'e5f6a7b8' as CommitOid,
      predecessors: [], parentChangeIds: [], dependsOn: [],
      sessionId: null, taskId: null, transcriptIds: [],
      description: 'Initial commit', labels: [], abandoned: false,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }

    const output = renderGraph([wc, parent], wc.id, [
      { name: 'main', changeId: parent.id, createdAt: '', updatedAt: '' },
    ])

    expect(output).toContain('@')
    expect(output).toContain('(working copy)')
    expect(output).toContain('(main)')
    expect(output).toContain('Initial commit')
  })
})

// ─── Working Copy Diff ──────────────────────────────────────

describe('working copy diff', () => {
  let dir: string
  let gitBackend: IsomorphicGitBackend

  beforeEach(async () => {
    const repo = await createTestRepo()
    dir = repo.dir
    gitBackend = repo.gitBackend
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('detects added, modified, and deleted files', async () => {
    // Create initial commit
    await fs.writeFile(path.join(dir, 'keep.txt'), 'keep')
    await fs.writeFile(path.join(dir, 'delete.txt'), 'delete me')
    await gitBackend.add('keep.txt')
    await gitBackend.add('delete.txt')
    await gitBackend.commit({
      message: 'Initial',
      author: { name: 'T', email: 't@t', timestamp: Math.floor(Date.now() / 1000), timezoneOffset: 0 },
    })

    // Make changes
    await fs.writeFile(path.join(dir, 'keep.txt'), 'modified')
    await fs.writeFile(path.join(dir, 'new.txt'), 'new file')
    await fs.unlink(path.join(dir, 'delete.txt'))

    const changes = await getWorkingCopyChanges(gitBackend)
    const statuses = changes.map(c => c.status)

    expect(statuses).toContain('modified')
    expect(statuses).toContain('added')
    expect(statuses).toContain('deleted')
  })
})
