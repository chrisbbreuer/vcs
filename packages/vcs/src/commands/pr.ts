import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'

interface PrCreateOptions { title?: string; base?: string; format?: string }

export async function prCreate(options?: PrCreateOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())

  const currentChange = await ws.metadataStore.getChange(ws.config.workingCopyChangeId)
  const parentChangeId = currentChange?.parentChangeIds?.[0]
  const parentChange = parentChangeId ? await ws.metadataStore.getChange(parentChangeId) : null

  const title = options?.title ?? parentChange?.description ?? 'Untitled PR'
  const base = options?.base ?? 'main'

  // Build enriched PR body
  let body = '## Summary\n\n'
  if (parentChange) {
    body += `Change: \`${parentChange.id.slice(0, 12)}\`\n`
    body += `${parentChange.description}\n\n`
  }

  // Add session/task context
  if (ws.config.activeSessionId) {
    const session = await ws.metadataStore.getSession(ws.config.activeSessionId)
    if (session) {
      body += `## Session\n\nObjective: ${session.objective}\n\n`
      const tasks = await ws.metadataStore.listTasks(session.id)
      if (tasks.length > 0) {
        body += '### Tasks\n\n'
        for (const t of tasks) {
          const st = t.status === 'completed' ? '[x]' : '[ ]'
          body += `- ${st} ${t.description}\n`
        }
        body += '\n'
      }
    }
  }

  // Add attestation status
  if (parentChangeId) {
    const attestations = await ws.metadataStore.listAttestations(parentChangeId)
    if (attestations.length > 0) {
      body += '## Attestations\n\n'
      for (const a of attestations) {
        const icon = a.passed ? '+' : 'x'
        body += `- ${icon} **${a.name}**: ${a.passed ? 'passed' : 'failed'} (${a.durationMs}ms)\n`
      }
      body += '\n'
    }
  }

  // Add transcript summaries
  if (parentChange?.transcriptIds.length) {
    body += '## AI Context\n\n'
    for (const tid of parentChange.transcriptIds) {
      const t = await ws.metadataStore.getTranscript(tid)
      if (t) {
        body += `- **${t.model}** (${t.turns.length} turns, ~${t.tokenCount} tokens): ${t.summary.slice(0, 200)}\n`
      }
    }
    body += '\n'
  }

  body += '---\nGenerated with [VCS](https://github.com/stacksjs/vcs)\n'

  // Create PR via gh CLI
  const args = ['gh', 'pr', 'create', '--title', title, '--body', body, '--base', base]
  console.log(`Creating PR: "${title}" -> ${base}`)

  const proc = Bun.spawn(args, { cwd: ws.dir, stdout: 'pipe', stderr: 'pipe' })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    console.error(`Failed to create PR: ${stderr}`)
    return
  }

  const prUrl = stdout.trim()
  formatOutput(options?.format, { type: 'pr-create', title, base, url: prUrl, body }, () => {
    console.log(`PR created: ${prUrl}`)
  })
}
