import * as path from 'node:path'
import type { WorkspaceConfig } from '../types'
import type { GitBackend } from '../storage/git-backend'
import { IsomorphicGitBackend } from '../storage/isomorphic-git-backend'
import type { MetadataStore } from '../storage/metadata-store'
import { JsonMetadataStore } from '../storage/json-metadata-store'
import { importGitRefs, exportToGitRefs } from './import-export'

export interface WorkspaceHandle {
  dir: string
  vcsdir: string
  gitdir: string
  gitBackend: GitBackend
  metadataStore: MetadataStore
  config: WorkspaceConfig
  finalize(): Promise<void>
}

/**
 * Open an existing VCS workspace. Called at the start of every command.
 * Performs automatic git import/export if configured.
 */
export async function openWorkspace(dir: string): Promise<WorkspaceHandle> {
  const vcsdir = path.join(dir, '.vcs')
  const gitdir = path.join(dir, '.git')

  const gitBackend = new IsomorphicGitBackend(dir, gitdir)
  const metadataStore = new JsonMetadataStore(vcsdir)

  const config = await metadataStore.getConfig()

  // Auto-import git refs
  if (config.settings.autoImportGit) {
    await importGitRefs(gitBackend, metadataStore, config.defaultActor)
  }

  return {
    dir,
    vcsdir,
    gitdir,
    gitBackend,
    metadataStore,
    config,

    async finalize(): Promise<void> {
      if (config.settings.autoExportGit) {
        await exportToGitRefs(gitBackend, metadataStore)
      }
    },
  }
}

/**
 * Find the workspace root by walking up from the given directory.
 */
export async function findWorkspaceRoot(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir)
  const { root } = path.parse(dir)

  while (dir !== root) {
    try {
      const fs = await import('node:fs/promises')
      await fs.access(path.join(dir, '.vcs', 'config.json'))
      return dir
    } catch {
      dir = path.dirname(dir)
    }
  }

  return null
}
