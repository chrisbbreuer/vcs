import type { GitBackend, StatusRow } from '../storage/git-backend'

export interface FileChange {
  filepath: string
  status: 'added' | 'modified' | 'deleted' | 'untracked'
}

export function classifyStatus(row: StatusRow): FileChange | null {
  const [filepath, head, workdir, stage] = row
  if (head === 0 && workdir === 2) return { filepath, status: 'added' }
  if (head === 1 && workdir === 2 && head !== workdir) return { filepath, status: 'modified' }
  if (head === 1 && workdir === 0) return { filepath, status: 'deleted' }
  if (head === 0 && workdir === 2 && stage === 0) return { filepath, status: 'untracked' }
  // Staged but not yet committed
  if (stage === 2 && head === 0) return { filepath, status: 'added' }
  if (stage === 2 && head === 1) return { filepath, status: 'modified' }
  if (stage === 0 && head === 1) return { filepath, status: 'deleted' }
  return null
}

export async function getWorkingCopyChanges(gitBackend: GitBackend): Promise<FileChange[]> {
  const matrix = await gitBackend.statusMatrix()
  const changes: FileChange[] = []

  for (const row of matrix) {
    const change = classifyStatus(row)
    if (change) changes.push(change)
  }

  return changes
}

export async function getDiffOutput(dir: string, args: string[] = []): Promise<string> {
  const proc = Bun.spawn(['git', 'diff', ...args], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return new Response(proc.stdout).text()
}

export async function getDiffBetweenCommits(dir: string, from: string, to: string): Promise<string> {
  const proc = Bun.spawn(['git', 'diff', from, to], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return new Response(proc.stdout).text()
}
