import type { ActorInfo, ChangeId, Change, CommitOid } from '../types'
import type { GitBackend, GitCommitObject } from '../storage/git-backend'
import type { MetadataStore } from '../storage/metadata-store'
import { deriveChangeIdFromCommit } from '../utils/id'
import { parseTrailers } from '../utils/trailers'

export interface ImportResult {
  newChanges: number
  updatedBookmarks: number
  errors: string[]
}

export interface ExportResult {
  updatedBranches: number
  errors: string[]
}

/**
 * Import git state into VCS.
 * Detects new git commits and creates Change records for them.
 * Runs automatically on every VCS command when autoImportGit is true.
 */
export async function importGitRefs(
  gitBackend: GitBackend,
  metadataStore: MetadataStore,
  actor: ActorInfo,
): Promise<ImportResult> {
  const result: ImportResult = { newChanges: 0, updatedBookmarks: 0, errors: [] }

  // Build set of known commit OIDs
  const knownCommitOids = new Set<string>()
  const allChangeIds = await metadataStore.getAllChangeIds()
  for (const cid of allChangeIds) {
    const change = await metadataStore.getChange(cid)
    if (change) {
      knownCommitOids.add(change.currentCommitOid)
      for (const pred of change.predecessors) {
        knownCommitOids.add(pred)
      }
    }
  }

  // List all git branch heads
  const branchRefs = await gitBackend.listRefs('refs/heads/')

  // For each branch, walk backwards and create changes for unknown commits
  for (const { ref, oid } of branchRefs) {
    const newCommits = await walkNewCommits(gitBackend, oid as CommitOid, knownCommitOids)

    // Process oldest first so parents exist when children are created
    for (const commit of newCommits.reverse()) {
      try {
        const trailers = parseTrailers(commit.message)
        const changeId: ChangeId = trailers['Change-Id']
          ? trailers['Change-Id'] as ChangeId
          : deriveChangeIdFromCommit(commit.oid as CommitOid)

        // Skip if we already have this change
        const existing = await metadataStore.getChange(changeId)
        if (existing) {
          knownCommitOids.add(commit.oid)
          continue
        }

        // Resolve parent change IDs
        const parentChangeIds: ChangeId[] = []
        for (const parentOid of commit.parent) {
          const parentChange = await metadataStore.getChangeByCommit(parentOid as CommitOid)
          if (parentChange) parentChangeIds.push(parentChange.id)
        }

        const change: Change = {
          id: changeId,
          currentCommitOid: commit.oid as CommitOid,
          predecessors: [],
          dependsOn: [],
          parentChangeIds,
          taskId: (trailers['Task-Id'] ?? null) as any,
          sessionId: (trailers['Session-Id'] ?? null) as any,
          transcriptIds: trailers['Transcript-Id'] ? [trailers['Transcript-Id'] as any] : [],
          description: commit.message.split('\n')[0],
          labels: [],
          abandoned: false,
          createdAt: new Date(commit.author.timestamp * 1000).toISOString(),
          updatedAt: new Date(commit.author.timestamp * 1000).toISOString(),
        }

        await metadataStore.putChange(change)
        await gitBackend.writeRef(`refs/vcs/changes/${changeId}`, commit.oid)
        await gitBackend.writeRef(`refs/vcs/keep/${commit.oid.slice(0, 16)}`, commit.oid)

        knownCommitOids.add(commit.oid)
        result.newChanges++
      } catch (err) {
        result.errors.push(`Failed to import commit ${commit.oid}: ${err}`)
      }
    }
  }

  // Update bookmarks to match git branches
  for (const { ref, oid } of branchRefs) {
    const branchName = ref.replace('refs/heads/', '')
    const change = await metadataStore.getChangeByCommit(oid as CommitOid)
    if (!change) continue

    const existing = await metadataStore.getBookmark(branchName)
    if (!existing || existing.changeId !== change.id) {
      await metadataStore.putBookmark({
        name: branchName,
        changeId: change.id,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      result.updatedBookmarks++
    }
  }

  return result
}

/**
 * Export VCS state back to git.
 * Syncs bookmarks to git branches.
 */
export async function exportToGitRefs(
  gitBackend: GitBackend,
  metadataStore: MetadataStore,
): Promise<ExportResult> {
  const result: ExportResult = { updatedBranches: 0, errors: [] }
  const bookmarks = await metadataStore.listBookmarks()

  for (const bookmark of bookmarks) {
    const change = await metadataStore.getChange(bookmark.changeId)
    if (!change) continue

    try {
      const currentRef = await gitBackend.resolveRef(`refs/heads/${bookmark.name}`)
      if (currentRef !== change.currentCommitOid) {
        await gitBackend.writeRef(`refs/heads/${bookmark.name}`, change.currentCommitOid)
        result.updatedBranches++
      }
    } catch (err) {
      result.errors.push(`Failed to export bookmark ${bookmark.name}: ${err}`)
    }
  }

  return result
}

/**
 * Walk backwards from a commit, collecting all commits not in knownOids.
 */
async function walkNewCommits(
  gitBackend: GitBackend,
  startOid: CommitOid,
  knownOids: Set<string>,
): Promise<GitCommitObject[]> {
  const newCommits: GitCommitObject[] = []
  const visited = new Set<string>()
  const queue: string[] = [startOid]

  while (queue.length > 0) {
    const oid = queue.shift()!
    if (visited.has(oid) || knownOids.has(oid)) continue
    visited.add(oid)

    try {
      const commit = await gitBackend.readCommit(oid)
      newCommits.push(commit)

      for (const parentOid of commit.parent) {
        if (!visited.has(parentOid) && !knownOids.has(parentOid)) {
          queue.push(parentOid)
        }
      }
    } catch {
      // commit might not exist (shallow clone, etc.)
    }
  }

  return newCommits
}
