import { openWorkspace } from '../workspace/workspace'
import { generateEntityId } from '../utils/id'
import { computeEnvironmentHash } from '../utils/hash'
import { formatOutput } from '../cli/output'
import type { Attestation, EntityId } from '../types'

interface AttestOptions { command?: string; format?: string }

export async function attest(name: string, options?: AttestOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const command = options?.command
  if (!command) { console.error('--command is required'); return }

  const currentChange = await ws.metadataStore.getChange(ws.config.workingCopyChangeId)
  const parentChangeId = currentChange?.parentChangeIds?.[0]
  const parentChange = parentChangeId ? await ws.metadataStore.getChange(parentChangeId) : null
  if (!parentChange) { console.error('No change to attest against'); return }

  console.log(`Running: ${command}`)
  const startTime = Date.now()

  const proc = Bun.spawn(['sh', '-c', command], {
    cwd: ws.dir,
    stdout: 'pipe',
    stderr: 'pipe',
  })

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
    name,
    command,
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

  // Add git note
  const now = Math.floor(Date.now() / 1000)
  await ws.gitBackend.addNote({
    ref: 'refs/notes/vcs/attestations',
    oid: parentChange.currentCommitOid,
    note: JSON.stringify({ attestationId: attestation.id, name, passed: attestation.passed, durationMs, environmentHash: hash }),
    author: { name: ws.config.defaultActor.name, email: ws.config.defaultActor.email, timestamp: now, timezoneOffset: new Date().getTimezoneOffset() },
  })

  formatOutput(options?.format, { type: 'attest', attestation: { id: attestation.id, name, passed: attestation.passed, durationMs, exitCode } }, () => {
    const status = attestation.passed ? 'PASSED' : 'FAILED'
    console.log(`\n${status}: ${name} (${durationMs}ms, exit code ${exitCode})`)
    console.log(`  attestation: ${attestation.id.slice(0, 8)}`)
    console.log(`  change: ${parentChange.id.slice(0, 12)}`)
    console.log(`  environment: ${hash.slice(0, 12)}`)
  })
}
