import { spawn, type ChildProcess } from 'child_process'
import type { Squad } from '@brian/shared'

export interface AgentRunConfig {
  taskTitle: string
  taskDescription: string
  branch: string
  repoRoot: string
  squad: Squad
}

export interface AgentRunState {
  taskId: string
  branch: string
  status: 'running' | 'completed' | 'failed' | 'idle'
  output: string[]
  pid: number | null
  startedAt: string | null
  completedAt: string | null
  exitCode: number | null
}

let currentRun: AgentRunState = {
  taskId: '',
  branch: '',
  status: 'idle',
  output: [],
  pid: null,
  startedAt: null,
  completedAt: null,
  exitCode: null,
}

let childProcess: ChildProcess | null = null
let outputListeners: Set<(line: string) => void> = new Set()

export function getRunState(): AgentRunState {
  return { ...currentRun }
}

export function onAgentOutput(listener: (line: string) => void): () => void {
  outputListeners.add(listener)
  return () => outputListeners.delete(listener)
}

function emit(line: string) {
  currentRun.output.push(line)
  for (const listener of outputListeners) listener(line)
}

function buildPrompt(config: AgentRunConfig): string {
  const agentRoles = config.squad.agents.map((a) => a.role).join(', ')
  const skills = config.squad.agents
    .flatMap((a) => a.skills)
    .filter(Boolean)
    .join(', ')

  return [
    `You are working as part of the "${config.squad.name}" squad (${agentRoles}).`,
    skills ? `Available skills: ${skills}` : '',
    '',
    `## Task`,
    config.taskTitle,
    '',
    config.taskDescription || 'Implement the task as described in the title.',
    '',
    `## Rules`,
    `- You are on branch: ${config.branch}`,
    `- Repository root: ${config.repoRoot}`,
    `- Make real code changes that implement the task`,
    `- Run verification after making changes: npm run verify`,
    `- Commit your work with a descriptive message when done`,
    `- Keep changes focused on the task`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function startAgent(
  taskId: string,
  config: AgentRunConfig,
): AgentRunState {
  if (currentRun.status === 'running') {
    throw new Error('An agent is already running')
  }

  currentRun = {
    taskId,
    branch: config.branch,
    status: 'running',
    output: [],
    pid: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    exitCode: null,
  }

  const prompt = buildPrompt(config)
  emit(`[engine] Starting agent on branch ${config.branch}`)
  emit(`[engine] Task: ${config.taskTitle}`)
  emit(`[engine] Squad: ${config.squad.name}`)

  const codexBin = process.env.CODEX_BIN ?? 'codex'

  childProcess = spawn(codexBin, ['--quiet', '--approval-mode', 'auto-edit', prompt], {
    cwd: config.repoRoot,
    env: {
      ...process.env,
      GIT_BRANCH: config.branch,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  currentRun.pid = childProcess.pid ?? null

  childProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) emit(line)
  })

  childProcess.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) emit(`[stderr] ${line}`)
  })

  childProcess.on('close', (code) => {
    currentRun.status = code === 0 ? 'completed' : 'failed'
    currentRun.completedAt = new Date().toISOString()
    currentRun.exitCode = code
    emit(`[engine] Agent ${currentRun.status} (exit code: ${code})`)
    childProcess = null
  })

  childProcess.on('error', (err) => {
    currentRun.status = 'failed'
    currentRun.completedAt = new Date().toISOString()
    emit(`[engine] Agent process error: ${err.message}`)
    childProcess = null
  })

  return getRunState()
}

export function stopAgent(): AgentRunState {
  if (childProcess && currentRun.status === 'running') {
    childProcess.kill('SIGTERM')
    setTimeout(() => {
      if (childProcess) childProcess.kill('SIGKILL')
    }, 5000)
    currentRun.status = 'failed'
    currentRun.completedAt = new Date().toISOString()
    emit('[engine] Agent stopped by user')
  }
  return getRunState()
}

export function resetRun(): void {
  if (currentRun.status === 'running') stopAgent()
  currentRun = {
    taskId: '',
    branch: '',
    status: 'idle',
    output: [],
    pid: null,
    startedAt: null,
    completedAt: null,
    exitCode: null,
  }
}
