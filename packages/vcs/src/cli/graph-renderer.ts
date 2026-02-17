import type { Change, ChangeId, Bookmark } from '../types'

interface GraphNode {
  changeId: ChangeId
  shortId: string
  commitOid: string
  description: string
  isWorkingCopy: boolean
  bookmarks: string[]
  labels: string[]
  sessionId: string | null
  taskId: string | null
  parentChangeIds: ChangeId[]
  depth: number
}

/**
 * Render an ASCII graph of changes, similar to jj/Sapling smartlog.
 *
 * Example output:
 *   @  xqxn 4a8b | (working copy)
 *   o  kkqr a1b2 (main) | Fix auth token refresh
 *   o  lmno e5f6 | Add rate limiting
 *   o  mnop 9c0d | Initial commit
 */
export function renderGraph(
  changes: Change[],
  workingCopyId: ChangeId,
  bookmarks: Bookmark[],
): string {
  if (changes.length === 0) return 'No changes yet.\n'

  // Build a map for quick lookup
  const changeMap = new Map<ChangeId, Change>()
  for (const c of changes) changeMap.set(c.id, c)

  // Build bookmark map
  const bookmarkMap = new Map<ChangeId, string[]>()
  for (const b of bookmarks) {
    const existing = bookmarkMap.get(b.changeId) ?? []
    existing.push(b.name)
    bookmarkMap.set(b.changeId, existing)
  }

  // Sort: working copy first, then by updatedAt descending
  const sorted = [...changes].sort((a, b) => {
    if (a.id === workingCopyId) return -1
    if (b.id === workingCopyId) return 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })

  const lines: string[] = []

  for (let i = 0; i < sorted.length; i++) {
    const change = sorted[i]
    const isWc = change.id === workingCopyId
    const marker = isWc ? '@' : 'o'
    const shortId = change.id.slice(0, 4)
    const shortOid = change.currentCommitOid.slice(0, 4)
    const bms = bookmarkMap.get(change.id)
    const bmStr = bms ? ` (${bms.join(', ')})` : ''
    const labelStr = change.labels.length > 0 ? ` [${change.labels.join(', ')}]` : ''

    const line = `${marker}  ${shortId} ${shortOid}${bmStr}${labelStr} | ${change.description}`
    lines.push(line)

    // Draw connector to next node
    if (i < sorted.length - 1) {
      lines.push('|')
    }
  }

  return lines.join('\n') + '\n'
}

/**
 * Render a compact smartlog showing only relevant changes:
 * - Working copy and its ancestors up to a bookmark
 * - All bookmarked changes
 */
export function renderSmartlog(
  changes: Change[],
  workingCopyId: ChangeId,
  bookmarks: Bookmark[],
): string {
  const bookmarkedIds = new Set(bookmarks.map(b => b.changeId))
  const changeMap = new Map<ChangeId, Change>()
  for (const c of changes) changeMap.set(c.id, c)

  // Walk from working copy to root, collecting relevant changes
  const relevant = new Set<ChangeId>()
  let current = workingCopyId

  // Add working copy
  relevant.add(current)

  // Walk ancestors
  while (true) {
    const change = changeMap.get(current)
    if (!change) break
    relevant.add(change.id)
    if (change.parentChangeIds.length === 0) break
    current = change.parentChangeIds[0]
  }

  // Add all bookmarked changes
  for (const id of bookmarkedIds) {
    relevant.add(id)
  }

  const filtered = changes.filter(c => relevant.has(c.id))
  return renderGraph(filtered, workingCopyId, bookmarks)
}
