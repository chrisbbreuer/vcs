// Core types and errors
export * from './types'
export * from './errors'
export * from './config'

// Utilities
export { generateChangeId, generateEntityId, deriveChangeIdFromCommit, reverseHexEncode, reverseHexDecode, shortestPrefix } from './utils/id'
export { parseTrailers, addTrailers, stripTrailers, extractSubject } from './utils/trailers'
export { sha256, computeEnvironmentHash } from './utils/hash'

// Storage interfaces
export type { GitBackend, GitAuthor, GitCommitObject, GitRefEntry, StatusRow } from './storage/git-backend'
export type { MetadataStore } from './storage/metadata-store'
export { IsomorphicGitBackend } from './storage/isomorphic-git-backend'
export { JsonMetadataStore } from './storage/json-metadata-store'

// Workspace
export { openWorkspace, findWorkspaceRoot } from './workspace/workspace'
export type { WorkspaceHandle } from './workspace/workspace'
export { WorkingCopy } from './workspace/working-copy'
export { importGitRefs, exportToGitRefs } from './workspace/import-export'
export { getWorkingCopyChanges, getDiffOutput, getDiffBetweenCommits } from './workspace/diff'

// CLI utilities
export { formatOutput } from './cli/output'
export { renderGraph, renderSmartlog } from './cli/graph-renderer'

// Programmatic API
export { VcsClient } from './api/client'
