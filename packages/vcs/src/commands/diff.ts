import { openWorkspace } from '../workspace/workspace'
import { getDiffOutput } from '../workspace/diff'

interface DiffOptions { format?: string }

export async function diff(options?: DiffOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const output = await getDiffOutput(ws.dir)
  if (options?.format === 'json') {
    console.log(JSON.stringify({ type: 'diff', content: output }))
  } else {
    if (output.trim()) { console.log(output) } else { console.log('No differences.') }
  }
}
