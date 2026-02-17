import { openWorkspace } from '../workspace/workspace'
import { getDiffBetweenCommits } from '../workspace/diff'
import { formatOutput } from '../cli/output'
import { ChangeNotFoundError } from '../errors'
import type { ChangeId } from '../types'

interface ShowOptions { format?: string }

export async function show(changeIdPrefix: string, options?: ShowOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const allChanges = await ws.metadataStore.listChanges()
  const match = allChanges.find((c: any) => c.id.startsWith(changeIdPrefix))
  if (!match) throw new ChangeNotFoundError(changeIdPrefix)

  const commit = await ws.gitBackend.readCommit(match.currentCommitOid)
  let diffContent = ''
  if (commit.parent.length > 0) {
    diffContent = await getDiffBetweenCommits(ws.dir, commit.parent[0], match.currentCommitOid)
  }

  const bookmarks = (await ws.metadataStore.listBookmarks()).filter(b => b.changeId === match.id).map(b => b.name)

  formatOutput(options?.format, {
    type: 'show', changeId: match.id, commitOid: match.currentCommitOid,
    description: match.description, author: { name: commit.author.name, email: commit.author.email },
    date: new Date(commit.author.timestamp * 1000).toISOString(),
    parentChangeIds: match.parentChangeIds, predecessors: match.predecessors,
    sessionId: match.sessionId, taskId: match.taskId, transcriptIds: match.transcriptIds,
    labels: match.labels, bookmarks, diff: diffContent,
  }, () => {
    console.log(`Change:  ${match.id}`)
    console.log(`Commit:  ${match.currentCommitOid}`)
    console.log(`Author:  ${commit.author.name} <${commit.author.email}>`)
    console.log(`Date:    ${new Date(commit.author.timestamp * 1000).toISOString()}`)
    if (bookmarks.length) console.log(`Bookmarks: ${bookmarks.join(', ')}`)
    if (match.sessionId) console.log(`Session: ${match.sessionId}`)
    if (match.taskId) console.log(`Task:    ${match.taskId}`)
    if (match.predecessors.length) console.log(`Predecessors: ${match.predecessors.length} (amended ${match.predecessors.length} time(s))`)
    console.log(`\n    ${match.description}\n`)
    if (diffContent.trim()) { console.log(diffContent) } else { console.log('(empty diff)') }
  })
}
