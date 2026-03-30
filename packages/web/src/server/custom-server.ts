import path from 'path'
import fs from 'node:fs'
import next from 'next'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { parse } from 'url'
import { spawn, type ChildProcess } from 'child_process'
import { startWatcher } from './watcher'
import { addGlobalListener } from './global-watcher'
import { getBrainPathForId, getSuggestedTask, runTeamMcpCall } from './team-board-mcp'
import { isV2Method, runV2McpCall } from './v2/mcp'

const dev = process.env.NODE_ENV === 'development'
const port = parseInt(process.env.PORT || '3000', 10)

function isWebProjectRoot(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, 'package.json')) && fs.existsSync(path.join(candidate, 'src', 'app'))
}

function resolveWebProjectRoot(): string {
  const fromEnv = process.env.BRIAN_WEB_ROOT?.trim()
  if (fromEnv && isWebProjectRoot(fromEnv)) return path.resolve(fromEnv)

  const fromCwd = path.resolve(process.cwd())
  if (isWebProjectRoot(fromCwd)) return fromCwd

  // Works for tsx dev runs from src/server and tsc output runs from dist/server.
  const fromDirTwoUp = path.resolve(__dirname, '..', '..')
  if (isWebProjectRoot(fromDirTwoUp)) return fromDirTwoUp

  // Last-resort fallback so startup emits deterministic preflight errors.
  return fromCwd
}

const projectRoot = resolveWebProjectRoot()
const app = next({
  dev,
  dir: projectRoot,
  conf: {
    distDir: dev ? '.next-dev' : '.next',
  },
})
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
  handoffs: Array<{ id: string; session_number?: number; summary?: string; file_path?: string }>
}

type TeamObserver = {
  brainId: string
  startedAt: string
  ticks: number
  addedTasks: number
  timer: NodeJS.Timeout
}

type SquadConfig = {
  id: string
  name: string
  memberAgentIds: string[]
}

const activeRuns = new Map<string, BrainRun>()
const activeChildren = new Map<string, ChildProcess>()
const teamObservers = new Map<string, TeamObserver>()

function verifyNextBuildArtifacts(root: string): { ok: true } | { ok: false; missing: string[] } {
  const required = ['.next/build-manifest.json', '.next/server/middleware-manifest.json']
  const missing = required.filter((rel) => !fs.existsSync(path.join(root, rel)))

  // Next.js artifact names can vary slightly by version/build mode.
  const runtimeCandidates = ['.next/server/webpack-runtime.js', '.next/server/webpack-api-runtime.js']
  if (!runtimeCandidates.some((rel) => fs.existsSync(path.join(root, rel)))) {
    missing.push('one of: .next/server/webpack-runtime.js | .next/server/webpack-api-runtime.js')
  }

  // BUILD_ID / required-server-files can be absent in some app-dir/server setups.
  const idOrRequiredCandidates = ['.next/BUILD_ID', '.next/required-server-files.json']
  if (!idOrRequiredCandidates.some((rel) => fs.existsSync(path.join(root, rel)))) {
    missing.push('one of: .next/BUILD_ID | .next/required-server-files.json')
  }

  if (missing.length > 0) return { ok: false, missing }
  return { ok: true }
}

function broadcastSnapshotToBrainSubscribers(brainId: string, snapshot: TeamSnapshot) {
  for (const [client, watcher] of clientWatchers.entries()) {
    if (watcher.brainId !== brainId || client.readyState !== WebSocket.OPEN) continue
    client.send(JSON.stringify({ type: 'execution_steps', data: snapshot.executionSteps }))
    client.send(JSON.stringify({ type: 'handoffs', data: snapshot.handoffs }))
  }
}

function createAutoHandoff(brainId: string, run: BrainRun): string | null {
  let brainPath = ''
  try {
    brainPath = getBrainPathForId(brainId)
  } catch {
    return null
  }
  const handoffDir = path.join(brainPath, 'brian', 'handoffs')
  if (!fs.existsSync(handoffDir)) return null

  const files = fs
    .readdirSync(handoffDir)
    .filter((name) => /^handoff-\d+\.md$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
  const maxSession = files.reduce((acc, file) => {
    const match = file.match(/^handoff-(\d+)\.md$/i)
    if (!match) return acc
    return Math.max(acc, Number(match[1]))
  }, 0)
  const session = maxSession + 1
  let sessionId = String(session).padStart(3, '0')
  let fileName = `handoff-${sessionId}.md`
  let filePath = path.join(handoffDir, fileName)
  while (fs.existsSync(filePath)) {
    const next = Number(sessionId) + 1
    sessionId = String(next).padStart(3, '0')
    fileName = `handoff-${sessionId}.md`
    filePath = path.join(handoffDir, fileName)
  }

  const started = new Date(run.startedAt)
  const ended = new Date(run.endedAt ?? new Date().toISOString())
  const durationSec = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000))
  let recommendation = 'No pending suggestion'
  try {
    recommendation = getSuggestedTask(brainId)?.label ?? recommendation
  } catch {
    // best-effort handoff generation; keep fallback recommendation
  }

  const content = [
    `# handoff-${sessionId}`,
    '',
    '> Part of [[handoffs/index]]',
    '',
    '## Session Snapshot',
    `- Started: ${run.startedAt}`,
    `- Ended: ${run.endedAt ?? ended.toISOString()}`,
    `- Duration: ${durationSec}s`,
    `- Actor: ${run.actor}`,
    `- Status: ${run.status}`,
    '',
    '## Work Summary',
    `- Task: ${run.label}`,
    run.blockerReason ? `- Blocker: ${run.blockerReason}` : '',
    '',
    '## Recommended Next Steps',
    `- ${recommendation}`,
    '',
  ].filter(Boolean).join('\n')

  fs.writeFileSync(filePath, content, 'utf8')
  return `brian/handoffs/${fileName}`
}

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

function discussionActor(agentId: string): string {
  return agentId || 'project-operator'
}

function classifyStage(line: string): 'planning' | 'coding' | 'verification' | 'blocker' | 'system' {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('failed') || lower.includes('conflict')) return 'blocker'
  if (lower.includes('implement') || lower.includes('edit') || lower.includes('patch') || lower.includes('diff')) return 'coding'
  if (lower.includes('test') || lower.includes('verify') || lower.includes('validation')) return 'verification'
  if (lower.includes('plan') || lower.includes('todo')) return 'planning'
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
  if (noise.some((n) => trimmed.startsWith(n))) return true

  // Ignore command and shell noise that drowns out mission-control signal.
  if (/^\/bin\/(zsh|bash)\s+-lc\s+/i.test(trimmed)) return true
  if (/^(succeeded|failed) in \d+ms:/i.test(trimmed)) return true
  if (/^total\s+\d+$/i.test(trimmed)) return true
  if (/^[\-dl]([rwx\-]{9}|[rwx\-]{9}@)\s+\d+\s+\w+/i.test(trimmed)) return true
  if (/^drwx|^-rw|^-rwx/i.test(trimmed)) return true
  if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(trimmed)) return true
  if (/^exec$/i.test(trimmed)) return true
  if (/^in\s+\/Users\/.+$/i.test(trimmed)) return true

  return false
}

function broadcastTeamEvent(
  wss: WebSocketServer,
  brainId: string,
  message: string,
  options: {
    id?: string
    actor?: string
    layer?: string
    stage?: string
    kind?: 'info' | 'status' | 'blocker' | string
    initiativeId?: string
    initiativeTitle?: string
    discussionId?: string
    discussionTitle?: string
    decisionQuestion?: string
    refs?: string[]
  } = {}
) {
  const payload = JSON.stringify({
    type: 'mcp.event',
    channel: 'team',
    id: options.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    brainId,
    message,
    at: new Date().toISOString(),
    actor: options.actor ?? 'mission-control',
    layer: options.layer ?? 'system',
    stage: options.stage ?? 'system',
    kind: options.kind ?? 'info',
    initiativeId: options.initiativeId,
    initiativeTitle: options.initiativeTitle,
    discussionId: options.discussionId,
    discussionTitle: options.discussionTitle,
    decisionQuestion: options.decisionQuestion,
    refs: options.refs ?? [],
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
    const source = trimmed.length > 0 && !isFallbackSuggestion(trimmed) ? trimmed : 'mission control reliability'
    const lanes: Array<{ lane: string; title: string }> = [
      { lane: 'incremental', title: `Incremental: ${source}` },
      { lane: 'dream_feature', title: `Dream feature: autonomous ${source} assistant` },
      { lane: 'refactor', title: `Refactor: simplify and harden ${source} workflow` },
    ]
    for (const lane of lanes) {
      const slug = `${lane.lane}-${lane.title}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 42) || `queue-${lane.lane}`
      issues.push({
        prefix: 'NEXT:',
        text: `feature="${lane.title}" lane=${lane.lane} worktree=feature/${slug} image=pending breaking=none`,
      })
    }
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

function startCodexRunForSuggestion(
  wss: WebSocketServer,
  brainId: string,
  squad?: { id: string; name: string; memberAgentIds: string[] }
) {
  const existing = activeRuns.get(brainId)
  if (existing && activeChildren.has(brainId)) {
    return existing
  }

  const suggestion = getSuggestedTask(brainId)
  if (!suggestion?.label) return null
  const label = suggestion.label

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
  const squadContext = squad ? `You are operating as squad "${squad.name}" (${squad.memberAgentIds.join(', ')}).` : ''
  const prompt = [
    `Start focused implementation work for this task: ${label}.`,
    squadContext,
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
      const message = stage === 'blocker' && !/escalat/i.test(line)
        ? `requires escalation (not escalated in squad-only mode): ${line}`
        : line
      broadcastTeamEvent(wss, brainId, `[${stream}] ${message}`, {
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
    const handoffPath = createAutoHandoff(brainId, run)
    if (handoffPath) {
      broadcastTeamEvent(wss, brainId, `handoff_created:${handoffPath}`, {
        actor: run.actor,
        stage: 'verification',
        kind: 'status',
        refs: [handoffPath],
      })
    }
    const postRun = runTeamMcpCall(brainId, 'team.get_snapshot', {})
    broadcastSnapshotToBrainSubscribers(brainId, postRun.snapshot as TeamSnapshot)
  })

  const members = squad?.memberAgentIds?.length ? squad.memberAgentIds : [run.actor, 'product-lead', 'project-operator']
  broadcastTeamEvent(wss, brainId, `alignment: ${label}`, {
    actor: discussionActor(members[0]),
    stage: 'planning',
    kind: 'status',
  })
  broadcastTeamEvent(wss, brainId, `planning: task breakdown + acceptance checks for "${label}"`, {
    actor: discussionActor(members[1] ?? members[0]),
    stage: 'planning',
    kind: 'status',
  })
  if (label.includes('?')) {
    broadcastTeamEvent(wss, brainId, `blocking question identified; requires escalation (not escalated in squad-only mode): ${label}`, {
      actor: discussionActor(members[2] ?? members[0]),
      stage: 'blocker',
      kind: 'blocker',
    })
  }
  broadcastTeamEvent(wss, brainId, `execution: ${label}`, {
    actor: discussionActor(run.actor),
    stage: 'coding',
    kind: 'status',
  })
  broadcastTeamEvent(wss, brainId, `run_started:${label}`, { actor: run.actor, stage: 'planning', kind: 'status' })
  return run
}

const preflight = verifyNextBuildArtifacts(projectRoot)
if (!dev && !preflight.ok) {
  console.warn(
    [
      '> Brian startup warning: expected Next.js artifacts are missing or non-standard.',
      '> Attempting startup anyway; if boot fails, run `npm run build --workspace=packages/web`.',
      `> Missing:\n${preflight.missing.map((rel) => `- ${rel}`).join('\n')}`,
    ].join('\n')
  )
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
              const requestedSquadId = typeof params.squadId === 'string' ? params.squadId.trim() : ''
              if (requestedSquadId) {
                runTeamMcpCall(brainId, 'team.set_active_squad', { squadId: requestedSquadId })
              }
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
              if (result.message === 'no_suggestion_available') {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result }))
                  ws.send(JSON.stringify({ type: 'execution_steps', data: result.snapshot.executionSteps }))
                  ws.send(JSON.stringify({ type: 'handoffs', data: result.snapshot.handoffs }))
                }
                broadcastTeamEvent(wss, brainId, 'start_blocked:no_suggestion_available', {
                  actor: 'mission-control',
                  stage: 'blocker',
                  kind: 'blocker',
                })
                return
              }
              const squadState = runTeamMcpCall(brainId, 'team.get_squads', {}) as {
                squads?: SquadConfig[]
                activeSquadId?: string
              }
              const activeSquad = (squadState.squads ?? []).find((sq) => sq.id === squadState.activeSquadId)
              const run = startCodexRunForSuggestion(wss, brainId, activeSquad)
              if (!run) {
                const blocked = { ...result, message: 'start_blocked:no_suggestion_available' }
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result: blocked }))
                  ws.send(JSON.stringify({ type: 'execution_steps', data: blocked.snapshot.executionSteps }))
                  ws.send(JSON.stringify({ type: 'handoffs', data: blocked.snapshot.handoffs }))
                }
                broadcastTeamEvent(wss, brainId, blocked.message, {
                  actor: 'mission-control',
                  stage: 'blocker',
                  kind: 'blocker',
                })
                return
              }
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
                ws.send(JSON.stringify({
                  type: 'mcp.result',
                  id: callId,
                  ok: true,
                  result: {
                    run,
                    active,
                    observer: observerStateForBrain(brainId),
                    workflowAutopilot: runV2McpCall(brainId, 'workflow.autopilot.state', {}).autopilot,
                  },
                }))
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

            if (method === 'team.generate_handoff') {
              const now = new Date().toISOString()
              const existingRun = activeRuns.get(brainId)
              const fallbackSuggestion = getSuggestedTask(brainId)?.label ?? 'Manual mission checkpoint'
              const syntheticRun: BrainRun = {
                id: `manual-${Date.now()}`,
                brainId,
                status: existingRun?.status === 'blocked' ? 'blocked' : 'completed',
                startedAt: existingRun?.startedAt ?? now,
                endedAt: now,
                label: existingRun?.label ?? fallbackSuggestion,
                actor: existingRun?.actor ?? 'project-operator',
                blockerReason: existingRun?.blockerReason,
              }
              const handoffPath = createAutoHandoff(brainId, syntheticRun)
              const snapshot = runTeamMcpCall(brainId, 'team.get_snapshot', {})

              if (handoffPath) {
                broadcastTeamEvent(wss, brainId, `handoff_created:${handoffPath}`, {
                  actor: 'project-operator',
                  stage: 'verification',
                  kind: 'status',
                  refs: [handoffPath],
                })
              }

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'mcp.result',
                  id: callId,
                  ok: true,
                  result: {
                    message: handoffPath ? `handoff_created:${handoffPath}` : 'handoff_not_created',
                    handoffPath,
                    snapshot: snapshot.snapshot,
                  },
                }))
                ws.send(JSON.stringify({ type: 'execution_steps', data: snapshot.snapshot.executionSteps }))
                ws.send(JSON.stringify({ type: 'handoffs', data: snapshot.snapshot.handoffs }))
              }
              return
            }

            if (isV2Method(method)) {
              const result = runV2McpCall(brainId, method, params)
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'mcp.result', id: callId, ok: true, result }))
                if (result.event) {
                  broadcastTeamEvent(wss, brainId, result.event.message, {
                    id: result.event.id,
                    actor: result.event.actor,
                    layer: result.event.layer,
                    stage: result.event.stage,
                    kind: 'status',
                    initiativeId: result.event.initiativeId,
                    initiativeTitle: result.event.initiativeTitle,
                    discussionId: result.event.discussionId,
                    discussionTitle: result.event.discussionTitle,
                    decisionQuestion: result.event.decisionQuestion,
                    refs: result.event.refs,
                  })
                }
              }
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
}).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`> Brian server failed during Next prepare:\n${message}`)
  process.exit(1)
})
