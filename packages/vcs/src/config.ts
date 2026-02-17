import type { VcsConfig } from './types'
import { loadConfig } from 'bunfig'

export const defaultConfig: VcsConfig = {
  verbose: false,
  author: {
    name: '',
    email: '',
  },
  ci: {
    checks: [],
  },
}

let _config: VcsConfig | null = null

export async function getConfig(): Promise<VcsConfig> {
  if (!_config) {
    const result = await loadConfig({
      name: 'vcs',
      defaultConfig,
    })

    _config = result as VcsConfig
  }

  return _config
}

export const config: VcsConfig = defaultConfig
