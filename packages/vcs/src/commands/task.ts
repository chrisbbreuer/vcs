import { text } from '@stacksjs/clapp'
import { openWorkspace } from '../workspace/workspace'
import { generateEntityId } from '../utils/id'
import { formatOutput } from '../cli/output'
import { NoActiveSessionError, NoActiveTaskError } from '../errors'
import type { Task, EntityId } from '../types'

interface TaskCreateOptions { message?: string; format?: string }
interface TaskCompleteOptions { format?: string }
interface TaskListOptions { session?: string; format?: string }

export async function taskCreate(options?: TaskCreateOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  if (!ws.config.activeSessionId) throw new NoActiveSessionError()

  let description = options?.message
  if (!description) {
    description = await text({ message: 'Task description:', validate: (v: string) => v.length > 0 ? undefined : 'Description is required' }) as string
  }

  const task: Task = {
    id: generateEntityId(),
    sessionId: ws.config.activeSessionId,
    description,
    changeIds: [],
    transcriptIds: [],
    status: 'in_progress',
    createdAt: new Date().toISOString(),
    completedAt: null,
  }

  await ws.metadataStore.putTask(task)

  // Update session with task
  const session = await ws.metadataStore.getSession(ws.config.activeSessionId)
  if (session) {
    session.taskIds.push(task.id)
    await ws.metadataStore.putSession(session)
  }

  ws.config.activeTaskId = task.id
  await ws.metadataStore.putConfig(ws.config)

  formatOutput(options?.format, { type: 'task-create', taskId: task.id, description }, () => {
    console.log(`Created task ${task.id.slice(0, 8)}: "${description}"`)
  })
}

export async function taskComplete(options?: TaskCompleteOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  if (!ws.config.activeTaskId) throw new NoActiveTaskError()

  const task = await ws.metadataStore.getTask(ws.config.activeTaskId)
  if (!task) throw new NoActiveTaskError()

  task.status = 'completed'
  task.completedAt = new Date().toISOString()
  await ws.metadataStore.putTask(task)

  ws.config.activeTaskId = null
  await ws.metadataStore.putConfig(ws.config)

  formatOutput(options?.format, { type: 'task-complete', taskId: task.id, description: task.description }, () => {
    console.log(`Completed task ${task.id.slice(0, 8)}: "${task.description}"`)
    console.log(`  changes: ${task.changeIds.length}`)
  })
}

export async function taskList(options?: TaskListOptions): Promise<void> {
  const ws = await openWorkspace(process.cwd())
  const sessionId = (options?.session ?? ws.config.activeSessionId) as EntityId | undefined
  const tasks = await ws.metadataStore.listTasks(sessionId)
  tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  formatOutput(options?.format, { type: 'task-list', tasks }, () => {
    if (tasks.length === 0) { console.log('No tasks.'); return }
    for (const t of tasks) {
      const active = ws.config.activeTaskId === t.id ? ' (active)' : ''
      const st = t.status === 'in_progress' ? '*' : t.status === 'completed' ? '+' : t.status === 'failed' ? '!' : '-'
      console.log(`${st} ${t.id.slice(0, 8)}${active} "${t.description}" (${t.changeIds.length} changes)`)
    }
  })
}
