// Branded types for type safety
export type ChangeId = string & { readonly __brand: 'ChangeId' }
export type CommitOid = string & { readonly __brand: 'CommitOid' }
export type EntityId = string & { readonly __brand: 'EntityId' }
export type OperationId = string & { readonly __brand: 'OperationId' }

// The fundamental unit — replaces git's commit-as-identity.
// Change IDs are stable across rewrites (like jj).
export interface Change {
  id: ChangeId
  currentCommitOid: CommitOid
  predecessors: CommitOid[] // previous commits for this change (amend history)
  parentChangeIds: ChangeId[] // DAG parents
  dependsOn: ChangeId[] // semantic dependencies (not DAG)
  sessionId: EntityId | null
  taskId: EntityId | null
  transcriptIds: EntityId[]
  description: string
  labels: string[]
  abandoned: boolean
  createdAt: string
  updatedAt: string
}

// Pillar 1: LLM transcripts as first-class objects
export interface Transcript {
  id: EntityId
  changeIds: ChangeId[]
  sessionId: EntityId
  turns: TranscriptTurn[]
  model: string
  tokenCount: number
  summary: string
  blobOids: CommitOid[] // git blob OIDs storing turn content
  createdAt: string
}

export interface TranscriptTurn {
  role: 'human' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: string
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  name: string
  input: string
  output: string
}

// Pillar 2: Zoom levels for context
export interface Session {
  id: EntityId
  objective: string
  taskIds: EntityId[]
  changeIds: ChangeId[]
  transcriptIds: EntityId[]
  status: 'active' | 'completed' | 'abandoned'
  environment: SessionEnvironment
  startedAt: string
  endedAt: string | null
}

export interface SessionEnvironment {
  model?: string
  tool?: string
  cwd?: string
}

export interface Task {
  id: EntityId
  sessionId: EntityId
  description: string
  changeIds: ChangeId[]
  transcriptIds: EntityId[]
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  createdAt: string
  completedAt: string | null
}

// Pillar 3: Integrated CI
export interface Attestation {
  id: EntityId
  changeId: ChangeId
  commitOid: CommitOid
  name: string
  command: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  environmentHash: string
  environment: AttestationEnvironment
  passed: boolean
  createdAt: string
}

export interface AttestationEnvironment {
  platform: string
  runtime: string
  runtimeVersion: string
  lockfileHash: string
}

// Operation log (undo support, like jj)
export interface Operation {
  id: OperationId
  parentId: OperationId | null
  type: string
  description: string
  command: string
  snapshotBefore: Record<string, string>
  snapshotAfter: Record<string, string>
  actor: ActorInfo
  timestamp: string
}

export interface ActorInfo {
  name: string
  email: string
}

// Bookmark (maps bidirectionally to git branches)
export interface Bookmark {
  name: string
  changeId: ChangeId
  createdAt: string
  updatedAt: string
}

// Workspace config stored in .vcs/config.json
export interface WorkspaceConfig {
  version: number
  workspaceId: EntityId
  colocated: boolean
  gitDir: string
  defaultActor: ActorInfo
  workingCopyChangeId: ChangeId
  operationHead: OperationId
  activeSessionId: EntityId | null
  activeTaskId: EntityId | null
  settings: WorkspaceSettings
}

export interface WorkspaceSettings {
  defaultFormat: 'text' | 'json'
  autoImportGit: boolean
  autoExportGit: boolean
}

// VCS user-facing config file (vcs.config.ts, loaded by bunfig)
export interface VcsConfig {
  verbose: boolean
  author: ActorInfo
  ci: CiConfig
}

export interface CiConfig {
  checks: CiCheck[]
}

export interface CiCheck {
  name: string
  command: string
}
