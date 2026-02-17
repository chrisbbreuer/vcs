<p align="center"><img src=".github/art/cover.jpg" alt="VCS - AI-Native Version Control"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->

# VCS

> AI-native version control, built on git.

VCS is a version control system designed for the age of AI-assisted development. It uses git as the storage backend (like [jj](https://github.com/martinvonz/jj)) for zero-friction adoption in existing repos, while adding three capabilities that git lacks:

1. **Co-located LLM transcripts** - Every AI conversation is stored alongside the code it produced, as a first-class VCS object
2. **Zoom-level context** - Session > Task > Change > Transcript hierarchy lets agents request exactly the context they need
3. **Integrated CI** - Attestations collapse the commit > push > PR > CI > review loop into a local-first workflow

## Features

- **Stable Change IDs** that survive amends, rebases, and cherry-picks (like jj)
- **Colocated mode** - runs alongside git, `git log` always works
- **Session & task tracking** for AI agent workflows
- **Transcript storage** with git blob content-addressing
- **Attestation system** with environment hashing for reproducible CI
- **Enriched PR creation** with transcripts, attestations, and session context
- **Operation log with undo** - every mutation is recorded and reversible
- **`--format=json`** on every command for agent consumption
- **Programmatic API** (`VcsClient`) for direct integration into AI agents

## Install

```bash
bun install -d @stacksjs/vcs
```

Or install globally:

```bash
bun install -g @stacksjs/vcs
```

Or compile a standalone binary:

```bash
bun build packages/vcs/bin/cli.ts --compile --minify --outfile vcs
```

## Quick Start

```bash
# Initialize VCS in an existing git repo
cd my-project
vcs init

# Make changes and commit (no staging area needed)
echo "hello" > hello.txt
vcs commit -m "Add greeting"

# Start an AI session
vcs session:start -m "Implement authentication"
vcs task:create -m "Add JWT middleware"

# Commit with session/task context
vcs commit -m "Add token validation"

# Attach a conversation transcript
vcs transcript:attach conversation.json

# Run attestation (local CI)
vcs attest unit-tests --command "bun test"

# Check CI status
vcs ci:status

# Get context for an AI agent
vcs context --zoom session --format json

# Create an enriched PR
vcs pr:create --title "Add authentication" --base main
```

## Commands

### Core Workflow

| Command | Description |
|---------|-------------|
| `vcs init` | Initialize VCS in an existing git repo |
| `vcs commit -m "msg"` | Snapshot working copy into a change |
| `vcs amend [-m "msg"]` | Amend current change (preserves Change ID) |
| `vcs describe <change> -m "msg"` | Update a change's description |
| `vcs new [parent]` | Create new empty change on top of parent |
| `vcs edit <change>` | Switch working copy to a different change |
| `vcs abandon <change>` | Mark change as abandoned |
| `vcs log [--zoom level]` | Show change log (session/task/change zoom) |
| `vcs diff` | Show working copy diff |
| `vcs show <change>` | Show full change info with diff |
| `vcs status` | Current change, session, task, pending changes |

### Sessions & Tasks

| Command | Description |
|---------|-------------|
| `vcs session:start -m "objective"` | Start a new agent session |
| `vcs session:end` | Close current session |
| `vcs session:list` | List sessions |
| `vcs session:show <id>` | Show session with tasks and changes |
| `vcs task:create -m "description"` | Create task in current session |
| `vcs task:complete` | Mark current task as completed |
| `vcs task:list` | List tasks |

### Transcripts

| Command | Description |
|---------|-------------|
| `vcs transcript:attach <file\|->` | Parse and store transcript, link to current change |
| `vcs transcript:show <id>` | Display transcript with formatted turns |
| `vcs transcript:list` | List transcripts with filters |
| `vcs transcript:search <query>` | Full-text search across transcripts |

### CI & Attestation

| Command | Description |
|---------|-------------|
| `vcs attest <name> --command <cmd>` | Run command, capture result as attestation |
| `vcs ci:status` | Show which checks have passing attestations |
| `vcs ci:run` | Run all configured checks from `vcs.config.ts` |
| `vcs pr:create` | Create PR with enriched body (transcripts + attestations) |

### Context (Agent-Facing)

| Command | Description |
|---------|-------------|
| `vcs context` | Get structured context (JSON) for the current change |
| `vcs context --zoom session` | Session-level context with all tasks |
| `vcs context --zoom task` | Task-level context with related changes |
| `vcs context --token-budget 4000` | Truncate transcript content to fit token budget |

### Git Interop

| Command | Description |
|---------|-------------|
| `vcs bookmark:create <name>` | Create bookmark (synced to git branch) |
| `vcs bookmark:set <name> <change>` | Move bookmark to a different change |
| `vcs bookmark:delete <name>` | Delete a bookmark |
| `vcs bookmark:list` | List bookmarks |
| `vcs git:fetch [remote]` | Fetch + import (includes VCS notes) |
| `vcs git:push [remote]` | Export + push (includes VCS notes) |
| `vcs op:log` | Show operation history |
| `vcs undo` | Revert last operation |
| `vcs config` | Show VCS configuration |

All commands support `--format=json` for agent consumption.

## Programmatic API

For integrating VCS into AI agents and tools without going through the CLI:

```typescript
import { VcsClient } from '@stacksjs/vcs'

const vcs = await VcsClient.open('/path/to/repo')

// Start a session
const session = await vcs.sessionStart('Implement auth system', {
  model: 'claude-opus-4-6',
  tool: 'claude-code',
})

// Create a task
const task = await vcs.taskCreate('Add JWT middleware')

// Make changes and commit
await vcs.commit('Add token validation')

// Attach transcript
await vcs.transcriptAttach(
  [
    { role: 'human', content: 'Add JWT middleware to the auth flow' },
    { role: 'assistant', content: 'I\'ll add JWT token validation...' },
  ],
  { model: 'claude-opus-4-6' },
)

// Run attestation
const result = await vcs.attest('unit-tests', 'bun test')
console.log(result.passed) // true/false

// Get context at any zoom level
const ctx = await vcs.context({ zoom: 'session', tokenBudget: 4000 })

// Complete task and session
await vcs.taskComplete()
await vcs.sessionEnd()
```

## Configuration

Create a `vcs.config.ts` in your project root:

```typescript
export default {
  verbose: false,

  author: {
    name: 'Your Name',
    email: 'you@example.com',
  },

  ci: {
    checks: [
      { name: 'typecheck', command: 'bun --bun tsc --noEmit' },
      { name: 'lint', command: 'bun run lint' },
      { name: 'test', command: 'bun test' },
    ],
  },
}
```

## Architecture

```
┌──────────────────────────────────────────────┐
│                 CLI Layer                     │
│  vcs init | commit | log | session | ...     │
├──────────────────────────────────────────────┤
│              Workspace Layer                  │
│  WorkingCopy | Import/Export | Diff           │
├──────────────────────────────────────────────┤
│               Core Layer                      │
│  Types | Config | Errors                      │
├──────────────────────────────────────────────┤
│              Storage Layer                    │
│  GitBackend (isomorphic-git) | MetadataStore │
├──────────────────────────────────────────────┤
│           Git Object Store (.git/)            │
└──────────────────────────────────────────────┘
```

VCS uses git as the storage backend. All commits are native git commits. VCS metadata lives in `.vcs/` (gitignored), custom refs (`refs/vcs/`), and git notes (`refs/notes/vcs/`). A plain `git log` always works.

### Data Model

**Zoom-level hierarchy:**

```
Session (high-level: "implement auth system")
  └── Task (mid-level: "add JWT middleware")
        └── Change (commit-level: "add token validation")
              └── Transcript (fine-grained: full conversation)
```

**Key concepts:**

- **Change** - The fundamental unit, with a stable ID that survives rewrites. Maps 1:1 to a git commit but can be amended without losing identity.
- **Session** - An AI working session with an objective, containing tasks and changes.
- **Task** - A unit of work within a session.
- **Transcript** - A stored AI conversation with turns, linked to changes.
- **Attestation** - A CI check result with environment fingerprinting.
- **Bookmark** - A named pointer to a change, bidirectionally synced with git branches.
- **Operation** - A recorded mutation for undo support.

### Where Things Live

| Data | Storage Location |
|------|-----------------|
| Code snapshots | `.git/objects/` (git commits/trees/blobs) |
| Change metadata | `.vcs/store/changes/<id>.json` |
| Session/Task metadata | `.vcs/store/sessions/`, `.vcs/store/tasks/` |
| Transcript content | `.git/objects/` (git blobs) |
| Transcript index | `.vcs/store/transcripts/<id>.json` + git notes |
| Attestations | `.vcs/store/attestations/<id>.json` + git notes |
| Change refs | `refs/vcs/changes/<change-id>` |
| Bookmarks | `.vcs/store/bookmarks/` synced to `refs/heads/*` |
| Operation log | `.vcs/store/operations/` |
| Config | `.vcs/config.json` |

### Git Interop

Every VCS commit includes trailers for interoperability:

```
Fix auth token refresh

Change-Id: kkqrmvlnopstuv
Session-Id: 019479a2-7c8b-...
Task-Id: 019479a3-7c8b-...
VCS-Version: 0.1.0
```

Users can freely mix `git` and `vcs` commands. VCS auto-imports git commits on every command.

## Testing

```bash
bun test
```

## Development

```bash
# Run VCS from source
bun run vcs init

# Run tests
bun test

# Type check
bun run typecheck

# Compile standalone binary
bun run compile
```

## Credits

Inspired by [Jarred Sumner's thoughts](https://x.com/jaraborern/status/1881076206926684524) on what replaces git, and by the design of [jj (Jujutsu)](https://github.com/martinvonz/jj), [Sapling](https://github.com/facebook/sapling), and [Pijul](https://pijul.org/).

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/vcs/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## Postcardware

"Software that is free, but hopes for a postcard." We love receiving postcards from around the world showing where Stacks is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## License

The MIT License (MIT). Please see [LICENSE](LICENSE.md) for more information.

Made with 💙

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@stacksjs/vcs?style=flat-square
[npm-version-href]: https://npmjs.com/package/@stacksjs/vcs
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/vcs/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/vcs/actions?query=workflow%3Aci
