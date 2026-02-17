import { openWorkspace } from '../workspace/workspace'
import { formatOutput } from '../cli/output'
import { getConfig } from '../config'
import { generateEntityId } from '../utils/id'
import { computeEnvironmentHash } from '../utils/hash'
import type { Attestation } from '../types'

interface CiStatusOptions { format?: string }
interface CiRunOptions { format?: string }

export async function ciStatus(options?: CiStatusOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const vcsConfig = await getConfig()

  const currentChange = await ws.metadataStore.getChange(ws.config.workingCopyChangeId)
  const parentChangeId = currentChange?.parentChangeIds?.[0]
  if (!parentChangeId) { console.log('No change to check CI status for.'); return }

  const attestations = await ws.metadataStore.listAttestations(parentChangeId)
  const configuredChecks = vcsConfig.ci?.checks ?? []

  const checkStatuses = configuredChecks.map(check => {
    const matching = attestations.filter(a => a.name === check.name)
    const latest = matching.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    return {
      name: check.name,
      command: check.command,
      status: latest ? (latest.passed ? 'passed' : 'failed') : 'pending',
      attestationId: latest?.id ?? null,
      durationMs: latest?.durationMs ?? null,
      createdAt: latest?.createdAt ?? null,
    }
  })

  // Also include attestations not in config
  const unconfigured = attestations.filter(a => !configuredChecks.some(c => c.name === a.name))
  for (const a of unconfigured) {
    checkStatuses.push({
      name: a.name,
      command: a.command,
      status: a.passed ? 'passed' : 'failed',
      attestationId: a.id,
      durationMs: a.durationMs,
      createdAt: a.createdAt,
    })
  }

  const allPassed = checkStatuses.every(c => c.status === 'passed')
  const anyFailed = checkStatuses.some(c => c.status === 'failed')

  formatOutput(options?.format, { type: 'ci-status', changeId: parentChangeId, checks: checkStatuses, allPassed, anyFailed }, () => {
    console.log(`CI status for change ${parentChangeId.slice(0, 12)}:\n`)
    for (const check of checkStatuses) {
      const icon = check.status === 'passed' ? '+' : check.status === 'failed' ? 'x' : '-'
      const duration = check.durationMs ? ` (${check.durationMs}ms)` : ''
      console.log(`  ${icon} ${check.name}: ${check.status}${duration}`)
    }
    console.log(`\nOverall: ${allPassed ? 'ALL PASSED' : anyFailed ? 'SOME FAILED' : 'PENDING'}`)
  })
}

export async function ciRun(options?: CiRunOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const vcsConfig = await getConfig()
  const checks = vcsConfig.ci?.checks ?? []

  if (checks.length === 0) {
    console.log('No CI checks configured. Add checks to vcs.config.ts')
    return
  }

  const currentChange = await ws.metadataStore.getChange(ws.config.workingCopyChangeId)
  const parentChangeId = currentChange?.parentChangeIds?.[0]
  const parentChange = parentChangeId ? await ws.metadataStore.getChange(parentChangeId) : null
  if (!parentChange) { console.error('No change to run CI against'); return }

  const results: Array<{ name: string; passed: boolean; durationMs: number }> = []

  for (const check of checks) {
    console.log(`Running: ${check.name} (${check.command})...`)
    const startTime = Date.now()
    const proc = Bun.spawn(['sh', '-c', check.command], { cwd: ws.dir, stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    const durationMs = Date.now() - startTime
    const { hash, environment } = await computeEnvironmentHash(ws.dir)

    const attestation: Attestation = {
      id: generateEntityId(),
      changeId: parentChange.id,
      commitOid: parentChange.currentCommitOid,
      name: check.name,
      command: check.command,
      exitCode,
      stdout: stdout.slice(0, 10000),
      stderr: stderr.slice(0, 10000),
      durationMs,
      environmentHash: hash,
      environment,
      passed: exitCode === 0,
      createdAt: new Date().toISOString(),
    }
    await ws.metadataStore.putAttestation(attestation)
    results.push({ name: check.name, passed: attestation.passed, durationMs })

    const status = attestation.passed ? 'PASSED' : 'FAILED'
    console.log(`  ${status} (${durationMs}ms)`)
  }

  const allPassed = results.every(r => r.passed)
  formatOutput(options?.format, { type: 'ci-run', changeId: parentChange.id, results, allPassed }, () => {
    console.log(`\n${allPassed ? 'All checks passed' : 'Some checks failed'}`)
  })
}
