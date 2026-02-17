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

export interface MetadataStore {
  // Config
  getConfig(): Promise<WorkspaceConfig>
  putConfig(config: WorkspaceConfig): Promise<void>

  // Changes
  getChange(id: ChangeId): Promise<Change | null>
  getChangeByCommit(oid: CommitOid): Promise<Change | null>
  putChange(change: Change): Promise<void>
  getAllChangeIds(): Promise<ChangeId[]>
  listChanges(): Promise<Change[]>

  // Sessions
  getSession(id: EntityId): Promise<Session | null>
  putSession(session: Session): Promise<void>
  listSessions(): Promise<Session[]>

  // Tasks
  getTask(id: EntityId): Promise<Task | null>
  putTask(task: Task): Promise<void>
  listTasks(sessionId?: EntityId): Promise<Task[]>

  // Transcripts
  getTranscript(id: EntityId): Promise<Transcript | null>
  putTranscript(transcript: Transcript): Promise<void>
  listTranscripts(filter?: { changeId?: ChangeId; sessionId?: EntityId }): Promise<Transcript[]>

  // Attestations
  getAttestation(id: EntityId): Promise<Attestation | null>
  putAttestation(attestation: Attestation): Promise<void>
  listAttestations(changeId?: ChangeId): Promise<Attestation[]>

  // Bookmarks
  getBookmark(name: string): Promise<Bookmark | null>
  putBookmark(bookmark: Bookmark): Promise<void>
  deleteBookmark(name: string): Promise<void>
  listBookmarks(): Promise<Bookmark[]>

  // Operations
  getOperation(id: OperationId): Promise<Operation | null>
  appendOperation(operation: Operation): Promise<void>
  listOperations(limit?: number): Promise<Operation[]>
}
