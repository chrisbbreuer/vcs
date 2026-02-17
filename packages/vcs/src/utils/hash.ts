import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Compute a SHA-256 hash of the given string.
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Compute an environment hash for attestation verification.
 * Captures platform, runtime version, and lockfile state.
 */
export async function computeEnvironmentHash(dir: string): Promise<{
  hash: string
  environment: {
    platform: string
    runtime: string
    runtimeVersion: string
    lockfileHash: string
  }
}> {
  const platform = `${process.platform}-${process.arch}`
  const runtime = 'bun'
  const runtimeVersion = typeof Bun !== 'undefined' ? Bun.version : process.version

  let lockfileHash = ''
  for (const lockfile of ['bun.lock', 'bun.lockb', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) {
    try {
      const content = await readFile(join(dir, lockfile))
      lockfileHash = createHash('sha256').update(content).digest('hex')
      break
    } catch {
      // try next lockfile
    }
  }

  const environment = { platform, runtime, runtimeVersion, lockfileHash }
  const hash = sha256(JSON.stringify(environment))

  return { hash, environment }
}
