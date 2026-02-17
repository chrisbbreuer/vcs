import type { CommitOid } from '../types'

export interface GitAuthor {
  name: string
  email: string
  timestamp: number
  timezoneOffset: number
}

export interface GitCommitObject {
  oid: string
  message: string
  tree: string
  parent: string[]
  author: GitAuthor
  committer: GitAuthor
}

export interface GitRefEntry {
  ref: string
  oid: string
}

export type StatusRow = [string, number, number, number]

export interface GitBackend {
  readonly dir: string
  readonly gitdir: string

  // Object operations
  readCommit(oid: string): Promise<GitCommitObject>
  writeBlob(content: Uint8Array): Promise<string>
  readBlob(oid: string): Promise<Uint8Array>

  // Ref operations
  resolveRef(ref: string): Promise<string | null>
  writeRef(ref: string, oid: string): Promise<void>
  deleteRef(ref: string): Promise<void>
  listRefs(prefix: string): Promise<GitRefEntry[]>

  // Index/working copy operations
  add(filepath: string): Promise<void>
  remove(filepath: string): Promise<void>
  statusMatrix(): Promise<StatusRow[]>
  commit(params: {
    message: string
    author: GitAuthor
  }): Promise<CommitOid>

  // Notes operations
  addNote(params: {
    ref: string
    oid: string
    note: string
    author: GitAuthor
  }): Promise<void>
  readNote(params: { ref: string; oid: string }): Promise<string | null>

  // Log
  log(params: { ref: string; depth?: number }): Promise<GitCommitObject[]>
}
