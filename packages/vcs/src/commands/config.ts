import { openWorkspace } from '../workspace/workspace'
import { getConfig } from '../config'
import { formatOutput } from '../cli/output'

interface ConfigOptions { format?: string }

export async function configShow(options?: ConfigOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const vcsConfig = await getConfig()

  formatOutput(options?.format, {
    type: 'config',
    workspace: {
      workingCopyChangeId: ws.config.workingCopyChangeId,
      activeSessionId: ws.config.activeSessionId,
      activeTaskId: ws.config.activeTaskId,
      defaultActor: ws.config.defaultActor,
      settings: ws.config.settings,
    },
    project: vcsConfig,
  }, () => {
    console.log('Workspace config:')
    console.log(`  Working copy: ${ws.config.workingCopyChangeId.slice(0, 12)}`)
    console.log(`  Active session: ${ws.config.activeSessionId?.slice(0, 8) ?? 'none'}`)
    console.log(`  Active task: ${ws.config.activeTaskId?.slice(0, 8) ?? 'none'}`)
    console.log(`  Author: ${ws.config.defaultActor.name} <${ws.config.defaultActor.email}>`)
    console.log(`  Auto-import git: ${ws.config.settings.autoImportGit}`)
    console.log(`  Auto-export git: ${ws.config.settings.autoExportGit}`)
    console.log('\nProject config (vcs.config.ts):')
    console.log(`  Verbose: ${vcsConfig.verbose}`)
    const checks = vcsConfig.ci?.checks ?? []
    if (checks.length > 0) {
      console.log(`  CI checks (${checks.length}):`)
      for (const c of checks) {
        console.log(`    - ${c.name}: ${c.command}`)
      }
    }
  })
}
