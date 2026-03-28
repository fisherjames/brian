import path from 'path'
import next from 'next'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { parse } from 'url'
import { spawn, type ChildProcess } from 'child_process'
import { startWatcher } from './watcher'
import { addGlobalListener } from './global-watcher'
import { getBrainPathForId, getSuggestedTask, runTeamMcpCall } from './team-board-mcp'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3000', 10)

// __dirname is packages/web/src/server, project root is two levels up
const projectRoot = path.resolve(__dirname, '..', '..')
const app = next({ dev, dir: projectRoot })
const handle = app.getRequestHandler()

// Track watchers per WebSocket connection
const clientWatchers = new Map<WebSocket, { brainId: string; close: () => void }>()
// Track global subscribers (for brains list auto-refresh)
const globalSubscribers = new Set<WebSocket>()
const globalCleanups = new Map<WebSocket, () => void>()

type BrainRun = {
  id: string
  brainId: string
  status: 'running' | 'awaiting_approval' | 'blocked' | 'completed' | 'failed'
  startedAt: string
  endedAt?: string
  label: string
  actor: string
  blockerReason?: string
}

type TeamTask = { done: boolean; text: string }
type TeamStep = {
  id: string
  phase_number: number
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked'
  tasks_json: TeamTask[] | null
}

type TeamSnapshot = {
  executionSteps: TeamStep[]
  handoffs: Array<{ id: string }>
}

type TeamObserver = {
  brainId: string
  startedAt: string
  ticks: number
  addedTasks: number
  timer: NodeJS.Timeout
}

const activeRuns = new Map<string, BrainRun>()
const activeChildren = new Map<string, ChildProcess>()
const teamObservers = new Map<string, TeamObserver>()

function inferActor(label: string): string {
  const lower = label.toLowerCase()
  if (lower.includes('frontend')) return 'frontend-engineer'
  if (lower.includes('backend')) return 'backend-engineer'
  if (lower.includes('devops')) return 'devops-release'
  if (lower.includes('product')) return 'product-lead'
  if (lower.includes('growth') || lower.includes('marketing')) return 'growth-marketing'
  if (lower.includes('mobile')) return 'mobile-engineer'
  return 'project-operator'
}

function classifyStage(line: string): 'planning' | 'coding' | 'verification' | 'blocker' | 'system' {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('failed') || lower.includes('conflict')) return 'blocker'
  if (lower.includes('test') || lower.includes('verify') || lower.includes('validation')) return 'verification'
  if (lower.includes('plan') || lower.includes('todo')) return 'planning'
  if (lower.includes('edit') || lower.includes('patch') || lower.includes('implement') || lower.includes('diff')) return 'coding'
  return 'system'
}

function shouldIgnoreLogLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  const noise = [
    'OpenAI Codex',
    '--------',
    'workdir:',
    'model:',
    'provider:',
    'approval:',
    'sandbox:',
    'reasoning effort:',
    'reasoning summaries:',
    'session id:',
    'user',
  ]
  return noise.some((n) => trimmed.startsWith(n))
}

function broadcastTeamEvent(
  wss: WebSocketServer,
  brainId: string,
  message: string,
  options: { actor?: string; stage?: string; kind?: 'info' | 'status' | 'blocker' } = {}
) {
  const payload = JSON.stringify({
    type: 'mcp.event',
    channel: 'team',
    brainId,
    message,
    at: new Date().toISOString(),
    actor: options.actor ?? 'mission-control',
    stage: options.stage ?? 'system',
    kind: options.kind ?? 'info',
  })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload)
  })
}

function isFallbackSuggestion(text: string): boolean {
  return /^no suggestion available$/i.test(text.trim()) || /^no pending suggestion$/i.test(text.trim())
}

function findObserverTargetStep(snapshot: TeamSnapshot): string | null {
  const steps = snapshot.executionSteps
  const teamSteps = steps.filter((step) => step.phase_number === 99)
  const source = teamSteps.length > 0 ? teamSteps : steps
  const inProgress = source.find((step) => step.status === 'in_progress')
  if (inProgress) return inProgress.id
  const notStarted = source.find((step) => step.status === 'not_started')
  if (notStarted) return notStarted.id
  return source[source.length - 1]?.id ?? null
}

function hasTaskWithPrefix(snapshot: TeamSnapshot, prefix: 'NEXT:' | 'BLOCKER:' | 'MERGE:' | 'VERIFY:'): boolean {
  return snapshot.executionSteps.some((step) =>
    (step.tasks_json ?? []).some((task) => !task.done && task.text.toUpperCase().startsWith(prefix))
  )
}

function hasTaskText(snapshot: TeamSnapshot, fullText: string): boolean {
  const normalized = fullText.trim().toLowerCase()
  return snapshot.executionSteps.some((step) =>
    (step.tasks_json ?? []).some((task) => task.text.trim().toLowerCase() === normalized)
  )
}

function collectObserverIssues(
  snapshot: TeamSnapshot,
  repo: {
    hasConflicts: boolean
    conflictFiles: string[]
    canStartNextWork: boolean
    unresolvedWorktrees: string[]
  },
  suggested: string
): Array<{ prefix: 'NEXT:' | 'BLOCKER:'; text: string }> {
  const issues: Array<{ prefix: 'NEXT:' | 'BLOCKER:'; text: string }> = []

  if (!repo.canStartNextWork && repo.unresolvedWorktrees.length > 0) {
    issues.push({
      prefix: 'BLOCKER:',
      text: `Resolve or clean ${repo.unresolvedWorktrees.length} unresolved worktrees before starting next work.`,
    })
  }
  if (repo.hasConflicts) {
    issues.push({
      prefix: 'BLOCKER:',
      text: `Resolve merge conflicts in ${repo.conflictFiles.length} file(s) before queue merge can continue.`,
    })
  }

  const hasOpenNext = hasTaskWithPrefix(snapshot, 'NEXT:')
  if (!hasOpenNext) {
    const trimmed = suggested.trim()
    const source = trimmed.length > 0 && !isFallbackSuggestion(trimmed) ? trimmed : 'Define one concrete NEXT task for the active mission.'
    const slug = source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'queue-bootstrap'
    issues.push({
      prefix: 'NEXT:',
      text: `feature="${source}" worktree=feature/${slug} image=pending breaking=none`,
    })
  }

  const mergeWithoutMetadata = snapshot.executionSteps.some((step) =>
    (step.tasks_json ?? []).some(
      (task) =>
        !task.done &&
        task.text.toUpperCase().startsWith('MERGE:') &&
        !/(?:branch|worktree)\s*=\s*[^\s]+(?:\s*->\s*[^\s]+)?/i.test(task.text)
    )
  )
  if (mergeWithoutMetadata) {
    issues.push({
      prefix: 'BLOCKER:',
      text: 'MERGE item missing branch metadata. Use: MERGE: branch=<source> -> <target>.',
    })
  }

  return issues
}

function observerStateForBrain(brainId: string) {
  const observer = teamObservers.get(brainId)
  if (!observer) return { active: false, ticks: 0, addedTasks: 0, startedAt: null as string | null }
  return {
    active: true,
    ticks: observer.ticks,
    addedTasks: observer.addedTasks,
    startedAt: observer.startedAt,
  }
}

function runObserverTick(wss: WebSocketServer, brainId: string): { added: number; totalIssues: number } {
  const observer = teamObservers.get(brainId)
  if (!observer) return { added: 0, totalIssues: 0 }
  observer.ticks += 1

  const snapshotRes = runTeamMcpCall(brainId, 'team.get_snapshot', {})
  const repoRes = runTeamMcpCall(brainId, 'team.get_repo_state', {})
  const suggestedRes = runTeamMcpCall(brainId, 'team.get_suggested', {})
  const snapshot = snapshotRes.snapshot as TeamSnapshot
  const repo = repoRes.repo
  const suggested = typeof suggestedRes.suggested === 'string' ? suggestedRes.suggested : ''
  if (!repo) return { added: 0, totalIssues: 0 }

  const targetStepId = findObserverTargetStep(snapshot)
  if (!targetStepId) return { added: 0, totalIssues: 0 }

  const issues = collectObserverIssues(snapshot, repo, suggested)
  let added = 0

  for (const issue of issues) {
    const full = `${issue.prefix} ${issue.text}`.trim()
    if (hasTaskText(snapshot, full)) continue
    runTeamMcpCall(brainId, 'team.add_task', { stepId: targetStepId, prefix: issue.prefix, text: issue.text })
    added += 1
    observer.addedTasks += 1
    broadcastTeamEvent(wss, brainId, `observer_task_added:${issue.prefix} ${issue.text}`, {
      actor: 'project-operator',
      stage: issue.prefix === 'BLOCKER:' ? 'blocker' : 'planning',
      kind: issue.prefix === 'BLOCKER:' ? 'blocker' : 'status',
    })
  }

  if (issues.length > 0) {
    broadcastTeamEvent(wss, brainId, `observer_tick:issues=${issues.length}:added=${added}`, {
      actor: 'project-operator',
      stage: 'system',
      kind: 'status',
    })
  }
  return { added, totalIssues: issues.length }
}

function startCodexRunForSuggestion(wss: WebSocketServer, brainId: string) {
  const existing = activeRuns.get(brainId)
  if (existing && activeChildren.has(brainId)) {
    return existing
  }

  const suggestion = getSuggestedTask(brainId)
  const label = suggestion?.label ?? 'No suggestion available'

  const run: BrainRun = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    brainId,
    status: 'running',
    startedAt: new Date().toISOString(),
    label,
    actor: inferActor(label),
  }
  activeRuns.set(brainId, run)

  const cwd = getBrainPathForId(brainId)
  const prompt = [
    `Start focused implementation work for this task: ${label}.`,
    'Read brian/index.md, AGENTS.md, brian/execution-plan.md, and latest handoff first.',
    'Make real code and note updates, verify, and print compact progress checkpoints.',
  ].join(' ')

  const child = spawn('codex', ['exec', '--full-auto', '--ephemeral', prompt], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  activeChildren.set(brainId, child)

  const emitLines = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
    const text = chunk.toString('utf8')
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (shouldIgnoreLogLine(line)) continue
      const stage = classifyStage(line)
      if (line.toLowerCase().includes('approval')) {
        run.status = 'awaiting_approval'
      }
      if (stage === 'blocker') {
        run.status = 'blocked'
        run.blockerReason = line
      }
      broadcastTeamEvent(wss, brainId, `[${stream}] ${line}`, {
        actor: run.actor,
        stage,
        kind: stage === 'blocker' ? 'blocker' : 'info',
      })
    }
  }

  child.stdout.on('data', (chunk) => emitLines(chunk as Buffer, 'stdout'))
  child.stderr.on('data', (chunk) => emitLines(chunk as Buffer, 'stderr'))
  child.on('error', (err) => {
    run.status = 'failed'
    run.blockerReason = err.message
    run.endedAt = new Date().toISOString()
    activeChildren.delete(brainId)
    broadcastTeamEvent(wss, brainId, `run_failed:${err.message}`, { actor: run.actor, stage: 'blocker', kind: 'blocker' })
  })
  child.on('close', (code) => {
    run.status = code === 0 ? 'completed' : 'failed'
    if (run.status === 'failed' && !run.blockerReason) run.blockerReason = `exit_${code ?? -1}`
    run.endedAt = new Date().toISOString()
    activeChildren.delete(brainId)
    broadcastTeamEvent(wss, brainId, `run_${run.status}:exit_${code ?? -1}`, {
      actor: run.actor,
      stage: run.status === 'completed' ? 'verification' : 'blocker',
      kind: run.status === 'completed' ? 'status' : 'blocker',
    })
  })

  broadcastTeamEvent(wss, brainId, `run_started:${label}`, { actor: run.actor, stage: 'planning', kind: 'status' })
  return run
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true)
    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString())

        if (msg.type === 'subscribe' && msg.brainId) {
          // Clean up existing watcher for this client
          const existing = clientWatchers.get(ws)
          if (existing) existing.close()

          const watcher = startWatcher(msg.brainId, ws)
          clientWatchers.set(ws, { brainId: msg.brainId, close: watcher.close })
        }

        if (msg.type === 'subscribe-global') {
          // Subscribe to global brains.json changes
          const cleanup = addGlobalListener(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'brains-updated' }))
            }
          })
          globalSubscribers.add(ws)
          globalCleanups.set(ws, cleanup)
        }

        if (msg.type === 'mcp.call' && msg.channel === 'team') {
          const callId = String(msg.id ?? '')
          const brainId = String(msg.brainId ?? '')
          const method = String(msg.method ?? '')
          const params = typeof msg.params === 'object' && msg.params ? msg.params : {}

          try {
            if (method === 'team.start_next_task') {
              const repoState = runTeamMcpCall(brainId, 'team.get_repo_state', {})
              if (repoState.repo && (!repoState.repo.canStartNextWork || repoState.repo.hasConflicts || repoState.repo.hardBlockers.length > 0)) {
                const blocked = {
                  ...repoState,
                  message: `start_blocked:${repoState.repo.hardBlockers.map((b) => b.code).join(',') || 'unknown'}`,
                }
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result: blocked }))
                  ws.send(JSON.stringify({ type: 'execution_steps', data: blocked.snapshot.executionSteps }))
                  ws.send(JSON.stringify({ type: 'handoffs', data: blocked.snapshot.handoffs }))
                }
                broadcastTeamEvent(wss, brainId, blocked.message, { actor: 'mission-control', stage: 'blocker', kind: 'blocker' })
                return
              }

              runTeamMcpCall(brainId, 'team.clear_merged_queue', {})
              const result = runTeamMcpCall(brainId, 'team.trigger_suggested', {})
              const run = startCodexRunForSuggestion(wss, brainId)
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result: { ...result, run } }))
                ws.send(JSON.stringify({ type: 'execution_steps', data: result.snapshot.executionSteps }))
                ws.send(JSON.stringify({ type: 'handoffs', data: result.snapshot.handoffs }))
              }
              return
            }

            if (method === 'team.get_run_state') {
              const run = activeRuns.get(brainId) ?? null
              const active = activeChildren.has(brainId)
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result: { run, active, observer: observerStateForBrain(brainId) } }))
              }
              return
            }

            if (method === 'team.observer_state') {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result: { observer: observerStateForBrain(brainId) } }))
              }
              return
            }

            if (method === 'team.observer_start') {
              const existing = teamObservers.get(brainId)
              if (existing) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result: { message: 'observer_already_running', observer: observerStateForBrain(brainId) } }))
                }
                return
              }
              const timer = setInterval(() => {
                try {
                  runObserverTick(wss, brainId)
                } catch (error) {
                  broadcastTeamEvent(wss, brainId, `observer_tick_failed:${error instanceof Error ? error.message : 'unknown_error'}`, {
                    actor: 'project-operator',
                    stage: 'blocker',
                    kind: 'blocker',
                  })
                }
              }, 5000)
              const observer: TeamObserver = {
                brainId,
                startedAt: new Date().toISOString(),
                ticks: 0,
                addedTasks: 0,
                timer,
              }
              teamObservers.set(brainId, observer)
              void runObserverTick(wss, brainId)
              broadcastTeamEvent(wss, brainId, 'observer_started', { actor: 'project-operator', stage: 'system', kind: 'status' })
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result: { message: 'observer_started', observer: observerStateForBrain(brainId) } }))
              }
              return
            }

            if (method === 'team.observer_stop') {
              const observer = teamObservers.get(brainId)
              if (observer) {
                clearInterval(observer.timer)
                teamObservers.delete(brainId)
                broadcastTeamEvent(wss, brainId, 'observer_stopped', { actor: 'project-operator', stage: 'system', kind: 'status' })
              }
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result: { message: 'observer_stopped', observer: observerStateForBrain(brainId) } }))
              }
              return
            }

            if (method === 'team.pause_run') {
              const child = activeChildren.get(brainId)
              const run = activeRuns.get(brainId)
              if (child) {
                child.kill('SIGTERM')
                activeChildren.delete(brainId)
              }
              if (run && (run.status === 'running' || run.status === 'awaiting_approval')) {
                run.status = 'blocked'
                run.blockerReason = 'manual_pause'
                run.endedAt = new Date().toISOString()
              }
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result: { run: run ?? null } }))
              }
              broadcastTeamEvent(wss, brainId, 'run_paused:manual_pause', {
                actor: run?.actor ?? 'project-operator',
                stage: 'blocker',
                kind: 'blocker',
              })
              return
            }

            const result = runTeamMcpCall(brainId, method, params)
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result }))
              ws.send(
                JSON.stringify({
                  type: 'mcp.event',
                  channel: 'team',
                  brainId,
                  message: result.message,
                  at: new Date().toISOString(),
                  actor: 'mission-control',
                  stage: 'system',
                  kind: result.message.includes('blocked') ? 'blocker' : 'status',
                })
              )
              ws.send(JSON.stringify({ type: 'execution_steps', data: result.snapshot.executionSteps }))
              ws.send(JSON.stringify({ type: 'handoffs', data: result.snapshot.handoffs }))
            }
          } catch (error) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'mcp.result',
                  id: callId,
                  ok: false,
                  error: error instanceof Error ? error.message : 'mcp_call_failed',
                })
              )
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      // Clean up brain watcher
      const existing = clientWatchers.get(ws)
      if (existing) {
        existing.close()
        clientWatchers.delete(ws)
      }

      // Clean up global subscription
      const globalCleanup = globalCleanups.get(ws)
      if (globalCleanup) {
        globalCleanup()
        globalCleanups.delete(ws)
      }
      globalSubscribers.delete(ws)
    })
  })

  server.listen(port, () => {
    console.log(`> Brian running at http://localhost:${port}`)
  })

  const shutdown = () => {
    console.log('\n> Shutting down...')
    wss.clients.forEach((client) => client.close())
    for (const observer of teamObservers.values()) clearInterval(observer.timer)
    teamObservers.clear()
    clientWatchers.forEach(({ close }) => close())
    globalCleanups.forEach((cleanup) => cleanup())
    server.close(() => process.exit(0))
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
})
