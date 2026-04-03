import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { getBrain, getExecutionSteps, getHandoffs, scanBrainFiles } from '../lib/local-data'
import { isExecutionPlanFile } from '../lib/execution-plan-parser'
import { readV2Models } from '../lib/v2/projection'
import { captureFailureBundle, latestVerificationRun, policyStatus, runVerificationSuite } from './mission-governance'

type StepStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked'

type ExecutionStep = {
  id: string
  phase_number: number
  step_number: number
  title: string
  status: StepStatus
  tasks_json: Array<{ done: boolean; text: string }> | null
}

type Snapshot = {
  executionSteps: ExecutionStep[]
  handoffs: ReturnType<typeof getHandoffs>
}

export type TeamSuggestion = {
  stepId: string
  taskIndex?: number
  label: string
}

type McpResult = {
  message: string
  snapshot: Snapshot
  repo?: {
    branch: string
    hasConflicts: boolean
    conflictFiles: string[]
    isDirty: boolean
    canStartNextWork: boolean
    unresolvedWorktrees: string[]
    unresolvedWorktreeDetails: Array<{ path: string; branch: string }>
    hardBlockers: Array<{ code: string; message: string; resolution: string }>
  }
  conflictSummary?: string
  suggested?: string
  mergePreview?: {
    sourceBranch: string
    targetBranch: string
    filesChanged: string[]
    hasConflicts: boolean
    summary: string
  }
  mergeQueue?: {
    total: number
    merged: number
    blockedAt?: string
    details: Array<{ item: string; status: 'ready' | 'blocked' | 'merged'; reason?: string }>
    recommendedOrder?: string[]
  }
  ship?: {
    pushed: boolean
    remote: 'origin'
    branch: 'main'
    commitShas: string[]
    message: string
    at: string
  }
  squads?: SquadConfig[]
  activeSquadId?: string
  agentCatalog?: Array<{ id: string; label: string }>
  liveDemoGate?: {
    ready: boolean
    acknowledgedAt: string | null
    actor: string | null
  }
  policy?: {
    ok: boolean
    missingMcpMethods: string[]
    missingSkills: string[]
    missingRules: string[]
    version: number
  }
  verification?: {
    id: string
    at: string
    ok: boolean
    touchedCoveragePct: number
    e2eFeatures: string[]
    gates: Array<{ name: string; ok: boolean; retried: boolean }>
  }
  failureBundle?: {
    id: string
    at: string
    reason: string
    actor: string
    runId?: string
    stage: string
    branch: string
    details: string
  }
}

type WorktreeEntry = {
  path: string
  branch?: string
  detached: boolean
}

type ActiveInitiativeContext = {
  id: string
  title: string
  missionBranch: string
  scopedStepIds: Set<string>
}

type SquadConfig = {
  id: string
  name: string
  memberAgentIds: string[]
}

type SquadState = {
  activeSquadId: string
  squads: SquadConfig[]
}

type LiveDemoGateState = {
  ready: boolean
  acknowledgedAt: string | null
  actor: string | null
}

const SQUAD_AGENT_CATALOG: Array<{ id: string; label: string }> = [
  { id: 'project-operator', label: 'Project Operator' },
  { id: 'product-lead', label: 'Product Lead' },
  { id: 'frontend-engineer', label: 'Frontend Engineer' },
  { id: 'backend-engineer', label: 'Backend Engineer' },
  { id: 'mobile-engineer', label: 'Mobile Engineer' },
  { id: 'devops-release', label: 'DevOps / Release' },
  { id: 'growth-marketing', label: 'Growth / Marketing' },
  { id: 'director', label: 'Director' },
  { id: 'tribe-head', label: 'Tribe Head' },
  { id: 'founder-ceo', label: 'Founder / CEO' },
]

function snapshotForBrain(brainPath: string): Snapshot {
  const files = scanBrainFiles(brainPath)
  return {
    executionSteps: getExecutionSteps(brainPath, files) as ExecutionStep[],
    handoffs: getHandoffs(brainPath, files),
  }
}

function missionControlStatePath(brainPath: string): string {
  return path.join(brainPath, '.brian', 'mission-control.json')
}

function liveDemoGatePath(brainPath: string): string {
  return path.join(brainPath, '.brian', 'live-demo-gate.json')
}

function defaultSquadState(): SquadState {
  return {
    activeSquadId: 'squad-core',
    squads: [
      {
        id: 'squad-core',
        name: 'Core Squad',
        memberAgentIds: ['project-operator', 'product-lead', 'frontend-engineer', 'backend-engineer'],
      },
    ],
  }
}

function defaultLiveDemoGateState(): LiveDemoGateState {
  return { ready: false, acknowledgedAt: null, actor: null }
}

function normalizeSquadState(input: Partial<SquadState> | null | undefined): SquadState {
  const fallback = defaultSquadState()
  const squads = Array.isArray(input?.squads)
    ? input!.squads
      .filter((sq): sq is SquadConfig => Boolean(sq && typeof sq.id === 'string' && typeof sq.name === 'string'))
      .map((sq) => ({
        id: sq.id.trim() || `squad-${Date.now().toString(36)}`,
        name: sq.name.trim() || 'Unnamed Squad',
        memberAgentIds: Array.isArray(sq.memberAgentIds)
          ? sq.memberAgentIds.map((id) => String(id).trim()).filter(Boolean)
          : [],
      }))
    : fallback.squads

  const activeSquadId = typeof input?.activeSquadId === 'string' && input.activeSquadId.trim()
    ? input.activeSquadId.trim()
    : squads[0]?.id ?? fallback.activeSquadId

  return {
    activeSquadId: squads.some((sq) => sq.id === activeSquadId) ? activeSquadId : (squads[0]?.id ?? fallback.activeSquadId),
    squads: squads.length > 0 ? squads : fallback.squads,
  }
}

function readSquadState(brainPath: string): SquadState {
  const statePath = missionControlStatePath(brainPath)
  try {
    if (!fs.existsSync(statePath)) {
      const seeded = defaultSquadState()
      fs.mkdirSync(path.dirname(statePath), { recursive: true })
      fs.writeFileSync(statePath, JSON.stringify(seeded, null, 2) + '\n', 'utf8')
      return seeded
    }
    const raw = fs.readFileSync(statePath, 'utf8')
    return normalizeSquadState(JSON.parse(raw) as Partial<SquadState>)
  } catch {
    return defaultSquadState()
  }
}

function writeSquadState(brainPath: string, state: SquadState): SquadState {
  const statePath = missionControlStatePath(brainPath)
  const normalized = normalizeSquadState(state)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(normalized, null, 2) + '\n', 'utf8')
  return normalized
}

function readLiveDemoGateState(brainPath: string): LiveDemoGateState {
  const statePath = liveDemoGatePath(brainPath)
  try {
    if (!fs.existsSync(statePath)) {
      const seeded = defaultLiveDemoGateState()
      fs.mkdirSync(path.dirname(statePath), { recursive: true })
      fs.writeFileSync(statePath, JSON.stringify(seeded, null, 2) + '\n', 'utf8')
      return seeded
    }
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<LiveDemoGateState>
    return {
      ready: Boolean(raw.ready),
      acknowledgedAt: typeof raw.acknowledgedAt === 'string' && raw.acknowledgedAt.trim() ? raw.acknowledgedAt : null,
      actor: typeof raw.actor === 'string' && raw.actor.trim() ? raw.actor.trim() : null,
    }
  } catch {
    return defaultLiveDemoGateState()
  }
}

function writeLiveDemoGateState(brainPath: string, state: LiveDemoGateState): LiveDemoGateState {
  const normalized: LiveDemoGateState = {
    ready: Boolean(state.ready),
    acknowledgedAt: typeof state.acknowledgedAt === 'string' && state.acknowledgedAt.trim() ? state.acknowledgedAt : null,
    actor: typeof state.actor === 'string' && state.actor.trim() ? state.actor.trim() : null,
  }
  const statePath = liveDemoGatePath(brainPath)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(normalized, null, 2) + '\n', 'utf8')
  return normalized
}

function findTargetFile(brainPath: string, stepId: string): string {
  const isTeamStep = stepId.startsWith('team-step-')
  const files = scanBrainFiles(brainPath)
  const execFile = isTeamStep
    ? files.find((f) => f.path === 'brian/commands/team-board.md')
    : files.find((f) => isExecutionPlanFile(f.path))
  if (!execFile) throw new Error(isTeamStep ? 'No team board found' : 'No execution plan found')
  return path.join(brainPath, execFile.path)
}

function mutateStepFile(
  brainPath: string,
  payload: {
    stepId: string
    status?: StepStatus
    taskIndex?: number
    taskDone?: boolean
    appendTaskText?: string
    moveTaskFromIndex?: number
    moveTaskToIndex?: number
  }
) {
  const { stepId, status, taskIndex, taskDone, appendTaskText, moveTaskFromIndex, moveTaskToIndex } = payload
  const wantsStatus = typeof status === 'string'
  const wantsTaskToggle = Number.isInteger(taskIndex) && typeof taskDone === 'boolean'
  const wantsTaskAppend = typeof appendTaskText === 'string' && appendTaskText.trim().length > 0
  const wantsTaskMove = Number.isInteger(moveTaskFromIndex) && Number.isInteger(moveTaskToIndex)
  if (!wantsStatus && !wantsTaskToggle && !wantsTaskAppend && !wantsTaskMove) return

  const fullPath = findTargetFile(brainPath, stepId)
  const content = fs.readFileSync(fullPath, 'utf8')
  const lines = content.split('\n')
  const stepIndexMatch = stepId.match(/-(\d+)$/)
  const stepIndex = stepIndexMatch ? parseInt(stepIndexMatch[1], 10) : NaN
  if (Number.isNaN(stepIndex)) throw new Error('Invalid stepId')

  const statusMap: Record<StepStatus, string> = {
    completed: 'COMPLETED',
    in_progress: 'IN PROGRESS',
    not_started: 'NOT STARTED',
    blocked: 'BLOCKED',
  }

  const isTeamStep = stepId.startsWith('team-step-')
  const newStatusText = wantsStatus ? statusMap[status as StepStatus] : null
  let stepCount = -1
  let updated = false

  const findTaskLineIndices = (startLine: number): number[] => {
    const indices: number[] = []
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i]
      if (/^###\s+/.test(line)) break
      if (/^\s*-\s+\[( |x)\]\s+/i.test(line)) indices.push(i)
    }
    return indices
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!isTeamStep && wantsStatus && line.trim().startsWith('|') && !line.trim().match(/^\|[\s\-|]+\|$/) && !/step/i.test(line)) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
      if (cells.length >= 2 && /^\d/.test(cells[0])) {
        stepCount++
        if (stepCount === stepIndex) {
          const statusCellIdx = cells.length - 1
          cells[statusCellIdx] = (newStatusText as string).toLowerCase().replace(/\s+/g, '_')
          lines[i] = '| ' + cells.join(' | ') + ' |'
          updated = true
          break
        }
      }
    }

    const statusMatch = line.match(/^(\s*-\s+\*\*Status\*\*:\s*)(.+)/i)
    if (!statusMatch) continue
    stepCount++
    if (stepCount !== stepIndex) continue

    if (wantsStatus && newStatusText) {
      lines[i] = statusMatch[1] + newStatusText
      updated = true
    }

    if (wantsTaskToggle) {
      const taskLines = findTaskLineIndices(i)
      const taskLineIdx = taskLines[taskIndex as number]
      if (taskLineIdx !== undefined) {
        lines[taskLineIdx] = lines[taskLineIdx].replace(/^(\s*-\s+\[)( |x)(\]\s+)/i, `$1${taskDone ? 'x' : ' '}$3`)
        updated = true
      }
    }

    if (wantsTaskMove) {
      const taskLines = findTaskLineIndices(i)
      const fromLineIdx = taskLines[moveTaskFromIndex as number]
      const toLineIdx = taskLines[moveTaskToIndex as number]
      if (fromLineIdx !== undefined && toLineIdx !== undefined && fromLineIdx !== toLineIdx) {
        const [moved] = lines.splice(fromLineIdx, 1)
        const target = fromLineIdx < toLineIdx ? toLineIdx - 1 : toLineIdx
        lines.splice(target, 0, moved)
        updated = true
      }
    }

    if (wantsTaskAppend) {
      const nextSectionIdx = lines.slice(i + 1).findIndex((l) => /^###\s+/.test(l))
      const insertAt = nextSectionIdx === -1 ? lines.length : i + 1 + nextSectionIdx
      lines.splice(insertAt, 0, `- [ ] ${appendTaskText?.trim()}`)
      updated = true
    }
    break
  }

  if (!updated) throw new Error('Target step/task not found')
  fs.writeFileSync(fullPath, lines.join('\n'), 'utf8')
}

function safeGit(brainPath: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: brainPath, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim()
  } catch {
    return ''
  }
}

function tryGit(brainPath: string, args: string[]): { ok: boolean; stdout: string; error: string } {
  try {
    const stdout = execFileSync('git', args, { cwd: brainPath, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim()
    return { ok: true, stdout, error: '' }
  } catch (error) {
    const err = error as { stderr?: Buffer | string; message?: string }
    const stderr = typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString('utf8') ?? ''
    return { ok: false, stdout: '', error: stderr.trim() || (err.message ?? 'git command failed') }
  }
}

function parseMergeInstruction(taskText: string): { sourceBranch: string; targetBranch: string } | null {
  const match =
    taskText.match(/(?:branch|worktree)\s*=\s*([^\s]+)\s*->\s*([^\s]+)/i) ??
    taskText.match(/(?:branch|worktree)\s*=\s*([^\s]+)\b/i)
  if (!match) return null
  const sourceBranch = match[1].trim()
  const targetBranch = match[2]?.trim() || 'main'
  return { sourceBranch, targetBranch }
}

function parseTaskMetadata(taskText: string, key: string): string | null {
  const match = taskText.match(new RegExp(`${key}\\s*=\\s*(\"[^\"]+\"|[^\\s]+)`, 'i'))
  if (!match?.[1]) return null
  return match[1].replace(/^"|"$/g, '').trim()
}

function stepInitiativeMetadata(step: ExecutionStep): { initiativeId: string; missionBranch?: string } | null {
  for (const task of step.tasks_json ?? []) {
    const raw = task.text.trim()
    if (!/^INITIATIVE:/i.test(raw)) continue
    const initiativeId = parseTaskMetadata(raw, 'initiative_id') ?? parseTaskMetadata(raw, 'initiative')
    if (!initiativeId) continue
    const missionBranch = parseTaskMetadata(raw, 'mission_branch') ?? undefined
    return { initiativeId, missionBranch }
  }
  return null
}

function resolveActiveInitiativeContext(brainId: string, brainPath: string, snapshot: Snapshot): ActiveInitiativeContext | null {
  const models = readV2Models(brainId, brainPath)
  const active =
    models.initiatives.find((initiative) => initiative.stage === 'execution')
    ?? models.initiatives.find((initiative) => initiative.stage === 'squad_planning')
    ?? models.initiatives.find((initiative) => initiative.stage === 'tribe_shaping')
    ?? models.initiatives.find((initiative) => initiative.stage === 'proposal')
    ?? models.initiatives.find((initiative) => initiative.stage === 'intent')
    ?? null
  if (!active) return null

  const scopedStepIds = new Set(
    snapshot.executionSteps
      .filter((step) => stepInitiativeMetadata(step)?.initiativeId === active.id)
      .map((step) => step.id)
  )
  const missionBranch = `mission/${active.id}`
  return {
    id: active.id,
    title: active.title,
    missionBranch,
    scopedStepIds,
  }
}

function ensureLocalBranchExists(brainPath: string, branchName: string): void {
  const branch = branchName.trim()
  if (!branch) return
  const existing = safeGit(brainPath, ['show-ref', '--verify', `refs/heads/${branch}`])
  if (existing) return

  const fromMain = tryGit(brainPath, ['branch', branch, 'main'])
  if (fromMain.ok) return
  void tryGit(brainPath, ['branch', branch])
}

function validateMergeTaskText(taskText: string): { ok: boolean; reason?: string } {
  const mergeMeta = parseMergeInstruction(taskText)
  if (!mergeMeta) return { ok: false, reason: 'missing_worktree_metadata' }
  if (mergeMeta.sourceBranch === mergeMeta.targetBranch) return { ok: false, reason: 'source_target_same_branch' }
  if (mergeMeta.targetBranch !== 'main' && !mergeMeta.targetBranch.startsWith('mission/')) {
    return { ok: false, reason: 'target_must_be_main_or_mission_branch' }
  }
  const feature = parseTaskMetadata(taskText, 'feature')
  const image = parseTaskMetadata(taskText, 'image')
  const breaking = parseTaskMetadata(taskText, 'breaking')
  if (!feature) return { ok: false, reason: 'missing_feature_metadata' }
  if (!image) return { ok: false, reason: 'missing_image_metadata' }
  if (!breaking) return { ok: false, reason: 'missing_breaking_metadata' }
  return { ok: true }
}

function branchExists(brainPath: string, branch: string): boolean {
  return tryGit(brainPath, ['rev-parse', '--verify', `refs/heads/${branch}`]).ok
}

function previewMerge(
  brainPath: string,
  sourceBranch: string,
  targetBranch: string
): { filesChanged: string[]; hasConflicts: boolean; summary: string } {
  if (!branchExists(brainPath, sourceBranch) || !branchExists(brainPath, targetBranch)) {
    return {
      filesChanged: [],
      hasConflicts: true,
      summary: `Branch metadata invalid: source=${sourceBranch} target=${targetBranch}. Ensure both local branches exist.`,
    }
  }

  const mergeBaseRes = tryGit(brainPath, ['merge-base', targetBranch, sourceBranch])
  if (!mergeBaseRes.ok || !mergeBaseRes.stdout) {
    return {
      filesChanged: [],
      hasConflicts: true,
      summary: `Unable to compute merge-base for ${sourceBranch} -> ${targetBranch}: ${mergeBaseRes.error}`,
    }
  }

  const filesRaw = safeGit(brainPath, ['diff', '--name-only', `${targetBranch}...${sourceBranch}`])
  const filesChanged = filesRaw ? filesRaw.split('\n').map((line) => line.trim()).filter(Boolean) : []

  const mergeTreeRes = tryGit(brainPath, ['merge-tree', mergeBaseRes.stdout, targetBranch, sourceBranch])
  const mergeTree = mergeTreeRes.stdout || mergeTreeRes.error
  const hasConflicts =
    mergeTree.includes('<<<<<<<') ||
    mergeTree.includes('changed in both') ||
    mergeTree.includes('CONFLICT')

  const summary = [
    `Preview merge: ${sourceBranch} -> ${targetBranch}`,
    `Changed files: ${filesChanged.length}`,
    `Conflicts: ${hasConflicts ? 'yes' : 'no'}`,
  ].join('\n')

  return { filesChanged, hasConflicts, summary }
}

function stashIfDirty(brainPath: string, label: string): { didStash: boolean; stashRef?: string; error?: string } {
  const statusShort = safeGit(brainPath, ['status', '--short'])
  if (!statusShort) return { didStash: false }
  const stashRes = tryGit(brainPath, ['stash', 'push', '-u', '-m', label])
  if (!stashRes.ok) return { didStash: false, error: stashRes.error }
  const latest = safeGit(brainPath, ['stash', 'list', '-n', '1', '--format=%gd'])
  if (!latest) return { didStash: false, error: 'stash_created_but_not_found' }
  return { didStash: true, stashRef: latest.trim() }
}

function restoreStash(brainPath: string, stashRef: string): { ok: boolean; error?: string } {
  const applyRes = tryGit(brainPath, ['stash', 'apply', stashRef])
  if (!applyRes.ok) return { ok: false, error: applyRes.error }
  void tryGit(brainPath, ['stash', 'drop', stashRef])
  return { ok: true }
}

function parseWorktreeList(brainPath: string): WorktreeEntry[] {
  const raw = safeGit(brainPath, ['worktree', 'list', '--porcelain'])
  if (!raw) return []
  const blocks = raw.split('\n\n').map((b) => b.trim()).filter(Boolean)
  const out: WorktreeEntry[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const wtLine = lines.find((line) => line.startsWith('worktree '))
    if (!wtLine) continue
    const branchLine = lines.find((line) => line.startsWith('branch '))
    const detached = lines.some((line) => line.trim() === 'detached')
    out.push({
      path: wtLine.replace(/^worktree\s+/, '').trim(),
      branch: branchLine?.replace(/^branch\s+refs\/heads\//, '').trim(),
      detached,
    })
  }
  return out
}

function worktreePathForBranch(brainPath: string, branch: string): string | null {
  for (const wt of parseWorktreeList(brainPath)) {
    if (wt.branch === branch) return wt.path
  }
  return null
}

function activeRuntimeWorktreeRoot(): string {
  const fromCwd = safeGit(process.cwd(), ['rev-parse', '--show-toplevel'])
  if (fromCwd) return path.resolve(fromCwd)
  return path.resolve(process.cwd())
}

function gitRepoState(brainPath: string) {
  const currentPath = path.resolve(brainPath)
  const branch = safeGit(brainPath, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown'
  const conflictsRaw = safeGit(brainPath, ['diff', '--name-only', '--diff-filter=U'])
  const conflictFiles = conflictsRaw ? conflictsRaw.split('\n').map((line) => line.trim()).filter(Boolean) : []
  const statusShort = safeGit(brainPath, ['status', '--short'])
  const runtimeWorktree = activeRuntimeWorktreeRoot()
  const unresolvedWorktrees: string[] = []
  const unresolvedWorktreeDetails: Array<{ path: string; branch: string }> = []
  for (const wt of parseWorktreeList(brainPath)) {
    const resolvedPath = path.resolve(wt.path)
    if (resolvedPath === currentPath) continue
    if (resolvedPath === runtimeWorktree) continue
    if (wt.detached) continue
    if (resolvedPath.includes(`${path.sep}.codex${path.sep}worktrees${path.sep}`)) continue
    if (!wt.branch) continue
    unresolvedWorktrees.push(wt.path)
    unresolvedWorktreeDetails.push({ path: wt.path, branch: wt.branch })
  }
  const hardBlockers: Array<{ code: string; message: string; resolution: string }> = []
  if (conflictFiles.length > 0) {
    hardBlockers.push({
      code: 'merge_conflicts',
      message: `Merge conflicts in ${conflictFiles.length} file(s).`,
      resolution: 'Resolve conflicts, then rerun dry-run/merge.',
    })
  }
  if (unresolvedWorktrees.length > 0) {
    hardBlockers.push({
      code: 'unresolved_worktrees',
      message: `${unresolvedWorktrees.length} unresolved worktree(s) still active.`,
      resolution: 'Merge or clean stale worktrees before starting the next mission.',
    })
  }
  return {
    branch,
    hasConflicts: conflictFiles.length > 0,
    conflictFiles,
    isDirty: statusShort.length > 0,
    canStartNextWork: unresolvedWorktrees.length === 0,
    unresolvedWorktrees,
    unresolvedWorktreeDetails,
    hardBlockers,
  }
}

function cleanupResolvedWorktrees(brainPath: string, forceAll: boolean): { removed: string[]; failed: string[] } {
  tryGit(brainPath, ['worktree', 'prune'])
  const entries = parseWorktreeList(brainPath)
  const runtimeWorktree = activeRuntimeWorktreeRoot()
  const removed: string[] = []
  const failed: string[] = []

  for (const wt of entries) {
    const resolvedPath = path.resolve(wt.path)
    if (resolvedPath === path.resolve(brainPath)) continue
    if (resolvedPath === runtimeWorktree) continue
    if (wt.detached) continue
    if (!wt.branch) continue

    let canRemove = forceAll
    if (!canRemove) {
      const mergedCheck = tryGit(brainPath, ['branch', '--merged', 'main', '--list', wt.branch])
      const isMergedToMain = mergedCheck.ok && mergedCheck.stdout.split('\n').some((line) => line.replace('*', '').trim() === wt.branch)
      canRemove = isMergedToMain
    }
    if (!canRemove) continue

    const removeRes = tryGit(brainPath, ['worktree', 'remove', '--force', wt.path])
    if (!removeRes.ok) {
      failed.push(`${wt.path} (${removeRes.error})`)
      continue
    }
    void tryGit(brainPath, [forceAll ? 'branch' : 'branch', forceAll ? '-D' : '-d', wt.branch])
    removed.push(wt.path)
  }
  return { removed, failed }
}

function gitConflictSummary(brainPath: string): string {
  const status = safeGit(brainPath, ['status', '--short'])
  const conflicts = safeGit(brainPath, ['diff', '--name-only', '--diff-filter=U'])
  if (!conflicts) return 'No merge conflicts detected.'
  const files = conflicts.split('\n').map((line) => line.trim()).filter(Boolean)
  return [
    `Conflicts detected in ${files.length} file(s):`,
    ...files.map((file) => `- ${file}`),
    '',
    'git status --short:',
    status || '(empty)',
  ].join('\n')
}

function latestHandoffRecommendation(brainPath: string, snapshot: Snapshot): string | null {
  const latest = [...snapshot.handoffs].sort((a, b) => b.session_number - a.session_number)[0]
  if (!latest) return null
  try {
    const fullPath = path.join(brainPath, latest.file_path)
    const content = fs.readFileSync(fullPath, 'utf8')
    const match = content.match(/##\s+Recommended Next Steps?\s*\n([\s\S]*?)(?:\n##\s+|\n#\s+|$)/i)
    if (!match?.[1]) return null
    const section = match[1].trim()
    const line = section
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith('<!--'))
    if (!line) return null
    const cleaned = line.replace(/^-+\s*/, '').replace(/^\d+\.\s*/, '').trim()
    if (/^no suggestion available$/i.test(cleaned)) return null
    if (/^no pending suggestion$/i.test(cleaned)) return null
    return cleaned
  } catch {
    return null
  }
}

function clearCompletedMergeTasks(brainPath: string): number {
  const filePath = path.join(brainPath, 'brian', 'commands', 'team-board.md')
  if (!fs.existsSync(filePath)) return 0
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  let removed = 0
  const filtered = lines.filter((line) => {
    const isDoneMerge = /^\s*-\s+\[x\]\s+MERGE:/i.test(line)
    if (isDoneMerge) removed++
    return !isDoneMerge
  })
  if (removed > 0) fs.writeFileSync(filePath, filtered.join('\n'), 'utf8')
  return removed
}

function removeWorktreeByPath(brainPath: string, rawPath: string, force: boolean): { removed: boolean; message: string } {
  const candidate = rawPath.trim()
  if (!candidate) return { removed: false, message: 'empty_worktree_path' }
  void tryGit(brainPath, ['worktree', 'prune'])
  const resolvedCandidate = path.resolve(candidate)
  const entries = parseWorktreeList(brainPath)
  const entry = entries.find((wt) => path.resolve(wt.path) === resolvedCandidate)
  if (!entry) return { removed: false, message: 'worktree_not_found' }
  const removeRes = tryGit(brainPath, ['worktree', 'remove', force ? '--force' : '', entry.path].filter(Boolean))
  if (!removeRes.ok) return { removed: false, message: `remove_failed:${removeRes.error}` }
  if (entry.branch && entry.branch !== 'main') {
    void tryGit(brainPath, ['branch', force ? '-D' : '-d', entry.branch])
  }
  return { removed: true, message: `worktree_removed:${entry.path}` }
}

function collectMergeQueue(snapshot: Snapshot, targetBranch?: string): Array<{ stepId: string; taskIndex: number; text: string }> {
  const queue: Array<{ stepId: string; taskIndex: number; text: string }> = []
  for (const step of snapshot.executionSteps) {
    const tasks = step.tasks_json ?? []
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      if (!task.done && task.text.toUpperCase().startsWith('MERGE:')) {
        if (targetBranch) {
          const mergeMeta = parseMergeInstruction(task.text)
          if (!mergeMeta || mergeMeta.targetBranch !== targetBranch) continue
        }
        queue.push({ stepId: step.id, taskIndex: i, text: task.text })
      }
    }
  }
  return queue
}

function authoritativelyOrderMergeQueue(
  brainPath: string,
  snapshot: Snapshot,
  queue: Array<{ stepId: string; taskIndex: number; text: string }>
): {
  ordered: Array<{ stepId: string; taskIndex: number; text: string }>
  details: Array<{ item: string; status: 'ready' | 'blocked' | 'merged'; reason?: string }>
  recommendedOrder: string[]
} {
  const analyzed = queue.map((item) => {
    const step = snapshot.executionSteps.find((s) => s.id === item.stepId)
    const mergeMeta = parseMergeInstruction(item.text)
    if (!mergeMeta) {
      return { item, status: 'blocked' as const, reason: 'missing_worktree_metadata', score: Number.MAX_SAFE_INTEGER }
    }
    const taskValidation = validateMergeTaskText(item.text)
    if (!taskValidation.ok) {
      return { item, status: 'blocked' as const, reason: taskValidation.reason ?? 'invalid_merge_metadata', score: Number.MAX_SAFE_INTEGER - 1 }
    }
    if (!hasVerificationForStep(step)) {
      return { item, status: 'blocked' as const, reason: 'verification_required', score: Number.MAX_SAFE_INTEGER - 2 }
    }
    const preview = previewMerge(brainPath, mergeMeta.sourceBranch, mergeMeta.targetBranch)
    if (preview.hasConflicts) {
      return { item, status: 'blocked' as const, reason: 'preview_conflict', score: Number.MAX_SAFE_INTEGER - 3 }
    }
    const score = preview.filesChanged.length
    return { item, status: 'ready' as const, reason: undefined, score, mergeMeta, preview }
  })

  const ordered = analyzed
    .slice()
    .sort((a, b) => {
      if (a.status === 'ready' && b.status !== 'ready') return -1
      if (a.status !== 'ready' && b.status === 'ready') return 1
      if (a.score !== b.score) return a.score - b.score
      const aBranch = parseMergeInstruction(a.item.text)?.sourceBranch ?? a.item.text
      const bBranch = parseMergeInstruction(b.item.text)?.sourceBranch ?? b.item.text
      return aBranch.localeCompare(bBranch)
    })
    .map((entry) => entry.item)

  const details = analyzed.map((entry) => ({
    item: entry.item.text,
    status: entry.status,
    reason: entry.reason,
  }))
  const recommendedOrder = ordered
    .map((item) => parseMergeInstruction(item.text)?.sourceBranch)
    .filter((value): value is string => Boolean(value))
  return { ordered, details, recommendedOrder }
}

function hasVerificationForStep(step: ExecutionStep | undefined): boolean {
  return (step?.tasks_json ?? []).some((task) => task.done && task.text.toUpperCase().startsWith('VERIFY:'))
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
}

function selectSuggestionStep(snapshot: Snapshot): ExecutionStep | null {
  const teamSteps = snapshot.executionSteps.filter((s) => s.phase_number === 99)
  const source = teamSteps.length > 0 ? teamSteps : snapshot.executionSteps
  return (
    source.find((s) => s.status === 'in_progress') ??
    source.find((s) => s.status === 'not_started') ??
    source.find((s) => s.status !== 'completed') ??
    source[0] ??
    null
  )
}

function findSuggested(snapshot: Snapshot, brainPath: string, brainId: string): TeamSuggestion | null {
  const activeInitiative = resolveActiveInitiativeContext(brainId, brainPath, snapshot)
  const scopeByInitiative = activeInitiative && activeInitiative.scopedStepIds.size > 0
  const sourceSteps = snapshot.executionSteps.filter((s) => s.phase_number === 99)
  const candidateSets = sourceSteps.length > 0 ? [sourceSteps, snapshot.executionSteps] : [snapshot.executionSteps]

  for (const steps of candidateSets) {
    const scoped = scopeByInitiative
      ? steps.filter((step) => activeInitiative!.scopedStepIds.has(step.id))
      : steps
    if (scopeByInitiative && scoped.length === 0) continue

    for (const step of scoped) {
      const tasks = step.tasks_json ?? []
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]
        if (!task.done && task.text.toUpperCase().startsWith('NEXT:')) {
          return { stepId: step.id, taskIndex: i, label: task.text.replace(/^NEXT:\s*/i, '') }
        }
      }
    }

    const pendingStep = scoped.find((step) => step.status === 'in_progress')
      ?? scoped.find((step) => step.status === 'not_started')
      ?? scoped.find((step) => step.status !== 'completed')
    if (pendingStep) return { stepId: pendingStep.id, label: pendingStep.title }
  }

  return null
}

function ensureSyntheticNextTask(brainPath: string, snapshot: Snapshot, brainId: string): TeamSuggestion | null {
  const targetStep = selectSuggestionStep(snapshot)
  if (!targetStep) return null

  const categories = ['incremental', 'dream_feature', 'refactor', 'bugfix_observer'] as const
  const existingNext = snapshot.executionSteps
    .flatMap((step) => step.tasks_json ?? [])
    .filter((task) => task.text.toUpperCase().startsWith('NEXT:'))
  const category = categories[existingNext.length % categories.length]
  const feature = `${category.replace(/_/g, ' ')}: ${targetStep.title.trim() || `mission iteration ${new Date().toISOString().slice(11, 19)}`}`
  const branchSlug = slugify(feature) || `mission-${Date.now().toString(36)}`
  const lane = targetStep.phase_number === 99 ? category : 'execution'
  const taskText = `NEXT: feature="${feature}" lane=${lane} worktree=feature/${branchSlug} image=pending breaking=none`
  mutateStepFile(brainPath, { stepId: targetStep.id, appendTaskText: taskText })
  return findSuggested(snapshotForBrain(brainPath), brainPath, brainId)
}

export function getSuggestedTask(brainId: string): TeamSuggestion | null {
  const brain = getBrain(brainId)
  if (!brain) throw new Error('Brain not found')
  return findSuggested(snapshotForBrain(brain.path), brain.path, brainId)
}

export function getBrainPathForId(brainId: string): string {
  const brain = getBrain(brainId)
  if (!brain) throw new Error('Brain not found')
  return brain.path
}

export function runTeamMcpCall(
  brainId: string,
  method: string,
  params: Record<string, unknown> = {}
): McpResult {
  const brain = getBrain(brainId)
  if (!brain) throw new Error('Brain not found')
  const brainPath = brain.path

  if (method === 'team.get_squads') {
    const squads = readSquadState(brainPath)
    return {
      message: 'squads_loaded',
      snapshot: snapshotForBrain(brainPath),
      squads: squads.squads,
      activeSquadId: squads.activeSquadId,
      agentCatalog: SQUAD_AGENT_CATALOG,
    }
  }

  if (method === 'team.set_active_squad') {
    const squadId = String(params.squadId ?? '').trim()
    const current = readSquadState(brainPath)
    if (!squadId || !current.squads.some((sq) => sq.id === squadId)) {
      return {
        message: `active_squad_not_found:${squadId || 'empty'}`,
        snapshot: snapshotForBrain(brainPath),
        squads: current.squads,
        activeSquadId: current.activeSquadId,
        agentCatalog: SQUAD_AGENT_CATALOG,
      }
    }
    const next = writeSquadState(brainPath, { ...current, activeSquadId: squadId })
    return {
      message: `active_squad_set:${squadId}`,
      snapshot: snapshotForBrain(brainPath),
      squads: next.squads,
      activeSquadId: next.activeSquadId,
      agentCatalog: SQUAD_AGENT_CATALOG,
    }
  }

  if (method === 'team.upsert_squad') {
    const current = readSquadState(brainPath)
    const providedId = String(params.squadId ?? '').trim()
    const name = String(params.name ?? '').trim() || 'Unnamed Squad'
    const members = Array.isArray(params.memberAgentIds)
      ? params.memberAgentIds.map((id) => String(id).trim()).filter(Boolean)
      : []
    const memberAgentIds = members.length > 0 ? members : ['project-operator']
    const id = providedId || `squad-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || Date.now().toString(36)}`
    const existingIdx = current.squads.findIndex((sq) => sq.id === id)
    const nextSquad: SquadConfig = { id, name, memberAgentIds }
    const nextSquads = existingIdx >= 0
      ? current.squads.map((sq, idx) => (idx === existingIdx ? nextSquad : sq))
      : [...current.squads, nextSquad]
    const next = writeSquadState(brainPath, {
      activeSquadId: id,
      squads: nextSquads,
    })
    return {
      message: existingIdx >= 0 ? `squad_updated:${id}` : `squad_created:${id}`,
      snapshot: snapshotForBrain(brainPath),
      squads: next.squads,
      activeSquadId: next.activeSquadId,
      agentCatalog: SQUAD_AGENT_CATALOG,
    }
  }

  if (method === 'team.get_snapshot') {
    return { message: 'snapshot_loaded', snapshot: snapshotForBrain(brainPath) }
  }

  if (method === 'team.get_live_demo_gate') {
    return {
      message: 'live_demo_gate_loaded',
      snapshot: snapshotForBrain(brainPath),
      liveDemoGate: readLiveDemoGateState(brainPath),
    }
  }

  if (method === 'team.set_live_demo_gate') {
    const ready = Boolean(params.ready)
    const actor = typeof params.actor === 'string' && params.actor.trim() ? params.actor.trim() : 'human-operator'
    const next = writeLiveDemoGateState(brainPath, {
      ready,
      acknowledgedAt: ready ? new Date().toISOString() : null,
      actor: ready ? actor : null,
    })
    return {
      message: `live_demo_gate_set:${ready ? 'ready' : 'waiting'}`,
      snapshot: snapshotForBrain(brainPath),
      liveDemoGate: next,
    }
  }

  if (method === 'team.get_policy_status') {
    const methods = [
      'team.set_live_demo_gate',
      'team.start_next_task',
      'team.run_verification_suite',
      'team.record_human_verification',
      'team.reject_human_verification',
      'team.merge_queue_dry_run',
      'team.merge_queue_execute',
      'team.merge_queue_ship',
      'team.capture_failure_bundle',
    ]
    const status = policyStatus(brainPath, methods)
    fs.mkdirSync(path.join(brainPath, '.brian'), { recursive: true })
    const verificationLogPath = path.join(brainPath, '.brian', 'verification-runs.ndjson')
    if (!fs.existsSync(verificationLogPath)) fs.writeFileSync(verificationLogPath, '', 'utf8')
    return {
      message: status.ok ? 'policy_status:ok' : 'policy_status:blocked',
      snapshot: snapshotForBrain(brainPath),
      policy: {
        ok: status.ok,
        missingMcpMethods: status.missingMcpMethods,
        missingSkills: status.missingSkills,
        missingRules: status.missingRules,
        version: status.policy.version,
      },
    }
  }

  if (method === 'team.run_verification_suite') {
    const feature = String(params.feature ?? '').trim()
    const status = policyStatus(brainPath, [
      'team.set_live_demo_gate',
      'team.start_next_task',
      'team.run_verification_suite',
      'team.record_human_verification',
      'team.reject_human_verification',
      'team.merge_queue_dry_run',
      'team.merge_queue_execute',
      'team.merge_queue_ship',
      'team.capture_failure_bundle',
    ])
    if (!status.ok) {
      return {
        message: 'verification_suite:blocked:policy_requirements_missing',
        snapshot: snapshotForBrain(brainPath),
        policy: {
          ok: false,
          missingMcpMethods: status.missingMcpMethods,
          missingSkills: status.missingSkills,
          missingRules: status.missingRules,
          version: status.policy.version,
        },
      }
    }
    const run = runVerificationSuite(brainPath, process.cwd(), feature)
    return {
      message: run.ok ? `verification_suite:passed:${run.id}` : `verification_suite:failed:${run.id}`,
      snapshot: snapshotForBrain(brainPath),
      verification: {
        id: run.id,
        at: run.at,
        ok: run.ok,
        touchedCoveragePct: run.touchedCoveragePct,
        e2eFeatures: run.e2eFeatures,
        gates: run.gates.map((gate) => ({ name: gate.name, ok: gate.ok, retried: gate.retried })),
      },
    }
  }

  if (method === 'team.capture_failure_bundle') {
    const actor = String(params.actor ?? 'project-operator')
    const reason = String(params.reason ?? '').trim() || 'unspecified_failure'
    const stage = String(params.stage ?? 'execution')
    const details = String(params.details ?? '').trim() || reason
    const branch = gitRepoState(brainPath).branch
    const runId = typeof params.runId === 'string' && params.runId.trim() ? params.runId.trim() : undefined
    const bundle = captureFailureBundle(brainPath, { actor, reason, stage, details, branch, runId })
    return {
      message: `failure_bundle_captured:${bundle.id}`,
      snapshot: snapshotForBrain(brainPath),
      failureBundle: bundle,
    }
  }

  if (method === 'team.get_repo_state') {
    return { message: 'repo_state_loaded', snapshot: snapshotForBrain(brainPath), repo: gitRepoState(brainPath) }
  }

  if (method === 'team.clear_merged_queue') {
    const removed = clearCompletedMergeTasks(brainPath)
    return {
      message: `merged_queue_cleared:${removed}`,
      snapshot: snapshotForBrain(brainPath),
      repo: gitRepoState(brainPath),
    }
  }

  if (method === 'team.cleanup_worktrees') {
    const force = Boolean(params.force)
    const result = cleanupResolvedWorktrees(brainPath, force)
    return {
      message: `worktree_cleanup:${force ? 'force' : 'safe'}:removed=${result.removed.length}:failed=${result.failed.length}`,
      snapshot: snapshotForBrain(brainPath),
      repo: gitRepoState(brainPath),
      conflictSummary: result.failed.length > 0 ? result.failed.join('\n') : undefined,
    }
  }

  if (method === 'team.remove_worktree') {
    const worktreePath = String(params.path ?? '')
    const force = params.force !== false
    const removed = removeWorktreeByPath(brainPath, worktreePath, force)
    return {
      message: removed.message,
      snapshot: snapshotForBrain(brainPath),
      repo: gitRepoState(brainPath),
    }
  }

  if (method === 'team.get_suggested') {
    const snapshot = snapshotForBrain(brainPath)
    const ensured = findSuggested(snapshot, brainPath, brainId)
    const suggested = ensured?.label ?? ''
    return { message: 'suggested_loaded', snapshot, suggested }
  }

  if (method === 'team.get_conflict_summary') {
    return {
      message: 'conflict_summary_loaded',
      snapshot: snapshotForBrain(brainPath),
      repo: gitRepoState(brainPath),
      conflictSummary: gitConflictSummary(brainPath),
    }
  }

  if (method === 'team.set_step_status') {
    const stepId = String(params.stepId ?? '')
    const status = String(params.status ?? '') as StepStatus
    mutateStepFile(brainPath, { stepId, status })
    return { message: `step_status_set:${stepId}:${status}`, snapshot: snapshotForBrain(brainPath) }
  }

  if (method === 'team.toggle_task') {
    const stepId = String(params.stepId ?? '')
    const taskIndex = Number(params.taskIndex ?? -1)
    const step = snapshotForBrain(brainPath).executionSteps.find((s) => s.id === stepId)
    const currentDone = step?.tasks_json?.[taskIndex]?.done ?? false
    const taskDone = typeof params.taskDone === 'boolean' ? Boolean(params.taskDone) : !currentDone
    mutateStepFile(brainPath, { stepId, taskIndex, taskDone })
    return { message: `task_toggled:${stepId}:${taskIndex}:${taskDone ? 'done' : 'open'}`, snapshot: snapshotForBrain(brainPath) }
  }

  if (method === 'team.add_task') {
    const stepId = String(params.stepId ?? '')
    const prefix = String(params.prefix ?? 'NOTE:')
    const text = String(params.text ?? '').trim()
    mutateStepFile(brainPath, { stepId, appendTaskText: `${prefix} ${text}`.trim() })
    return { message: `task_added:${stepId}:${prefix}`, snapshot: snapshotForBrain(brainPath) }
  }

  if (method === 'team.reorder_task') {
    const stepId = String(params.stepId ?? '')
    const fromIndex = Number(params.fromIndex ?? -1)
    const toIndex = Number(params.toIndex ?? -1)
    mutateStepFile(brainPath, { stepId, moveTaskFromIndex: fromIndex, moveTaskToIndex: toIndex })
    return { message: `task_reordered:${stepId}:${fromIndex}->${toIndex}`, snapshot: snapshotForBrain(brainPath) }
  }

  if (method === 'team.record_human_verification') {
    const gate = readLiveDemoGateState(brainPath)
    if (!gate.ready) {
      return {
        message: 'verification_blocked:live_demo_gate_not_ready',
        snapshot: snapshotForBrain(brainPath),
        liveDemoGate: gate,
      }
    }
    const verificationRun = latestVerificationRun(brainPath)
    if (!verificationRun || !verificationRun.ok) {
      return {
        message: 'verification_blocked:verification_suite_not_green',
        snapshot: snapshotForBrain(brainPath),
        verification: verificationRun ? {
          id: verificationRun.id,
          at: verificationRun.at,
          ok: verificationRun.ok,
          touchedCoveragePct: verificationRun.touchedCoveragePct,
          e2eFeatures: verificationRun.e2eFeatures,
          gates: verificationRun.gates.map((gate) => ({ name: gate.name, ok: gate.ok, retried: gate.retried })),
        } : undefined,
      }
    }
    if (verificationRun.touchedCoveragePct < 100) {
      return {
        message: 'verification_blocked:coverage_not_100',
        snapshot: snapshotForBrain(brainPath),
      }
    }
    if (verificationRun.e2eFeatures.length === 0) {
      return {
        message: 'verification_blocked:e2e_feature_evidence_missing',
        snapshot: snapshotForBrain(brainPath),
      }
    }
    const current = snapshotForBrain(brainPath)
    const fallbackStepId =
      current.executionSteps.find((s) => s.phase_number === 99)?.id ??
      current.executionSteps.find((s) => s.status === 'in_progress')?.id ??
      current.executionSteps[0]?.id
    const stepId = String(params.stepId ?? fallbackStepId ?? '')
    if (!stepId) throw new Error('No step available for verification')

    const feature = String(params.feature ?? '').trim()
    const verifyText = feature
      ? `VERIFY: Human verified feature "${feature}" before merge`
      : 'VERIFY: Human verified feature behavior and acceptance criteria before merge'

    mutateStepFile(brainPath, { stepId, appendTaskText: verifyText })
    const afterAppend = snapshotForBrain(brainPath)
    const step = afterAppend.executionSteps.find((s) => s.id === stepId)
    const verifyIdx = step?.tasks_json?.findIndex((t) => t.text.toUpperCase().startsWith('VERIFY:') && !t.done)
    if (typeof verifyIdx === 'number' && verifyIdx >= 0) {
      mutateStepFile(brainPath, { stepId, taskIndex: verifyIdx, taskDone: true })
    }
    return { message: `human_verification_recorded:${stepId}`, snapshot: snapshotForBrain(brainPath) }
  }

  if (method === 'team.reject_human_verification') {
    const current = snapshotForBrain(brainPath)
    const fallbackStepId =
      current.executionSteps.find((s) => s.phase_number === 99)?.id ??
      current.executionSteps.find((s) => s.status === 'in_progress')?.id ??
      current.executionSteps[0]?.id
    const stepId = String(params.stepId ?? fallbackStepId ?? '')
    if (!stepId) throw new Error('No step available for rejection')

    const feature = String(params.feature ?? '').trim()
    const reason = String(params.reason ?? '').trim() || 'human_rejected_without_reason'
    const blockerText = feature
      ? `BLOCKER: Human rejected feature "${feature}" at verification gate: ${reason}`
      : `BLOCKER: Human rejected verification at gate: ${reason}`
    mutateStepFile(brainPath, { stepId, appendTaskText: blockerText })
    mutateStepFile(
      brainPath,
      { stepId, appendTaskText: `NEXT: remediation="${reason}" lane=bugfix_observer worktree=feature/remediate-${slugify(reason)} image=pending breaking=none` }
    )
    mutateStepFile(brainPath, { stepId, status: 'blocked' })
    const bundle = captureFailureBundle(brainPath, {
      actor: 'human-operator',
      reason,
      stage: 'verification',
      branch: gitRepoState(brainPath).branch,
      details: feature ? `Verification rejected for feature "${feature}"` : 'Verification rejected',
    })
    const nextGate = writeLiveDemoGateState(brainPath, { ready: false, acknowledgedAt: null, actor: null })
    return {
      message: `human_verification_rejected:${stepId}`,
      snapshot: snapshotForBrain(brainPath),
      liveDemoGate: nextGate,
      failureBundle: bundle,
    }
  }

  if (method === 'team.merge_item') {
    const stepId = String(params.stepId ?? '')
    const taskIndex = Number(params.taskIndex ?? -1)
    const current = snapshotForBrain(brainPath)
    const targetStep = current.executionSteps.find((step) => step.id === stepId)
    const taskText = targetStep?.tasks_json?.[taskIndex]?.text ?? ''
    if (!taskText.toUpperCase().startsWith('MERGE:')) {
      throw new Error('Target task is not a MERGE item')
    }
    const mergeMeta = parseMergeInstruction(taskText)
    if (!mergeMeta) {
      return {
        message: `merge_blocked:missing_worktree_metadata:${stepId}`,
        snapshot: current,
        repo: gitRepoState(brainPath),
      }
    }
    const taskValidation = validateMergeTaskText(taskText)
    if (!taskValidation.ok) {
      return {
        message: `merge_blocked:${taskValidation.reason}:${stepId}`,
        snapshot: current,
        repo: gitRepoState(brainPath),
      }
    }

    const hasVerification = (targetStep?.tasks_json ?? []).some(
      (task) => task.done && task.text.toUpperCase().startsWith('VERIFY:')
    )
    if (!hasVerification) {
      return {
        message: `merge_blocked:verification_required:${stepId}`,
        snapshot: current,
        repo: gitRepoState(brainPath),
      }
    }

    const repo = gitRepoState(brainPath)
    if (repo.hasConflicts) {
      return {
        message: `merge_blocked:conflicts:${stepId}`,
        snapshot: current,
        repo,
        conflictSummary: gitConflictSummary(brainPath),
      }
    }
    const stashLabel = `team-merge-${stepId}-${taskIndex}-${Date.now()}`
    const stashed = stashIfDirty(brainPath, stashLabel)
    if (stashed.error) {
      return {
        message: `merge_blocked:dirty_worktree_stash_failed:${stepId}`,
        snapshot: current,
        repo,
        conflictSummary: stashed.error,
      }
    }

    const preview = previewMerge(brainPath, mergeMeta.sourceBranch, mergeMeta.targetBranch)
    if (preview.hasConflicts) {
      return {
        message: `merge_blocked:preview_conflict:${stepId}`,
        snapshot: current,
        repo,
        mergePreview: {
          sourceBranch: mergeMeta.sourceBranch,
          targetBranch: mergeMeta.targetBranch,
          filesChanged: preview.filesChanged,
          hasConflicts: true,
          summary: preview.summary,
        },
      }
    }

    const originalBranch = safeGit(brainPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (!originalBranch) {
      return {
        message: `merge_blocked:unknown_branch:${stepId}`,
        snapshot: current,
        repo,
      }
    }
    if (originalBranch !== mergeMeta.targetBranch) {
      const checkoutTarget = tryGit(brainPath, ['checkout', mergeMeta.targetBranch])
      if (!checkoutTarget.ok) {
        return {
          message: `merge_blocked:checkout_target_failed:${stepId}`,
          snapshot: current,
          repo: gitRepoState(brainPath),
          conflictSummary: checkoutTarget.error,
        }
      }
    }
    const mergeRes = tryGit(brainPath, [
      'merge',
      '--no-ff',
      mergeMeta.sourceBranch,
      '-m',
      `merge: ${mergeMeta.sourceBranch} -> ${mergeMeta.targetBranch} (team task ${stepId}:${taskIndex})`,
    ])
    if (!mergeRes.ok) {
      void tryGit(brainPath, ['merge', '--abort'])
      if (originalBranch !== mergeMeta.targetBranch) void tryGit(brainPath, ['checkout', originalBranch])
      if (stashed.didStash && stashed.stashRef) {
        const restored = restoreStash(brainPath, stashed.stashRef)
        if (!restored.ok) {
          return {
            message: `merge_blocked:merge_command_failed:${stepId}`,
            snapshot: current,
            repo: gitRepoState(brainPath),
            conflictSummary: `${mergeRes.error}\n\nstash_restore_failed:\n${restored.error ?? 'unknown'}`,
          }
        }
      }
      return {
        message: `merge_blocked:merge_command_failed:${stepId}`,
        snapshot: current,
        repo: gitRepoState(brainPath),
        conflictSummary: mergeRes.error,
      }
    }
    if (originalBranch !== mergeMeta.targetBranch) void tryGit(brainPath, ['checkout', originalBranch])
    if (stashed.didStash && stashed.stashRef) {
      const restored = restoreStash(brainPath, stashed.stashRef)
      if (!restored.ok) {
        return {
          message: `merge_blocked:stash_restore_failed:${stepId}`,
          snapshot: snapshotForBrain(brainPath),
          repo: gitRepoState(brainPath),
          conflictSummary: restored.error,
          mergePreview: {
            sourceBranch: mergeMeta.sourceBranch,
            targetBranch: mergeMeta.targetBranch,
            filesChanged: preview.filesChanged,
            hasConflicts: false,
            summary: `${preview.summary}\n\nmerge_commit_created_but_stash_restore_failed`,
          },
        }
      }
    }

    mutateStepFile(brainPath, { stepId, taskIndex, taskDone: true })
    return {
      message: `merge_marked:${stepId}:${taskIndex}`,
      snapshot: snapshotForBrain(brainPath),
      repo: gitRepoState(brainPath),
      mergePreview: {
        sourceBranch: mergeMeta.sourceBranch,
        targetBranch: mergeMeta.targetBranch,
        filesChanged: preview.filesChanged,
        hasConflicts: false,
        summary: preview.summary,
      },
    }
  }

  if (method === 'team.preview_merge_item') {
    const stepId = String(params.stepId ?? '')
    const taskIndex = Number(params.taskIndex ?? -1)
    const current = snapshotForBrain(brainPath)
    const targetStep = current.executionSteps.find((step) => step.id === stepId)
    const taskText = targetStep?.tasks_json?.[taskIndex]?.text ?? ''
    if (!taskText.toUpperCase().startsWith('MERGE:')) {
      throw new Error('Target task is not a MERGE item')
    }
    const mergeMeta = parseMergeInstruction(taskText)
    if (!mergeMeta) {
      return {
        message: `merge_preview_blocked:missing_branch_metadata:${stepId}`,
        snapshot: current,
        repo: gitRepoState(brainPath),
      }
    }
    const preview = previewMerge(brainPath, mergeMeta.sourceBranch, mergeMeta.targetBranch)
    return {
      message: `merge_preview_loaded:${stepId}:${taskIndex}`,
      snapshot: current,
      repo: gitRepoState(brainPath),
      mergePreview: {
        sourceBranch: mergeMeta.sourceBranch,
        targetBranch: mergeMeta.targetBranch,
        filesChanged: preview.filesChanged,
        hasConflicts: preview.hasConflicts,
        summary: preview.summary,
      },
    }
  }

  if (method === 'team.merge_queue_dry_run') {
    const current = snapshotForBrain(brainPath)
    const initiativeContext = resolveActiveInitiativeContext(brainId, brainPath, current)
    const queue = collectMergeQueue(current, initiativeContext?.missionBranch)
    const ordered = authoritativelyOrderMergeQueue(brainPath, current, queue)
    const details = ordered.details
    const blockedAt = details.find((d) => d.status === 'blocked')?.item
    return {
      message: blockedAt ? 'merge_queue_dry_run:blocked' : 'merge_queue_dry_run:ready',
      snapshot: current,
      repo: gitRepoState(brainPath),
      mergeQueue: {
        total: queue.length,
        merged: 0,
        blockedAt,
        details,
        recommendedOrder: ordered.recommendedOrder,
      },
    }
  }

  if (method === 'team.merge_queue_execute') {
    const initial = snapshotForBrain(brainPath)
    const initiativeContext = resolveActiveInitiativeContext(brainId, brainPath, initial)
    const queue = collectMergeQueue(initial, initiativeContext?.missionBranch)
    const ordered = authoritativelyOrderMergeQueue(brainPath, initial, queue)
    const blockedAtPrecheck = ordered.details.find((d) => d.status === 'blocked')
    if (blockedAtPrecheck) {
      return {
        message: `merge_queue_execute:blocked:${blockedAtPrecheck.reason ?? 'blocked'}`,
        snapshot: initial,
        repo: gitRepoState(brainPath),
        mergeQueue: {
          total: queue.length,
          merged: 0,
          blockedAt: blockedAtPrecheck.item,
          details: ordered.details,
          recommendedOrder: ordered.recommendedOrder,
        },
      }
    }
    const details: Array<{ item: string; status: 'ready' | 'blocked' | 'merged'; reason?: string }> = []
    let merged = 0

    for (const item of ordered.ordered) {
      const result = runTeamMcpCall(brainId, 'team.merge_item', { stepId: item.stepId, taskIndex: item.taskIndex })
      if (result.message.startsWith('merge_marked:')) {
        merged++
        details.push({ item: item.text, status: 'merged' })
        continue
      }
      const reason = result.message.replace(/^merge_blocked:/, '') || 'blocked'
      details.push({ item: item.text, status: 'blocked', reason })
      return {
        message: `merge_queue_execute:blocked:${reason}`,
        snapshot: result.snapshot,
        repo: result.repo ?? gitRepoState(brainPath),
        conflictSummary: result.conflictSummary,
        mergePreview: result.mergePreview,
        mergeQueue: {
          total: queue.length,
          merged,
          blockedAt: item.text,
          details,
          recommendedOrder: ordered.recommendedOrder,
        },
      }
    }

    const removed = clearCompletedMergeTasks(brainPath)
    const finalSnapshot = snapshotForBrain(brainPath)
    return {
      message: `merge_queue_execute:completed:merged=${merged}:cleared=${removed}`,
      snapshot: finalSnapshot,
      repo: gitRepoState(brainPath),
      mergeQueue: {
        total: queue.length,
        merged,
        details,
        recommendedOrder: ordered.recommendedOrder,
      },
    }
  }

  if (method === 'team.merge_queue_ship') {
    const current = snapshotForBrain(brainPath)
    const policy = policyStatus(brainPath, [
      'team.set_live_demo_gate',
      'team.start_next_task',
      'team.run_verification_suite',
      'team.record_human_verification',
      'team.reject_human_verification',
      'team.merge_queue_dry_run',
      'team.merge_queue_execute',
      'team.merge_queue_ship',
      'team.capture_failure_bundle',
    ])
    if (!policy.ok) {
      return {
        message: 'ship_blocked:policy_requirements_missing',
        snapshot: current,
        repo: gitRepoState(brainPath),
        policy: {
          ok: false,
          missingMcpMethods: policy.missingMcpMethods,
          missingSkills: policy.missingSkills,
          missingRules: policy.missingRules,
          version: policy.policy.version,
        },
      }
    }
    const initiativeContext = resolveActiveInitiativeContext(brainId, brainPath, current)
    if (!initiativeContext) {
      return {
        message: 'ship_blocked:no_active_initiative',
        snapshot: current,
        repo: gitRepoState(brainPath),
      }
    }
    ensureLocalBranchExists(brainPath, initiativeContext.missionBranch)

    const preRepo = gitRepoState(brainPath)
    if (preRepo.hardBlockers.length > 0) {
      return {
        message: `ship_blocked:hard_blockers:${preRepo.hardBlockers.length}`,
        snapshot: current,
        repo: preRepo,
      }
    }

    const dryRun = runTeamMcpCall(brainId, 'team.merge_queue_dry_run', {})
    const dryBlocked = dryRun.mergeQueue?.details?.find((item) => item.status === 'blocked')
    if (dryBlocked) {
      return {
        message: `ship_blocked:dry_run:${dryBlocked.reason ?? 'blocked'}`,
        snapshot: dryRun.snapshot,
        repo: dryRun.repo ?? gitRepoState(brainPath),
        mergeQueue: dryRun.mergeQueue,
      }
    }

    const merged = runTeamMcpCall(brainId, 'team.merge_queue_execute', {})
    if (!merged.message.startsWith('merge_queue_execute:completed')) {
      return {
        message: `ship_blocked:${merged.message}`,
        snapshot: merged.snapshot,
        repo: merged.repo ?? gitRepoState(brainPath),
        conflictSummary: merged.conflictSummary,
        mergePreview: merged.mergePreview,
        mergeQueue: merged.mergeQueue,
      }
    }

    const shipPath = worktreePathForBranch(brainPath, 'main') ?? (preRepo.branch === 'main' ? brainPath : null)
    if (!shipPath) {
      return {
        message: 'ship_blocked:main_worktree_not_found',
        snapshot: merged.snapshot,
        repo: gitRepoState(brainPath),
        mergeQueue: merged.mergeQueue,
      }
    }
    const stashed = stashIfDirty(shipPath, `team-ship-${initiativeContext.id}-${Date.now()}`)
    if (stashed.error) {
      return {
        message: 'ship_blocked:dirty_worktree_stash_failed',
        snapshot: merged.snapshot,
        repo: gitRepoState(brainPath),
        mergeQueue: merged.mergeQueue,
        conflictSummary: stashed.error,
      }
    }

    const mergeMissionToMain = tryGit(shipPath, [
      'merge',
      '--no-ff',
      initiativeContext.missionBranch,
      '-m',
      `merge: ${initiativeContext.missionBranch} -> main (initiative ${initiativeContext.id})`,
    ])
    if (!mergeMissionToMain.ok) {
      void tryGit(shipPath, ['merge', '--abort'])
      if (stashed.didStash && stashed.stashRef) void restoreStash(shipPath, stashed.stashRef)
      return {
        message: 'ship_blocked:mission_to_main_merge_failed',
        snapshot: merged.snapshot,
        repo: gitRepoState(brainPath),
        mergeQueue: merged.mergeQueue,
        conflictSummary: mergeMissionToMain.error,
      }
    }

    const push = tryGit(shipPath, ['push', 'origin', 'main'])
    if (!push.ok) {
      if (stashed.didStash && stashed.stashRef) void restoreStash(shipPath, stashed.stashRef)
      return {
        message: 'ship_blocked:push_failed',
        snapshot: merged.snapshot,
        repo: gitRepoState(brainPath),
        mergeQueue: merged.mergeQueue,
        conflictSummary: push.error,
        ship: {
          pushed: false,
          remote: 'origin',
          branch: 'main',
          commitShas: [],
          message: push.error || 'git push failed',
          at: new Date().toISOString(),
        },
      }
    }
    const shippedHead = safeGit(shipPath, ['rev-parse', 'HEAD'])
    if (stashed.didStash && stashed.stashRef) {
      const restored = restoreStash(shipPath, stashed.stashRef)
      if (!restored.ok) {
        return {
          message: 'ship_blocked:stash_restore_failed',
          snapshot: merged.snapshot,
          repo: gitRepoState(brainPath),
          mergeQueue: merged.mergeQueue,
          conflictSummary: restored.error,
        }
      }
    }

    return {
      message: `ship_completed:${shippedHead || 'unknown_sha'}`,
      snapshot: merged.snapshot,
      repo: gitRepoState(brainPath),
      mergeQueue: merged.mergeQueue,
      ship: {
        pushed: true,
        remote: 'origin',
        branch: 'main',
        commitShas: shippedHead ? [shippedHead] : [],
        message: 'Merged queue and pushed to origin/main',
        at: new Date().toISOString(),
      },
    }
  }

  if (method === 'team.trigger_suggested') {
    const current = snapshotForBrain(brainPath)
    let suggestion = findSuggested(current, brainPath, brainId)
    if (!suggestion) {
      return { message: 'no_suggestion_available', snapshot: current }
    }

    const latest = snapshotForBrain(brainPath)
    const initiativeContext = resolveActiveInitiativeContext(brainId, brainPath, latest)
    const target = latest.executionSteps.find((s) => s.id === suggestion.stepId)
    if (target?.status === 'not_started') {
      mutateStepFile(brainPath, { stepId: suggestion.stepId, status: 'in_progress' })
    }
    const sourceTaskText =
      typeof suggestion.taskIndex === 'number'
        ? target?.tasks_json?.[suggestion.taskIndex]?.text ?? ''
        : ''
    if (typeof suggestion.taskIndex === 'number') {
      mutateStepFile(brainPath, { stepId: suggestion.stepId, taskIndex: suggestion.taskIndex, taskDone: true })
    }
    const feature = parseTaskMetadata(sourceTaskText, 'feature') ?? suggestion.label
    const image = parseTaskMetadata(sourceTaskText, 'image') ?? 'pending'
    const breaking = parseTaskMetadata(sourceTaskText, 'breaking') ?? 'none'
    let queueBranch = parseTaskMetadata(sourceTaskText, 'branch') ?? parseTaskMetadata(sourceTaskText, 'worktree')
    if (!queueBranch) {
      const derivedBranchSlug = slugify(`${initiativeContext?.id ?? 'mission'}-${feature}`) || `task-${Date.now().toString(36)}`
      queueBranch = `feature/${derivedBranchSlug}`
      mutateStepFile(
        brainPath,
        {
          stepId: suggestion.stepId,
          appendTaskText: `NEXT: feature="${feature}" lane=execution worktree=${queueBranch} image=${image} breaking=${breaking}${initiativeContext ? ` initiative_id=${initiativeContext.id}` : ''}`,
        }
      )
      const refreshed = snapshotForBrain(brainPath).executionSteps.find((s) => s.id === suggestion.stepId)
      const syntheticNextIndex = (refreshed?.tasks_json ?? []).findIndex(
        (task) => !task.done && task.text.toUpperCase().startsWith('NEXT:') && (parseTaskMetadata(task.text, 'worktree') ?? parseTaskMetadata(task.text, 'branch')) === queueBranch
      )
      if (syntheticNextIndex >= 0) {
        mutateStepFile(brainPath, { stepId: suggestion.stepId, taskIndex: syntheticNextIndex, taskDone: true })
      }
    }
    if (queueBranch) {
      ensureLocalBranchExists(brainPath, queueBranch)
      const mergeTargetBranch = initiativeContext?.missionBranch ?? 'main'
      ensureLocalBranchExists(brainPath, mergeTargetBranch)
      const afterToggle = snapshotForBrain(brainPath)
      const stepAfterToggle = afterToggle.executionSteps.find((s) => s.id === suggestion.stepId)
      const hasMergeTask = (stepAfterToggle?.tasks_json ?? []).some(
        (task) =>
          !task.done &&
          task.text.toUpperCase().startsWith('MERGE:') &&
          (parseTaskMetadata(task.text, 'branch') ?? parseTaskMetadata(task.text, 'worktree')) === queueBranch
      )
      if (!hasMergeTask) {
        mutateStepFile(
          brainPath,
          {
            stepId: suggestion.stepId,
            appendTaskText: `MERGE: feature="${feature}" branch=${queueBranch} -> ${mergeTargetBranch} image=${image} breaking=${breaking}${initiativeContext ? ` initiative_id=${initiativeContext.id}` : ''}`,
          }
        )
      }
    }
    mutateStepFile(brainPath, {
      stepId: suggestion.stepId,
      appendTaskText: `NOTE: Triggered from MCP command center at ${new Date().toISOString()}`,
    })
    return { message: `suggestion_triggered:${suggestion.label}`, snapshot: snapshotForBrain(brainPath) }
  }

  throw new Error(`Unknown MCP method: ${method}`)
}
