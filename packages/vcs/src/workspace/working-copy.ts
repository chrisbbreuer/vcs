import type { ActorInfo, Change, ChangeId, CommitOid, EntityId } from '../types'
import type { GitBackend, GitAuthor } from '../storage/git-backend'
import type { MetadataStore } from '../storage/metadata-store'
import { generateChangeId } from '../utils/id'
import { addTrailers } from '../utils/trailers'
import { NothingToCommitError, ChangeNotFoundError } from '../errors'

export class WorkingCopy {
  constructor(
    private dir: string,
    private gitBackend: GitBackend,
    private metadataStore: MetadataStore,
  ) {}

  async currentChangeId(): Promise<ChangeId> {
    const config = await this.metadataStore.getConfig()
    return config.workingCopyChangeId
  }

  async currentChange(): Promise<Change | null> {
    const id = await this.currentChangeId()
    return this.metadataStore.getChange(id)
  }

  async snapshot(params: {
    message: string
    actor: ActorInfo
    trailers?: Record<string, string>
    taskId?: EntityId
    sessionId?: EntityId
    transcriptIds?: EntityId[]
    labels?: string[]
    dependsOn?: ChangeId[]
  }): Promise<{ change: Change; commitOid: CommitOid }> {
    const config = await this.metadataStore.getConfig()
    const changeId = config.workingCopyChangeId
    const existingChange = await this.metadataStore.getChange(changeId)

    // Stage all modified/deleted files (no staging area like jj)
    const status = await this.gitBackend.statusMatrix()
    let hasChanges = false

    for (const [filepath, head, workdir, stage] of status) {
      if (workdir !== head || stage !== head) {
        if (workdir === 2 && stage !== 2) {
          await this.gitBackend.add(filepath)
          hasChanges = true
        } else if (workdir === 0 && head === 1) {
          await this.gitBackend.remove(filepath)
          hasChanges = true
        } else if (stage === 2 || stage === 3) {
          hasChanges = true
        } else if (workdir === 2 && stage === 2 && head !== workdir) {
          hasChanges = true
        }
      }
    }

    if (!hasChanges) throw new NothingToCommitError()

    // Build commit message with trailers
    const allTrailers: Record<string, string> = {
      'Change-Id': changeId,
      ...params.trailers,
    }
    if (params.sessionId) allTrailers['Session-Id'] = params.sessionId
    if (params.taskId) allTrailers['Task-Id'] = params.taskId
    if (params.transcriptIds?.length) allTrailers['Transcript-Id'] = params.transcriptIds[0]
    allTrailers['VCS-Version'] = '0.1.0'

    const fullMessage = addTrailers(params.message, allTrailers)

    const now = Math.floor(Date.now() / 1000)
    const author: GitAuthor = {
      name: params.actor.name,
      email: params.actor.email,
      timestamp: now,
      timezoneOffset: new Date().getTimezoneOffset(),
    }

    const commitOid = await this.gitBackend.commit({
      message: fullMessage,
      author,
    })

    // Update or create the change
    const predecessors = existingChange?.currentCommitOid && existingChange.currentCommitOid !== commitOid
      ? [...(existingChange.predecessors || []), existingChange.currentCommitOid]
      : existingChange?.predecessors || []

    // Resolve parent change IDs from the commit
    const commitObj = await this.gitBackend.readCommit(commitOid)
    const parentChangeIds: ChangeId[] = []
    for (const poid of commitObj.parent) {
      const pc = await this.metadataStore.getChangeByCommit(poid as CommitOid)
      if (pc) parentChangeIds.push(pc.id)
    }

    const change: Change = {
      id: changeId,
      currentCommitOid: commitOid,
      predecessors,
      dependsOn: params.dependsOn ?? existingChange?.dependsOn ?? [],
      parentChangeIds,
      taskId: params.taskId ?? config.activeTaskId ?? existingChange?.taskId ?? null,
      sessionId: params.sessionId ?? config.activeSessionId ?? existingChange?.sessionId ?? null,
      transcriptIds: params.transcriptIds ?? existingChange?.transcriptIds ?? [],
      description: params.message,
      labels: params.labels ?? existingChange?.labels ?? [],
      abandoned: false,
      createdAt: existingChange?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await this.metadataStore.putChange(change)
    await this.gitBackend.writeRef(`refs/vcs/changes/${changeId}`, commitOid)
    await this.gitBackend.writeRef(`refs/vcs/keep/${commitOid.slice(0, 16)}`, commitOid)

    // Create a new working copy change on top
    const newChangeId = generateChangeId()
    const newChange: Change = {
      id: newChangeId,
      currentCommitOid: commitOid,
      predecessors: [],
      dependsOn: [],
      parentChangeIds: [changeId],
      taskId: config.activeTaskId,
      sessionId: config.activeSessionId,
      transcriptIds: [],
      description: '(working copy)',
      labels: [],
      abandoned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.metadataStore.putChange(newChange)

    config.workingCopyChangeId = newChangeId
    await this.metadataStore.putConfig(config)

    return { change, commitOid }
  }

  async amend(params: {
    message?: string
    actor: ActorInfo
  }): Promise<{ change: Change; commitOid: CommitOid }> {
    const config = await this.metadataStore.getConfig()
    const changeId = config.workingCopyChangeId
    const workingChange = await this.metadataStore.getChange(changeId)

    // Find the parent change (the one we're amending)
    if (!workingChange?.parentChangeIds.length) {
      throw new ChangeNotFoundError('No parent change to amend')
    }

    const parentChangeId = workingChange.parentChangeIds[0]
    const parentChange = await this.metadataStore.getChange(parentChangeId)
    if (!parentChange) throw new ChangeNotFoundError(parentChangeId)

    // Stage all changes
    const status = await this.gitBackend.statusMatrix()
    for (const [filepath, head, workdir, stage] of status) {
      if (workdir === 2 && stage !== 2) {
        await this.gitBackend.add(filepath)
      } else if (workdir === 0 && head === 1) {
        await this.gitBackend.remove(filepath)
      }
    }

    const message = params.message ?? parentChange.description
    const allTrailers: Record<string, string> = {
      'Change-Id': parentChangeId,
      'VCS-Version': '0.1.0',
    }
    if (parentChange.sessionId) allTrailers['Session-Id'] = parentChange.sessionId
    if (parentChange.taskId) allTrailers['Task-Id'] = parentChange.taskId

    const fullMessage = addTrailers(message, allTrailers)

    const now = Math.floor(Date.now() / 1000)
    const author: GitAuthor = {
      name: params.actor.name,
      email: params.actor.email,
      timestamp: now,
      timezoneOffset: new Date().getTimezoneOffset(),
    }

    const commitOid = await this.gitBackend.commit({ message: fullMessage, author })

    // Update parent change with new commit, preserving change ID
    const updatedParent: Change = {
      ...parentChange,
      currentCommitOid: commitOid,
      predecessors: [...parentChange.predecessors, parentChange.currentCommitOid],
      description: message,
      updatedAt: new Date().toISOString(),
    }

    await this.metadataStore.putChange(updatedParent)
    await this.gitBackend.writeRef(`refs/vcs/changes/${parentChangeId}`, commitOid)
    await this.gitBackend.writeRef(`refs/vcs/keep/${commitOid.slice(0, 16)}`, commitOid)

    // Update working copy change to point to new commit
    const updatedWorking: Change = {
      ...workingChange,
      currentCommitOid: commitOid,
      updatedAt: new Date().toISOString(),
    }
    await this.metadataStore.putChange(updatedWorking)

    return { change: updatedParent, commitOid }
  }

  async checkout(changeId: ChangeId): Promise<void> {
    const change = await this.metadataStore.getChange(changeId)
    if (!change) throw new ChangeNotFoundError(changeId)

    const proc = Bun.spawn(['git', 'checkout', change.currentCommitOid, '--', '.'], {
      cwd: this.dir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await proc.exited

    const config = await this.metadataStore.getConfig()

    // Create a new working copy change on top of the target
    const newChangeId = generateChangeId()
    const newChange: Change = {
      id: newChangeId,
      currentCommitOid: change.currentCommitOid,
      predecessors: [],
      dependsOn: [],
      parentChangeIds: [changeId],
      taskId: config.activeTaskId,
      sessionId: config.activeSessionId,
      transcriptIds: [],
      description: '(working copy)',
      labels: [],
      abandoned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.metadataStore.putChange(newChange)

    config.workingCopyChangeId = newChangeId
    await this.metadataStore.putConfig(config)
  }
}
