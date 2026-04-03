import { execFileSync } from 'child_process'
import { getNextTask, markTaskStatus, parseExecutionPlan, type ParsedTask } from './task-parser.js'
import { startAgent, getRunState, stopAgent, resetRun, onAgentOutput } from './agent-runner.js'
import { SquadsStore } from '../fs/squads-store.js'
import { createMissionBranch, getCurrentBranch } from '../governance/branch-policy.js'
import type { Squad } from '@brian/shared'

export interface ExecutionState {
  currentTask: ParsedTask | null
  branch: string | null
  agentStatus: string
  output: string[]
  tasks: ParsedTask[]
}

export function getExecutionState(brainRoot: string): ExecutionState {
  const tasks = parseExecutionPlan(brainRoot)
  const run = getRunState()
  const currentTask = tasks.find((t) => t.id === run.taskId) ?? null

  return {
    currentTask,
    branch: run.branch || null,
    agentStatus: run.status,
    output: run.output,
    tasks,
  }
}

export function startNextTask(
  brainRoot: string,
  onOutput?: (line: string) => void,
): ExecutionState {
  const task = getNextTask(brainRoot)
  if (!task) throw new Error('No pending tasks in execution plan')

  const store = new SquadsStore(brainRoot)
  const squads = store.list()
  const activeSquad = squads.find((s) => s.active) ?? createDefaultSquad(store)

  const branchName = `mission/${task.id}`
  try {
    createMissionBranch(brainRoot, task.id)
  } catch {
    try {
      execFileSync('git', ['checkout', branchName], { cwd: brainRoot, encoding: 'utf8' })
    } catch {
      execFileSync('git', ['checkout', '-b', branchName], { cwd: brainRoot, encoding: 'utf8' })
    }
  }

  markTaskStatus(brainRoot, task.id, 'in_progress')

  if (onOutput) {
    onAgentOutput(onOutput)
  }

  startAgent(task.id, {
    taskTitle: task.title,
    taskDescription: '',
    branch: branchName,
    repoRoot: brainRoot,
    squad: activeSquad,
  })

  return getExecutionState(brainRoot)
}

export function stopCurrentTask(): void {
  stopAgent()
}

export function completeCurrentTask(brainRoot: string): void {
  const run = getRunState()
  if (run.taskId) {
    markTaskStatus(brainRoot, run.taskId, 'done')
  }
  resetRun()
}

export function getCurrentTaskBranch(brainRoot: string): string {
  return getCurrentBranch(brainRoot)
}

function createDefaultSquad(store: SquadsStore): Squad {
  const squad = store.upsert({
    id: 'core',
    name: 'Core Squad',
    agents: [
      { role: 'engineer', skills: ['typescript', 'react'], rules: ['AGENTS.md'] },
    ],
    active: true,
  })
  return squad
}
