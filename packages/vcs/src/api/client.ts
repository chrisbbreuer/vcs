import * as path from 'node:path'
import type {
  ActorInfo,
  Attestation,
  Bookmark,
  Change,
  ChangeId,
  CommitOid,
  EntityId,
  Session,
  Task,
  Transcript,
  WorkspaceConfig,
} from '../types'
import type { GitBackend } from '../storage/git-backend'
import type { MetadataStore } from '../storage/metadata-store'
import { IsomorphicGitBackend } from '../storage/isomorphic-git-backend'
import { JsonMetadataStore } from '../storage/json-metadata-store'
import { WorkingCopy } from '../workspace/working-copy'
import { importGitRefs, exportToGitRefs } from '../workspace/import-export'
import { generateEntityId } from '../utils/id'
import { computeEnvironmentHash } from '../utils/hash'

/**
 * Programmatic API for VCS. Use this to integrate VCS into AI agents
 * and other tools without going through the CLI.
 *
 * ```typescript
 * import { VcsClient } from '@stacksjs/vcs/api/client'
 *
 * const vcs = await VcsClient.open('/path/to/repo')
 *
 * // Start a session
 * const session = await vcs.sessionStart('Implement auth system')
 * const task = await vcs.taskCreate('Add JWT middleware')
 *
 * // Make changes and commit
 * await vcs.commit('Add token validation')
 *
 * // Attach transcript
 * await vcs.transcriptAttach(turns, { model: 'claude-opus-4-6' })
 *
 * // Run attestation
 * const result = await vcs.attest('unit-tests', 'bun test')
 *
 * // Get context at any zoom level
 * const ctx = await vcs.context({ zoom: 'session', tokenBudget: 4000 })
 * ```
 */
export class VcsClient {
  private gitBackend: GitBackend
  private metadataStore: MetadataStore
  private workingCopy: WorkingCopy
  private _config: WorkspaceConfig

  private constructor(
    public readonly dir: string,
    gitBackend: GitBackend,
    metadataStore: MetadataStore,
    config: WorkspaceConfig,
  ) {
    this.gitBackend = gitBackend
    this.metadataStore = metadataStore
    this._config = config
    this.workingCopy = new WorkingCopy(dir, gitBackend, metadataStore)
  }

  static async open(dir: string): Promise<VcsClient> {
    const vcsdir = path.join(dir, '.vcs')
    const gitdir = path.join(dir, '.git')
    const gitBackend = new IsomorphicGitBackend(dir, gitdir)
    const metadataStore = new JsonMetadataStore(vcsdir)
    const config = await metadataStore.getConfig()

    if (config.settings.autoImportGit) {
      await importGitRefs(gitBackend, metadataStore, config.defaultActor)
    }

    return new VcsClient(dir, gitBackend, metadataStore, config)
  }

  get config(): WorkspaceConfig {
    return this._config
  }

  // ─── Changes ─────────────────────────────────────────────

  async commit(message: string): Promise<{ change: Change; commitOid: CommitOid }> {
    const result = await this.workingCopy.snapshot({
      message,
      actor: this._config.defaultActor,
      sessionId: this._config.activeSessionId ?? undefined,
      taskId: this._config.activeTaskId ?? undefined,
    })
    await this.sync()
    this._config = await this.metadataStore.getConfig()
    return result
  }

  async amend(message?: string): Promise<{ change: Change; commitOid: CommitOid }> {
    const result = await this.workingCopy.amend({ message, actor: this._config.defaultActor })
    await this.sync()
    return result
  }

  async getChange(id: ChangeId): Promise<Change | null> {
    return this.metadataStore.getChange(id)
  }

  async listChanges(): Promise<Change[]> {
    return this.metadataStore.listChanges()
  }

  async abandonChange(id: ChangeId): Promise<void> {
    const change = await this.metadataStore.getChange(id)
    if (!change) return
    change.abandoned = true
    change.updatedAt = new Date().toISOString()
    await this.metadataStore.putChange(change)
    await this.gitBackend.deleteRef(`refs/vcs/changes/${id}`)
  }

  // ─── Sessions ────────────────────────────────────────────

  async sessionStart(objective: string, env?: { model?: string; tool?: string }): Promise<Session> {
    const session: Session = {
      id: generateEntityId(),
      objective,
      taskIds: [],
      changeIds: [],
      transcriptIds: [],
      status: 'active',
      environment: { model: env?.model, tool: env?.tool, cwd: this.dir },
      startedAt: new Date().toISOString(),
      endedAt: null,
    }
    await this.metadataStore.putSession(session)
    this._config.activeSessionId = session.id
    await this.metadataStore.putConfig(this._config)
    return session
  }

  async sessionEnd(): Promise<Session | null> {
    if (!this._config.activeSessionId) return null
    const session = await this.metadataStore.getSession(this._config.activeSessionId)
    if (!session) return null
    session.status = 'completed'
    session.endedAt = new Date().toISOString()
    await this.metadataStore.putSession(session)
    this._config.activeSessionId = null
    this._config.activeTaskId = null
    await this.metadataStore.putConfig(this._config)
    return session
  }

  async listSessions(): Promise<Session[]> {
    return this.metadataStore.listSessions()
  }

  // ─── Tasks ───────────────────────────────────────────────

  async taskCreate(description: string): Promise<Task> {
    if (!this._config.activeSessionId) throw new Error('No active session')
    const task: Task = {
      id: generateEntityId(),
      sessionId: this._config.activeSessionId,
      description,
      changeIds: [],
      transcriptIds: [],
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      completedAt: null,
    }
    await this.metadataStore.putTask(task)
    const session = await this.metadataStore.getSession(this._config.activeSessionId)
    if (session) {
      session.taskIds.push(task.id)
      await this.metadataStore.putSession(session)
    }
    this._config.activeTaskId = task.id
    await this.metadataStore.putConfig(this._config)
    return task
  }

  async taskComplete(): Promise<Task | null> {
    if (!this._config.activeTaskId) return null
    const task = await this.metadataStore.getTask(this._config.activeTaskId)
    if (!task) return null
    task.status = 'completed'
    task.completedAt = new Date().toISOString()
    await this.metadataStore.putTask(task)
    this._config.activeTaskId = null
    await this.metadataStore.putConfig(this._config)
    return task
  }

  async listTasks(sessionId?: EntityId): Promise<Task[]> {
    return this.metadataStore.listTasks(sessionId)
  }

  // ─── Transcripts ─────────────────────────────────────────

  async transcriptAttach(
    turns: Array<{ role: string; content: string }>,
    opts?: { model?: string; summary?: string },
  ): Promise<Transcript> {
    const blobOids: string[] = []
    const fullTurns = turns.map(t => ({
      role: t.role as 'human' | 'assistant' | 'system' | 'tool',
      content: t.content,
      timestamp: new Date().toISOString(),
    }))

    for (const turn of fullTurns) {
      const blob = new TextEncoder().encode(JSON.stringify(turn))
      blobOids.push(await this.gitBackend.writeBlob(blob))
    }

    const totalChars = fullTurns.reduce((sum, t) => sum + t.content.length, 0)
    const currentChange = await this.metadataStore.getChange(this._config.workingCopyChangeId)
    const parentChangeId = currentChange?.parentChangeIds?.[0]

    const transcript: Transcript = {
      id: generateEntityId(),
      changeIds: parentChangeId ? [parentChangeId] : [],
      sessionId: this._config.activeSessionId ?? ('' as EntityId),
      turns: fullTurns,
      model: opts?.model ?? 'unknown',
      tokenCount: Math.ceil(totalChars / 4),
      summary: opts?.summary ?? fullTurns[0]?.content.slice(0, 200) ?? '',
      blobOids: blobOids as any[],
      createdAt: new Date().toISOString(),
    }

    await this.metadataStore.putTranscript(transcript)

    if (parentChangeId) {
      const change = await this.metadataStore.getChange(parentChangeId)
      if (change) {
        change.transcriptIds.push(transcript.id)
        await this.metadataStore.putChange(change)
      }
    }

    return transcript
  }

  async listTranscripts(filter?: { changeId?: ChangeId; sessionId?: EntityId }): Promise<Transcript[]> {
    return this.metadataStore.listTranscripts(filter)
  }

  // ─── Attestation ─────────────────────────────────────────

  async attest(name: string, command: string): Promise<Attestation> {
    const currentChange = await this.metadataStore.getChange(this._config.workingCopyChangeId)
    const parentChangeId = currentChange?.parentChangeIds?.[0]
    const parentChange = parentChangeId ? await this.metadataStore.getChange(parentChangeId) : null
    if (!parentChange) throw new Error('No change to attest against')

    const startTime = Date.now()
    const proc = Bun.spawn(['sh', '-c', command], { cwd: this.dir, stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    const durationMs = Date.now() - startTime
    const { hash, environment } = await computeEnvironmentHash(this.dir)

    const attestation: Attestation = {
      id: generateEntityId(),
      changeId: parentChange.id,
      commitOid: parentChange.currentCommitOid,
      name,
      command,
      exitCode,
      stdout: stdout.slice(0, 10000),
      stderr: stderr.slice(0, 10000),
      durationMs,
      environmentHash: hash,
      environment,
      passed: exitCode === 0,
      createdAt: new Date().toISOString(),
    }

    await this.metadataStore.putAttestation(attestation)
    return attestation
  }

  async listAttestations(changeId?: ChangeId): Promise<Attestation[]> {
    return this.metadataStore.listAttestations(changeId)
  }

  // ─── Context ─────────────────────────────────────────────

  async context(opts?: { zoom?: string; tokenBudget?: number }): Promise<Record<string, any>> {
    const zoom = opts?.zoom ?? 'change'
    const result: Record<string, any> = { type: 'context', zoom }

    if (zoom === 'session' && this._config.activeSessionId) {
      const session = await this.metadataStore.getSession(this._config.activeSessionId)
      if (session) {
        result.session = session
        result.tasks = await this.metadataStore.listTasks(session.id)
      }
    } else if (zoom === 'task' && this._config.activeTaskId) {
      const task = await this.metadataStore.getTask(this._config.activeTaskId)
      if (task) {
        result.task = task
        const changes: Change[] = []
        for (const cid of task.changeIds) {
          const c = await this.metadataStore.getChange(cid)
          if (c) changes.push(c)
        }
        result.changes = changes
      }
    } else {
      const currentChange = await this.metadataStore.getChange(this._config.workingCopyChangeId)
      const parentChangeId = currentChange?.parentChangeIds?.[0]
      if (parentChangeId) {
        const parentChange = await this.metadataStore.getChange(parentChangeId)
        result.parentChange = parentChange
        if (parentChange?.transcriptIds.length) {
          const transcripts = []
          for (const tid of parentChange.transcriptIds) {
            const t = await this.metadataStore.getTranscript(tid)
            if (t) transcripts.push(t)
          }
          result.transcripts = transcripts
        }
      }
    }

    return result
  }

  // ─── Bookmarks ───────────────────────────────────────────

  async bookmarkCreate(name: string, changeId?: ChangeId): Promise<Bookmark> {
    const targetId = changeId ?? (await this.metadataStore.getChange(this._config.workingCopyChangeId))?.parentChangeIds?.[0]
    if (!targetId) throw new Error('No change to bookmark')
    const change = await this.metadataStore.getChange(targetId)
    if (!change) throw new Error('Change not found')

    const bookmark: Bookmark = {
      name,
      changeId: change.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.metadataStore.putBookmark(bookmark)
    await this.gitBackend.writeRef(`refs/heads/${name}`, change.currentCommitOid)
    await this.sync()
    return bookmark
  }

  async listBookmarks(): Promise<Bookmark[]> {
    return this.metadataStore.listBookmarks()
  }

  // ─── Internal ────────────────────────────────────────────

  private async sync(): Promise<void> {
    if (this._config.settings.autoExportGit) {
      await exportToGitRefs(this.gitBackend, this.metadataStore)
    }
  }
}
