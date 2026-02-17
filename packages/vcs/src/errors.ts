import type { ChangeId, EntityId } from './types'

export class VcsError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint?: string,
  ) {
    super(message)
    this.name = 'VcsError'
  }
}

export class NotARepoError extends VcsError {
  constructor(dir: string) {
    super(
      'NOT_A_REPO',
      `Not a git repository: ${dir}`,
      'Run "git init" first, then "vcs init" to initialize VCS.',
    )
  }
}

export class AlreadyInitError extends VcsError {
  constructor() {
    super(
      'ALREADY_INIT',
      'VCS workspace already initialized (.vcs/ exists)',
      'Use --force to re-initialize.',
    )
  }
}

export class ChangeNotFoundError extends VcsError {
  constructor(id: ChangeId | string) {
    super(
      'CHANGE_NOT_FOUND',
      `Change not found: ${id}`,
      'Run "vcs log" to see available changes.',
    )
  }
}

export class SessionNotFoundError extends VcsError {
  constructor(id: EntityId | string) {
    super(
      'SESSION_NOT_FOUND',
      `Session not found: ${id}`,
      'Run "vcs session:list" to see available sessions.',
    )
  }
}

export class NoActiveSessionError extends VcsError {
  constructor() {
    super(
      'NO_ACTIVE_SESSION',
      'No active session',
      'Run "vcs session:start -m <objective>" to start one.',
    )
  }
}

export class NoActiveTaskError extends VcsError {
  constructor() {
    super(
      'NO_ACTIVE_TASK',
      'No active task',
      'Run "vcs task:create -m <description>" to create one.',
    )
  }
}

export class NothingToCommitError extends VcsError {
  constructor() {
    super(
      'NOTHING_TO_COMMIT',
      'Nothing to commit, working tree clean',
    )
  }
}
