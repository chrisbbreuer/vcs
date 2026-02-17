import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type {
  Attestation,
  Bookmark,
  Change,
  ChangeId,
  CommitOid,
  EntityId,
  Operation,
  OperationId,
  Session,
  Task,
  Transcript,
  WorkspaceConfig,
} from '../types'
import type { MetadataStore } from './metadata-store'

export class JsonMetadataStore implements MetadataStore {
  constructor(private vcsdir: string) {}

  private storePath(collection: string, id: string): string {
    return path.join(this.vcsdir, 'store', collection, `${id}.json`)
  }

  private storeDir(collection: string): string {
    return path.join(this.vcsdir, 'store', collection)
  }

  private async readJson<T>(filepath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filepath, 'utf8')
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }

  private async writeJson(filepath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filepath), { recursive: true })
    await fs.writeFile(filepath, JSON.stringify(data, null, 2) + '\n')
  }

  private async listDir(dir: string): Promise<string[]> {
    try {
      const files = await fs.readdir(dir)
      return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
    } catch {
      return []
    }
  }

  // Config
  async getConfig(): Promise<WorkspaceConfig> {
    const config = await this.readJson<WorkspaceConfig>(path.join(this.vcsdir, 'config.json'))
    if (!config) throw new Error('Workspace config not found. Run "vcs init" first.')
    return config
  }

  async putConfig(config: WorkspaceConfig): Promise<void> {
    await this.writeJson(path.join(this.vcsdir, 'config.json'), config)
  }

  // Changes
  async getChange(id: ChangeId): Promise<Change | null> {
    return this.readJson<Change>(this.storePath('changes', id))
  }

  async getChangeByCommit(oid: CommitOid): Promise<Change | null> {
    const ids = await this.getAllChangeIds()
    let workingCopyMatch: Change | null = null
    for (const id of ids) {
      const change = await this.getChange(id as ChangeId)
      if (change?.currentCommitOid === oid) {
        // Prefer non-working-copy changes when multiple share the same commit
        if (change.description !== '(working copy)') return change
        workingCopyMatch = change
      }
    }
    return workingCopyMatch
  }

  async putChange(change: Change): Promise<void> {
    await this.writeJson(this.storePath('changes', change.id), change)
  }

  async getAllChangeIds(): Promise<ChangeId[]> {
    return (await this.listDir(this.storeDir('changes'))) as ChangeId[]
  }

  async listChanges(): Promise<Change[]> {
    const ids = await this.getAllChangeIds()
    const changes: Change[] = []
    for (const id of ids) {
      const change = await this.getChange(id as ChangeId)
      if (change && !change.abandoned) changes.push(change)
    }
    return changes
  }

  // Sessions
  async getSession(id: EntityId): Promise<Session | null> {
    return this.readJson<Session>(this.storePath('sessions', id))
  }

  async putSession(session: Session): Promise<void> {
    await this.writeJson(this.storePath('sessions', session.id), session)
  }

  async listSessions(): Promise<Session[]> {
    const ids = await this.listDir(this.storeDir('sessions'))
    const sessions: Session[] = []
    for (const id of ids) {
      const session = await this.getSession(id as EntityId)
      if (session) sessions.push(session)
    }
    return sessions
  }

  // Tasks
  async getTask(id: EntityId): Promise<Task | null> {
    return this.readJson<Task>(this.storePath('tasks', id))
  }

  async putTask(task: Task): Promise<void> {
    await this.writeJson(this.storePath('tasks', task.id), task)
  }

  async listTasks(sessionId?: EntityId): Promise<Task[]> {
    const ids = await this.listDir(this.storeDir('tasks'))
    const tasks: Task[] = []
    for (const id of ids) {
      const task = await this.getTask(id as EntityId)
      if (task && (!sessionId || task.sessionId === sessionId)) tasks.push(task)
    }
    return tasks
  }

  // Transcripts
  async getTranscript(id: EntityId): Promise<Transcript | null> {
    return this.readJson<Transcript>(this.storePath('transcripts', id))
  }

  async putTranscript(transcript: Transcript): Promise<void> {
    await this.writeJson(this.storePath('transcripts', transcript.id), transcript)
  }

  async listTranscripts(filter?: { changeId?: ChangeId; sessionId?: EntityId }): Promise<Transcript[]> {
    const ids = await this.listDir(this.storeDir('transcripts'))
    const transcripts: Transcript[] = []
    for (const id of ids) {
      const transcript = await this.getTranscript(id as EntityId)
      if (!transcript) continue
      if (filter?.changeId && !transcript.changeIds.includes(filter.changeId)) continue
      if (filter?.sessionId && transcript.sessionId !== filter.sessionId) continue
      transcripts.push(transcript)
    }
    return transcripts
  }

  // Attestations
  async getAttestation(id: EntityId): Promise<Attestation | null> {
    return this.readJson<Attestation>(this.storePath('attestations', id))
  }

  async putAttestation(attestation: Attestation): Promise<void> {
    await this.writeJson(this.storePath('attestations', attestation.id), attestation)
  }

  async listAttestations(changeId?: ChangeId): Promise<Attestation[]> {
    const ids = await this.listDir(this.storeDir('attestations'))
    const attestations: Attestation[] = []
    for (const id of ids) {
      const attestation = await this.getAttestation(id as EntityId)
      if (!attestation) continue
      if (changeId && attestation.changeId !== changeId) continue
      attestations.push(attestation)
    }
    return attestations
  }

  // Bookmarks
  async getBookmark(name: string): Promise<Bookmark | null> {
    return this.readJson<Bookmark>(this.storePath('bookmarks', name))
  }

  async putBookmark(bookmark: Bookmark): Promise<void> {
    await this.writeJson(this.storePath('bookmarks', bookmark.name), bookmark)
  }

  async deleteBookmark(name: string): Promise<void> {
    try {
      await fs.unlink(this.storePath('bookmarks', name))
    } catch {
      // doesn't exist
    }
  }

  async listBookmarks(): Promise<Bookmark[]> {
    const names = await this.listDir(this.storeDir('bookmarks'))
    const bookmarks: Bookmark[] = []
    for (const name of names) {
      const bookmark = await this.getBookmark(name)
      if (bookmark) bookmarks.push(bookmark)
    }
    return bookmarks
  }

  // Operations
  async getOperation(id: OperationId): Promise<Operation | null> {
    return this.readJson<Operation>(this.storePath('operations', id))
  }

  async appendOperation(operation: Operation): Promise<void> {
    await this.writeJson(this.storePath('operations', operation.id), operation)
  }

  async listOperations(limit?: number): Promise<Operation[]> {
    const ids = await this.listDir(this.storeDir('operations'))
    const operations: Operation[] = []
    for (const id of ids) {
      const op = await this.getOperation(id as OperationId)
      if (op) operations.push(op)
    }
    // Sort by timestamp descending
    operations.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return limit ? operations.slice(0, limit) : operations
  }
}
