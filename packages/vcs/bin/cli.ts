import { CLI } from '@stacksjs/clapp'
import { version } from '../package.json'

const cli = new CLI('vcs')

cli
  .command('init', 'Initialize VCS in an existing git repo')
  .option('--force', 'Force re-initialization')
  .action(async (options) => {
    const { init } = await import('../src/commands/init')
    await init(options)
  })

cli
  .command('commit', 'Snapshot working copy into a change')
  .option('-m, --message <message>', 'Commit message')
  .option('--session <session>', 'Link to session ID')
  .option('--task <task>', 'Link to task ID')
  .action(async (options) => {
    const { commit } = await import('../src/commands/commit')
    await commit(options)
  })

cli
  .command('log', 'Show change log')
  .option('--zoom <level>', 'Zoom level: session, task, or change')
  .option('--show-transcripts', 'Inline transcript summaries')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { log } = await import('../src/commands/log')
    await log(options)
  })

cli
  .command('status', 'Show working copy status')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { status } = await import('../src/commands/status')
    await status(options)
  })

cli
  .command('diff', 'Show working copy diff')
  .action(async (options) => {
    const { diff } = await import('../src/commands/diff')
    await diff(options)
  })

cli
  .command('show <change>', 'Show full change info with diff')
  .option('--format <format>', 'Output format: text or json')
  .action(async (change: string, options) => {
    const { show } = await import('../src/commands/show')
    await show(change, options)
  })

cli
  .command('amend', 'Amend the current change (preserves Change ID)')
  .option('-m, --message <message>', 'New commit message')
  .action(async (options) => {
    const { amend } = await import('../src/commands/amend')
    await amend(options)
  })

cli
  .command('new [parent]', 'Create a new empty change')
  .action(async (parent: string | undefined, options) => {
    const { newChange } = await import('../src/commands/new')
    await newChange(parent, options)
  })

cli
  .command('edit <change>', 'Switch working copy to a different change')
  .action(async (change: string, options) => {
    const { edit } = await import('../src/commands/edit')
    await edit(change, options)
  })

cli
  .command('abandon <change>', 'Mark a change as abandoned')
  .action(async (change: string, options) => {
    const { abandon } = await import('../src/commands/abandon')
    await abandon(change, options)
  })

cli
  .command('describe <change>', 'Update a change description')
  .option('-m, --message <message>', 'New description')
  .action(async (change: string, options) => {
    const { describe } = await import('../src/commands/describe')
    await describe(change, options)
  })

// Session commands
cli
  .command('session:start', 'Start a new agent session')
  .option('-m, --message <message>', 'Session objective')
  .option('--model <model>', 'AI model being used')
  .option('--tool <tool>', 'Tool/agent being used')
  .action(async (options) => {
    const { sessionStart } = await import('../src/commands/session')
    await sessionStart(options)
  })

cli
  .command('session:end', 'End the current session')
  .action(async (options) => {
    const { sessionEnd } = await import('../src/commands/session')
    await sessionEnd(options)
  })

cli
  .command('session:list', 'List sessions')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { sessionList } = await import('../src/commands/session')
    await sessionList(options)
  })

cli
  .command('session:show <id>', 'Show session details')
  .option('--format <format>', 'Output format: text or json')
  .action(async (id: string, options) => {
    const { sessionShow } = await import('../src/commands/session')
    await sessionShow(id, options)
  })

// Task commands
cli
  .command('task:create', 'Create a task in the current session')
  .option('-m, --message <message>', 'Task description')
  .action(async (options) => {
    const { taskCreate } = await import('../src/commands/task')
    await taskCreate(options)
  })

cli
  .command('task:complete', 'Mark current task as completed')
  .action(async (options) => {
    const { taskComplete } = await import('../src/commands/task')
    await taskComplete(options)
  })

cli
  .command('task:list', 'List tasks')
  .option('--session <session>', 'Filter by session')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { taskList } = await import('../src/commands/task')
    await taskList(options)
  })

// Transcript commands
cli
  .command('transcript:attach <file>', 'Attach a transcript to the current change')
  .action(async (file: string, options) => {
    const { transcriptAttach } = await import('../src/commands/transcript')
    await transcriptAttach(file, options)
  })

cli
  .command('transcript:show <id>', 'Show a transcript')
  .option('--format <format>', 'Output format: text or json')
  .action(async (id: string, options) => {
    const { transcriptShow } = await import('../src/commands/transcript')
    await transcriptShow(id, options)
  })

cli
  .command('transcript:list', 'List transcripts')
  .option('--change <change>', 'Filter by change')
  .option('--session <session>', 'Filter by session')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { transcriptList } = await import('../src/commands/transcript')
    await transcriptList(options)
  })

cli
  .command('transcript:search <query>', 'Search across transcripts')
  .option('--format <format>', 'Output format: text or json')
  .action(async (query: string, options) => {
    const { transcriptSearch } = await import('../src/commands/transcript')
    await transcriptSearch(query, options)
  })

// Context command (agent-facing)
cli
  .command('context', 'Get structured context for agents')
  .option('--zoom <level>', 'Zoom level: session, task, or change')
  .option('--token-budget <tokens>', 'Maximum token budget')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { context } = await import('../src/commands/context')
    await context(options)
  })

// Attestation commands
cli
  .command('attest <name>', 'Run a command and create an attestation')
  .option('--command <cmd>', 'Command to run')
  .action(async (name: string, options) => {
    const { attest } = await import('../src/commands/attest')
    await attest(name, options)
  })

cli
  .command('ci:status', 'Show attestation status for current change')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { ciStatus } = await import('../src/commands/ci')
    await ciStatus(options)
  })

cli
  .command('ci:run', 'Run all configured CI checks')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { ciRun } = await import('../src/commands/ci')
    await ciRun(options)
  })

// PR command
cli
  .command('pr:create', 'Create a PR with enriched context')
  .option('--title <title>', 'PR title')
  .option('--base <base>', 'Base branch')
  .action(async (options) => {
    const { prCreate } = await import('../src/commands/pr')
    await prCreate(options)
  })

// Bookmark commands
cli
  .command('bookmark:create <name>', 'Create a bookmark (synced to git branch)')
  .action(async (name: string, options) => {
    const { bookmarkCreate } = await import('../src/commands/bookmark')
    await bookmarkCreate(name, options)
  })

cli
  .command('bookmark:set <name> <change>', 'Move a bookmark to a different change')
  .action(async (name: string, change: string, options) => {
    const { bookmarkSet } = await import('../src/commands/bookmark')
    await bookmarkSet(name, change, options)
  })

cli
  .command('bookmark:delete <name>', 'Delete a bookmark')
  .action(async (name: string, options) => {
    const { bookmarkDelete } = await import('../src/commands/bookmark')
    await bookmarkDelete(name, options)
  })

cli
  .command('bookmark:list', 'List bookmarks')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { bookmarkList } = await import('../src/commands/bookmark')
    await bookmarkList(options)
  })

// Git interop
cli
  .command('git:fetch [remote]', 'Fetch from git remote (includes notes)')
  .action(async (remote: string | undefined, options) => {
    const { gitFetch } = await import('../src/commands/git')
    await gitFetch(remote, options)
  })

cli
  .command('git:push [remote]', 'Push to git remote (includes notes)')
  .action(async (remote: string | undefined, options) => {
    const { gitPush } = await import('../src/commands/git')
    await gitPush(remote, options)
  })

// Operation log
cli
  .command('op:log', 'Show operation history')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { opLog } = await import('../src/commands/operation')
    await opLog(options)
  })

cli
  .command('undo', 'Revert the last operation')
  .action(async (options) => {
    const { undo } = await import('../src/commands/undo')
    await undo(options)
  })

// Config
cli
  .command('config', 'Show VCS configuration')
  .option('--format <format>', 'Output format: text or json')
  .action(async (options) => {
    const { configShow } = await import('../src/commands/config')
    await configShow(options)
  })

cli.version(version)
cli.help()
cli.parse()
