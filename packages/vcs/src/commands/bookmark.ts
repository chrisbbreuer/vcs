import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'
import type { Bookmark } from '../types'

interface BookmarkOptions { format?: string }

export async function bookmarkCreate(name: string, options?: BookmarkOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const wc = await ws.metadataStore.getChange(ws.config.workingCopyChangeId)
  const parentChangeId = wc?.parentChangeIds?.[0] ?? ws.config.workingCopyChangeId
  const parentChange = await ws.metadataStore.getChange(parentChangeId)
  if (!parentChange) { console.error('No change to bookmark'); return }

  const bookmark: Bookmark = {
    name, changeId: parentChange.id,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  await ws.metadataStore.putBookmark(bookmark)
  await ws.gitBackend.writeRef(`refs/heads/${name}`, parentChange.currentCommitOid)
  await ws.finalize()

  formatOutput(options?.format, { type: 'bookmark-create', name, changeId: parentChange.id }, () => {
    console.log(`Created bookmark "${name}" at change ${parentChange.id.slice(0, 12)}`)
  })
}

export async function bookmarkSet(name: string, changeIdPrefix: string, options?: BookmarkOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const allChanges = await ws.metadataStore.listChanges()
  const match = allChanges.find(c => c.id.startsWith(changeIdPrefix))
  if (!match) { console.error(`Change not found: ${changeIdPrefix}`); return }

  const bookmark: Bookmark = {
    name, changeId: match.id,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  await ws.metadataStore.putBookmark(bookmark)
  await ws.gitBackend.writeRef(`refs/heads/${name}`, match.currentCommitOid)
  await ws.finalize()

  formatOutput(options?.format, { type: 'bookmark-set', name, changeId: match.id }, () => {
    console.log(`Set bookmark "${name}" to change ${match.id.slice(0, 12)}`)
  })
}

export async function bookmarkDelete(name: string, options?: BookmarkOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  await ws.metadataStore.deleteBookmark(name)
  try { await ws.gitBackend.deleteRef(`refs/heads/${name}`) } catch { /* ref may not exist */ }
  await ws.finalize()

  formatOutput(options?.format, { type: 'bookmark-delete', name }, () => {
    console.log(`Deleted bookmark "${name}"`)
  })
}

export async function bookmarkList(options?: BookmarkOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const bookmarks = await ws.metadataStore.listBookmarks()

  formatOutput(options?.format, { type: 'bookmark-list', bookmarks }, () => {
    if (bookmarks.length === 0) { console.log('No bookmarks.'); return }
    for (const b of bookmarks) {
      console.log(`  ${b.name} -> ${b.changeId.slice(0, 12)}`)
    }
  })
}
