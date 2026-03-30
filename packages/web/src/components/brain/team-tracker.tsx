'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckSquare, GitBranch, Pause, Play, Square } from 'lucide-react'
import { useMcpTeam } from '@/hooks/use-mcp-team'

interface ExecutionStep {
  id: string
  phase_number: number
  step_number: number
  title: string
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked'
  tasks_json: Array<{ done: boolean; text: string }> | null
}

interface Handoff {
  id: string
  session_number: number
  date: string
  created_at: string | null
  duration_seconds: number | null
  summary: string
  file_path: string
}

type RepoState = {
  branch: string
  hasConflicts: boolean
  conflictFiles: string[]
  isDirty: boolean
  canStartNextWork: boolean
  unresolvedWorktrees: string[]
  unresolvedWorktreeDetails: Array<{ path: string; branch: string }>
  hardBlockers: Array<{ code: string; message: string; resolution: string }>
}

type SnapshotResult = {
  message: string
  snapshot: {
    executionSteps: ExecutionStep[]
    handoffs: Handoff[]
  }
  suggested?: string
  run?: {
    id: string
    status: 'running' | 'awaiting_approval' | 'blocked' | 'completed' | 'failed'
    startedAt: string
    endedAt?: string
    label: string
    actor?: string
    blockerReason?: string
  }
  repo?: RepoState
  conflictSummary?: string
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
  observer?: {
    active: boolean
    ticks: number
    addedTasks: number
    startedAt: string | null
  }
  squads?: Array<{ id: string; name: string; memberAgentIds: string[] }>
  activeSquadId?: string
  agentCatalog?: Array<{ id: string; label: string }>
}

function parseMergeBranchMetadata(text: string): { sourceBranch: string; targetBranch: string } | null {
  const match = text.match(/(?:branch|worktree)\s*=\s*([^\s]+)\s*->\s*([^\s]+)/i) ?? text.match(/(?:branch|worktree)\s*=\s*([^\s]+)/i)
  if (!match) return null
  return { sourceBranch: match[1], targetBranch: match[2] ?? 'main' }
}

function parseTaskMeta(text: string, key: string): string | null {
  const match = text.match(new RegExp(`${key}\\s*=\\s*(\"[^\"]+\"|[^\\s]+)`, 'i'))
  if (!match?.[1]) return null
  return match[1].replace(/^"|"$/g, '').trim()
}

function tagged(steps: ExecutionStep[], prefix: 'BLOCKER:' | 'NEXT:' | 'MERGE:') {
  const out: Array<{ stepId: string; taskIndex: number; done: boolean; text: string }> = []
  for (const step of steps) {
    for (const [taskIndex, task] of (step.tasks_json ?? []).entries()) {
      if (task.text.toUpperCase().startsWith(prefix)) {
        out.push({ stepId: step.id, taskIndex, done: task.done, text: task.text.replace(new RegExp(`^${prefix}\\s*`, 'i'), '') })
      }
    }
  }
  return out
}

function cleanLabel(text: string, prefix: 'BLOCKER:' | 'NEXT:' | 'MERGE:' | 'VERIFY:') {
  return text.replace(new RegExp(`^${prefix}\\s*`, 'i'), '')
}

function statusPill(status: 'working' | 'awaiting_approval' | 'blocked' | 'idle') {
  if (status === 'working') return 'bg-[#E8A830]/15 text-[#E8A830]'
  if (status === 'awaiting_approval') return 'bg-[#4A9FD9]/15 text-[#4A9FD9]'
  if (status === 'blocked') return 'bg-[#D95B5B]/15 text-[#D95B5B]'
  return 'bg-text/10 text-text-muted'
}

export default function TeamTracker({
  brainId,
  executionSteps,
  handoffs,
  refreshSnapshot,
}: {
  brainId: string
  executionSteps: ExecutionStep[]
  handoffs: Handoff[]
  refreshSnapshot: () => Promise<void>
}) {
  const [steps, setSteps] = useState(executionSteps)
  const [handoffList, setHandoffList] = useState(handoffs)
  const [busy, setBusy] = useState<string | null>(null)
  const [runState, setRunState] = useState<SnapshotResult['run'] | null>(null)
  const [runActive, setRunActive] = useState(false)
  const [repoState, setRepoState] = useState<RepoState | null>(null)
  const [selectedFeature, setSelectedFeature] = useState('')
  const [conflictSummary, setConflictSummary] = useState('')
  const [selectedHandoffPath, setSelectedHandoffPath] = useState('')
  const [selectedHandoffContent, setSelectedHandoffContent] = useState('')
  const [serverSuggested, setServerSuggested] = useState('')
  const [mergePreviewText, setMergePreviewText] = useState('')
  const [mergeQueueText, setMergeQueueText] = useState('')
  const [dragMerge, setDragMerge] = useState<{ stepId: string; taskIndex: number } | null>(null)
  const [observer, setObserver] = useState<SnapshotResult['observer'] | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [hasSeenConnected, setHasSeenConnected] = useState(false)
  const [connectionGraceExpired, setConnectionGraceExpired] = useState(false)
  const [lastUpdateAt, setLastUpdateAt] = useState<string>('')
  const [squads, setSquads] = useState<Array<{ id: string; name: string; memberAgentIds: string[] }>>([])
  const [activeSquadId, setActiveSquadId] = useState('')
  const { connected, events, call } = useMcpTeam(brainId)

  useEffect(() => setSteps(executionSteps), [executionSteps])
  useEffect(() => setHandoffList(handoffs), [handoffs])
  useEffect(() => {
    const timer = window.setTimeout(() => setConnectionGraceExpired(true), 8000)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (connected) setHasSeenConnected(true)
  }, [connected])

  useEffect(() => {
    const refreshRuntimeState = async () => {
      const [snapshotRes, runRes, repoRes, suggestionRes, squadsRes] = await Promise.all([
        call<{ snapshot: SnapshotResult['snapshot'] }>('team.get_snapshot'),
        call<{ run: SnapshotResult['run']; active: boolean; observer?: SnapshotResult['observer'] }>('team.get_run_state'),
        call<{ repo: RepoState }>('team.get_repo_state'),
        call<{ suggested: string }>('team.get_suggested'),
        call<{ squads: Array<{ id: string; name: string; memberAgentIds: string[] }>; activeSquadId: string; agentCatalog: Array<{ id: string; label: string }> }>('team.get_squads'),
      ])
      if (snapshotRes.ok && snapshotRes.result?.snapshot) {
        setSteps(snapshotRes.result.snapshot.executionSteps)
        setHandoffList(snapshotRes.result.snapshot.handoffs)
      }
      if (runRes.ok && runRes.result) {
        setRunState(runRes.result.run ?? null)
        setRunActive(Boolean(runRes.result.active))
        if (runRes.result.observer) setObserver(runRes.result.observer)
      }
      if (repoRes.ok && repoRes.result?.repo) setRepoState(repoRes.result.repo)
      if (suggestionRes.ok && suggestionRes.result) setServerSuggested(suggestionRes.result.suggested ?? '')
      if (squadsRes.ok && squadsRes.result) {
        const nextSquads = squadsRes.result.squads ?? []
        const nextActive = squadsRes.result.activeSquadId ?? ''
        setSquads(nextSquads)
        setActiveSquadId(nextActive)
      }
      setLastUpdateAt(new Date().toISOString())
    }

    void refreshRuntimeState()
    const id = setInterval(async () => {
      if (document.hidden) return
      await refreshRuntimeState()
    }, 5000)
    return () => clearInterval(id)
  }, [call])

  const teamSteps = useMemo(() => {
    const phase99 = steps.filter((s) => s.phase_number === 99).sort((a, b) => a.step_number - b.step_number)
    return phase99.length > 0 ? phase99 : steps
  }, [steps])

  const blockers = useMemo(() => tagged(teamSteps, 'BLOCKER:'), [teamSteps])
  const nextItems = useMemo(() => tagged(teamSteps, 'NEXT:'), [teamSteps])
  const mergeItems = useMemo(() => tagged(teamSteps, 'MERGE:'), [teamSteps])
  const verifiedStepIds = useMemo(() => {
    const ids = new Set<string>()
    for (const step of teamSteps) {
      const hasVerified = (step.tasks_json ?? []).some((task) => task.done && task.text.toUpperCase().startsWith('VERIFY:'))
      if (hasVerified) ids.add(step.id)
    }
    return ids
  }, [teamSteps])
  const pendingVerificationOptions = useMemo(
    () =>
      mergeItems
        .filter((item) => !item.done && !verifiedStepIds.has(item.stepId))
        .map((item) => ({ stepId: item.stepId, label: item.text })),
    [mergeItems, verifiedStepIds]
  )

  const openNextItems = useMemo(() => nextItems.filter((t) => !t.done), [nextItems])

  const suggested = useMemo(() => {
    const normalized = serverSuggested.trim()
    if (normalized.length > 0 && !/^no suggestion available$/i.test(normalized) && !/^no pending suggestion$/i.test(normalized)) {
      return `Start: ${normalized}`
    }
    const nextOpen = openNextItems[0]
    if (nextOpen) return `Start: ${nextOpen.text}`
    const unstarted = teamSteps.find((s) => s.status === 'not_started')
    if (unstarted) return `Start step ${unstarted.phase_number}.${unstarted.step_number}: ${unstarted.title}`
    const inProgress = teamSteps.find((s) => s.status === 'in_progress')
    if (inProgress) return `Continue step ${inProgress.phase_number}.${inProgress.step_number}: ${inProgress.title}`
    return 'No queued work yet. Start planning discussion to create queue items.'
  }, [openNextItems, serverSuggested, teamSteps])

  const verificationStepId = useMemo(() => {
    const pendingMerge = mergeItems.find((item) => !item.done)
    if (pendingMerge) return pendingMerge.stepId
    return teamSteps.find((step) => step.status === 'in_progress')?.id ?? teamSteps[0]?.id ?? ''
  }, [mergeItems, teamSteps])
  const selectedVerificationStepId = useMemo(() => {
    const match = pendingVerificationOptions.find((opt) => opt.label === selectedFeature)
    return match?.stepId ?? verificationStepId
  }, [pendingVerificationOptions, selectedFeature, verificationStepId])

  useEffect(() => {
    if (pendingVerificationOptions.length === 0) {
      setSelectedFeature('')
      return
    }
    setSelectedFeature((prev) => {
      if (prev && pendingVerificationOptions.some((opt) => opt.label === prev)) return prev
      return pendingVerificationOptions[0].label
    })
  }, [pendingVerificationOptions])

  const openBlockers = blockers.filter((item) => !item.done)
  const needsVerification = mergeItems.some((item) => !item.done && !verifiedStepIds.has(item.stepId))
  const hardBlockers = useMemo(() => {
    const items: Array<{ message: string; resolution: string }> = []
    const shouldShowOffline = !connected && (hasSeenConnected || connectionGraceExpired)
    if (shouldShowOffline) {
      items.push({ message: 'WebSocket/MCP connection is offline.', resolution: 'Wait for reconnect or refresh the page.' })
    }
    for (const blocker of repoState?.hardBlockers ?? []) {
      items.push({ message: blocker.message, resolution: blocker.resolution })
    }
    if (runActive && (runState?.status === 'blocked' || runState?.status === 'failed')) {
      items.push({ message: `Run blocked: ${runState.blockerReason || runState.status}`, resolution: 'Resolve blocker or pause/cleanup before restarting.' })
    }
    return items
  }, [connected, connectionGraceExpired, hasSeenConnected, repoState?.hardBlockers, runActive, runState?.blockerReason, runState?.status])

  const systemStatus = useMemo((): 'working' | 'awaiting_approval' | 'blocked' | 'idle' => {
    if (hardBlockers.length > 0) return 'blocked'
    if (runActive && runState?.status === 'running') return 'working'
    if ((runActive && runState?.status === 'awaiting_approval') || needsVerification) return 'awaiting_approval'
    return 'idle'
  }, [hardBlockers.length, needsVerification, runActive, runState?.status])

  const watchlistItems = useMemo(() => openBlockers.map((item) => item.text), [openBlockers])

  const personaEvents = useMemo(() => {
    const allowed = new Set([
      'project-operator',
      'frontend-engineer',
      'backend-engineer',
      'product-lead',
      'growth-marketing',
      'mobile-engineer',
      'devops-release',
      'founder-ceo',
      'director',
      'tribe-head',
    ])
    return events.filter((event) => event.actor && allowed.has(event.actor))
  }, [events])

  const currentTask = useMemo(() => {
    if (runActive && runState?.label) return runState.label
    if (runState?.status === 'awaiting_approval' && runState.label) return runState.label
    if (runState?.status === 'blocked' && runState.blockerReason) return `Blocked: ${runState.blockerReason}`
    if (openNextItems.length > 0) return openNextItems[0].text
    if (!/^no suggestion available$/i.test(suggested) && !/^no pending suggestion$/i.test(suggested)) return suggested
    return ''
  }, [openNextItems, runActive, runState?.blockerReason, runState?.label, runState?.status, suggested])
  const hasRunnableSuggestion = useMemo(
    () =>
      !/^no suggestion available$/i.test(suggested) &&
      !/^no pending suggestion$/i.test(suggested) &&
      !/^no queued work yet\./i.test(suggested),
    [suggested]
  )

  async function apply(method: string, params: Record<string, unknown>, key: string) {
    if (!connected) {
      setActionError('Mission control is connecting to MCP. Wait a moment and retry.')
      return
    }
    setActionError(null)
    setBusy(key)
    try {
      const res = await call<SnapshotResult>(method, params)
      if (!res.ok) {
        setActionError(res.error ? `Action failed: ${res.error}` : 'Action failed.')
        return
      }
      if (res.ok && res.result?.snapshot) {
        setSteps(res.result.snapshot.executionSteps)
        setHandoffList(res.result.snapshot.handoffs)
      }
      if (res.ok && res.result?.run) {
        setRunState(res.result.run)
      }
      if (res.ok && res.result?.repo) {
        setRepoState(res.result.repo)
      }
      if (res.ok && res.result?.conflictSummary) {
        setConflictSummary(res.result.conflictSummary)
      }
      if (res.ok && res.result?.mergePreview) {
        const p = res.result.mergePreview
        const lines = [
          p.summary,
          `Files (${p.filesChanged.length}):`,
          ...p.filesChanged.slice(0, 40).map((file) => `- ${file}`),
          p.filesChanged.length > 40 ? `... +${p.filesChanged.length - 40} more` : '',
        ].filter(Boolean)
        setMergePreviewText(lines.join('\n'))
      }
      if (res.ok && res.result?.mergeQueue) {
        const q = res.result.mergeQueue
        const lines = [
          `Queue: total=${q.total} merged=${q.merged}${q.blockedAt ? ` blockedAt="${q.blockedAt}"` : ''}`,
          q.recommendedOrder?.length ? `Recommended order: ${q.recommendedOrder.join(' -> ')}` : '',
          ...q.details.slice(0, 40).map((d) => `- [${d.status}] ${d.item}${d.reason ? ` (${d.reason})` : ''}`),
          q.details.length > 40 ? `... +${q.details.length - 40} more` : '',
        ].filter(Boolean)
        setMergeQueueText(lines.join('\n'))
      }
      if (res.ok && typeof res.result?.suggested === 'string') {
        setServerSuggested(res.result.suggested)
      }
      if (res.ok && res.result?.observer) {
        setObserver(res.result.observer)
      }
      setLastUpdateAt(new Date().toISOString())
    } finally {
      setBusy(null)
      await refreshSnapshot()
    }
  }

  async function switchSquad(squadId: string) {
    setActionError(null)
    setActiveSquadId(squadId)
    const res = await call<SnapshotResult>('team.set_active_squad', { squadId })
    if (!res.ok || !res.result) {
      setActionError(res.error ? `Action failed: ${res.error}` : 'Failed to switch squad.')
      return
    }
    const result = res.result
    if (result.squads) setSquads(result.squads)
    if (result.activeSquadId) setActiveSquadId(result.activeSquadId)
    setLastUpdateAt(new Date().toISOString())
  }

  async function openHandoff(path: string) {
    setSelectedHandoffPath(path)
    setSelectedHandoffContent('Loading handoff...')
    try {
      const res = await fetch(`/api/brain-file/${brainId}?path=${encodeURIComponent(path)}`)
      if (!res.ok) {
        setSelectedHandoffContent('Failed to load handoff.')
        return
      }
      const text = await res.text()
      setSelectedHandoffContent(text)
    } catch {
      setSelectedHandoffContent('Failed to load handoff.')
    }
  }

  function adjacentMergeTaskIndex(stepId: string, taskIndex: number, direction: 'up' | 'down'): number | null {
    const inStep = mergeItems.filter((item) => item.stepId === stepId).sort((a, b) => a.taskIndex - b.taskIndex)
    const currentPos = inStep.findIndex((item) => item.taskIndex === taskIndex)
    if (currentPos < 0) return null
    const targetPos = direction === 'up' ? currentPos - 1 : currentPos + 1
    if (targetPos < 0 || targetPos >= inStep.length) return null
    return inStep[targetPos].taskIndex
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <div className="rounded-lg border border-border bg-bg-section p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Mission Control</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPill(systemStatus)}`}>{systemStatus.replace('_', ' ')}</span>
            <span className="text-[12px] text-text-muted">Branch: {repoState?.branch ?? '...'}</span>
          </div>
          <p className="mt-1 text-[12px] text-text-muted">Squad execution command center: run work, verify outcomes, merge verified worktrees.</p>
          <p className="mt-1 text-[12px] text-text-muted">Next action: {suggested}</p>
          <div className="mt-2 rounded-md border border-border/70 bg-bg p-2">
            <p className="text-[11px] font-medium text-text-secondary">Squad</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                value={activeSquadId}
                onChange={(e) => void switchSquad(e.target.value)}
                className="min-w-[180px] rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] text-text-secondary outline-none"
              >
                {(squads.length === 0 ? [{ id: '', name: 'No squads' }] : squads).map((sq) => (
                  <option key={sq.id || 'none'} value={sq.id}>
                    {sq.name}
                  </option>
                ))}
              </select>
              <span className="text-[12px] text-text-muted">Configure squads in Agents + Workflow.</span>
            </div>
          </div>
          {currentTask && (
            <div className={`mt-2 rounded-md border p-2 ${systemStatus === 'blocked' ? 'border-[#D95B5B]/40 bg-[#D95B5B]/10' : 'border-border/70 bg-bg'}`}>
              <p className="text-[11px] font-medium text-text-secondary">Current Task</p>
              <p className={`text-[12px] ${systemStatus === 'blocked' ? 'text-[#D95B5B]' : 'text-text-secondary'}`}>{currentTask}</p>
            </div>
          )}
          {!hasRunnableSuggestion && (
            <div className="mt-2 rounded-md border border-border/70 bg-bg p-2 text-[12px] text-text-muted">
              No runnable next task yet. Run <code>brian plan &lt;initiative-id&gt; --squad &lt;name&gt;</code> to generate queue items, or start the discussion loop.
            </div>
          )}
          {!connected && (
            <div className="mt-2 rounded-md border border-[#E8A830]/40 bg-[#E8A830]/10 p-2 text-[12px] text-[#8C6A1A]">
              Connecting to MCP websocket. Actions enable automatically once connected.
            </div>
          )}
          {actionError && (
            <div className="mt-2 rounded-md border border-[#D95B5B]/40 bg-[#D95B5B]/10 p-2 text-[12px] text-[#D95B5B]">
              {actionError}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => apply('team.start_next_task', { squadId: activeSquadId }, 'start')}
              disabled={busy === 'start' || hardBlockers.length > 0 || !hasRunnableSuggestion || !connected}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Start Next Work
            </button>
            <button
              onClick={() => apply('team.pause_run', {}, 'pause')}
              disabled={busy === 'pause' || runState?.status !== 'running' || !connected}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
            <button
              onClick={() => apply('team.get_conflict_summary', {}, 'conflicts')}
              disabled={busy === 'conflicts' || !repoState?.hasConflicts || !connected}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              View Conflict
            </button>
            <button
              onClick={() => apply('team.merge_queue_dry_run', {}, 'merge-queue-dry')}
              disabled={busy === 'merge-queue-dry' || !connected}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              Dry Run Queue
            </button>
            <button
              onClick={() => apply('team.merge_queue_execute', {}, 'merge-queue-exec')}
              disabled={busy === 'merge-queue-exec' || !connected || needsVerification || Boolean(repoState?.hasConflicts)}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              Merge Worktrees
            </button>
            <button
              onClick={() => apply('team.cleanup_worktrees', {}, 'cleanup-wt')}
              disabled={busy === 'cleanup-wt' || !connected}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              Cleanup Worktrees
            </button>
            <button
              onClick={() => apply('team.generate_handoff', {}, 'generate-handoff')}
              disabled={busy === 'generate-handoff' || !connected}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              Generate Handoff
            </button>
            <button
              onClick={() => apply('team.cleanup_worktrees', { force: true }, 'cleanup-wt-force')}
              disabled={busy === 'cleanup-wt-force' || !connected}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              Force Cleanup
            </button>
            <span className="text-[12px] text-text-muted">Run state: {runState && runActive ? `${runState.status} (${runState.actor ?? 'worker'})` : 'idle'}</span>
            <span className="text-[12px] text-text-muted">
              Discussion loop: {observer?.active ? `on (ticks ${observer.ticks}, tasks ${observer.addedTasks})` : 'off'}
            </span>
            <span className="text-[12px] text-text-muted">
              Last update: {lastUpdateAt ? new Date(lastUpdateAt).toLocaleTimeString('en-GB', { hour12: false }) : 'pending'}
            </span>
            <button
              onClick={() => apply('team.observer_start', {}, 'observer-start')}
              disabled={busy === 'observer-start' || observer?.active || !connected}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              Start Observer
            </button>
            <button
              onClick={() => apply('team.observer_stop', {}, 'observer-stop')}
              disabled={busy === 'observer-stop' || !observer?.active || !connected}
              className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
            >
              Stop Observer
            </button>
          </div>

          {hardBlockers.length > 0 && (
            <div className="mt-2 rounded-md border border-[#D95B5B]/40 bg-[#D95B5B]/10 p-2">
              <p className="text-[11px] font-medium text-[#D95B5B]">Hard Blockers</p>
              {hardBlockers.map((item, idx) => (
                <p key={`hard-${idx}`} className="text-[12px] text-[#D95B5B]">- {item.message} Fix: {item.resolution}</p>
              ))}
            </div>
          )}

          {(repoState?.unresolvedWorktreeDetails?.length ?? 0) > 0 && (
            <div className="mt-2 rounded-md border border-border/70 bg-bg p-2">
              <p className="text-[11px] font-medium text-text-secondary">Unresolved Worktrees</p>
              <div className="mt-1 flex flex-col gap-1.5">
                {(repoState?.unresolvedWorktreeDetails ?? []).map((wt) => (
                  <div key={wt.path} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/70 bg-bg-section p-1.5">
                    <p className="text-[12px] text-text-secondary">{wt.branch} · {wt.path}</p>
                    <button
                      onClick={() => apply('team.remove_worktree', { path: wt.path, force: true }, `rm-wt-${wt.path}`)}
                      disabled={busy === `rm-wt-${wt.path}`}
                      className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
                    >
                      Remove Stale Worktree
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 rounded-md border border-border/70 bg-bg p-2.5">
            <p className="text-[11px] font-medium text-text-secondary">Human Verification Gate</p>
            <p className="mt-1 text-[12px] text-text-muted">`MERGE` is blocked until `VERIFY` is recorded for that step and there are no merge conflicts.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={selectedFeature}
                onChange={(e) => setSelectedFeature(e.target.value)}
                className="min-w-[220px] flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] text-text-secondary outline-none"
              >
              {pendingVerificationOptions.length === 0 ? (
                  <option value="">No pending verification items</option>
                ) : (
                  pendingVerificationOptions.map((option) => (
                    <option key={`${option.stepId}-${option.label}`} value={option.label}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
              <button
                onClick={() =>
                  apply('team.record_human_verification', { stepId: selectedVerificationStepId, feature: selectedFeature || suggested }, 'verify')
                }
                disabled={busy === 'verify' || pendingVerificationOptions.length === 0}
                className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
              >
                Record Verification
              </button>
            </div>
          </div>

          {conflictSummary && (
            <pre className="mt-2 max-h-[180px] overflow-auto rounded-md border border-border bg-bg p-2 text-[11px] text-text-secondary">{conflictSummary}</pre>
          )}
          {mergePreviewText && (
            <pre className="mt-2 max-h-[180px] overflow-auto rounded-md border border-border bg-bg p-2 text-[11px] text-text-secondary">{mergePreviewText}</pre>
          )}
          {mergeQueueText && (
            <pre className="mt-2 max-h-[180px] overflow-auto rounded-md border border-border bg-bg p-2 text-[11px] text-text-secondary">{mergeQueueText}</pre>
          )}
        </div>

          <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-bg-section p-3">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Hard Blockers</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {hardBlockers.map((reason, idx) => (
                <div key={`sys-b-${idx}`} className="flex items-start gap-1.5 text-left text-[12px] text-[#D95B5B]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{reason.message}</span>
                </div>
              ))}
              {hardBlockers.length === 0 && <p className="text-[12px] text-text-muted">No hard blockers.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-section p-3">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Next Queue</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {openNextItems.slice(0, 10).map((item, idx) => (
                <button
                  key={`n-${idx}`}
                  onClick={() => apply('team.toggle_task', { stepId: item.stepId, taskIndex: item.taskIndex }, `n-${idx}`)}
                  disabled={busy === `n-${idx}`}
                  className="flex items-start gap-1.5 text-left text-[12px] text-text-secondary"
                >
                  {item.done ? <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" /> : <Square className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E8A830]" />
                  <span>
                    {parseTaskMeta(item.text, 'feature') ?? item.text}
                    <span className="ml-1 text-text-muted">[{parseTaskMeta(item.text, 'worktree') ?? 'worktree-missing'}]</span>
                  </span>
                </button>
              ))}
              {openNextItems.length === 0 && (
                <p className="text-[12px] text-text-muted">
                  {mergeItems.length > 0
                    ? 'Queue is consumed. Complete verification/merge on active worktrees or run observer for new work.'
                    : 'No queued tasks. Run planning to create `NEXT:` tasks with feature/worktree metadata, or run the discussion loop.'}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-section p-3">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Worktrees</p>
            <div className="mt-2 flex flex-col gap-2">
              {mergeItems.slice(0, 10).map((item, idx) => {
                const mergeMeta = parseMergeBranchMetadata(item.text)
                const canMerge = !item.done && Boolean(mergeMeta) && verifiedStepIds.has(item.stepId) && !repoState?.hasConflicts
                const isVerified = verifiedStepIds.has(item.stepId)
                const upIdx = adjacentMergeTaskIndex(item.stepId, item.taskIndex, 'up')
                const downIdx = adjacentMergeTaskIndex(item.stepId, item.taskIndex, 'down')
                return (
                  <div
                    key={`m-${idx}`}
                    draggable
                    onDragStart={() => setDragMerge({ stepId: item.stepId, taskIndex: item.taskIndex })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!dragMerge) return
                      if (dragMerge.stepId !== item.stepId || dragMerge.taskIndex === item.taskIndex) return
                      void apply(
                        'team.reorder_task',
                        { stepId: item.stepId, fromIndex: dragMerge.taskIndex, toIndex: item.taskIndex },
                        `drag-${idx}`
                      )
                      setDragMerge(null)
                    }}
                    className="cursor-grab rounded-md border border-border/70 bg-bg p-2 active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-1.5 text-[12px] text-text-secondary">
                      {item.done ? <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" /> : <Square className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />
                      <div className="min-w-0 flex-1">
                        <p>{parseTaskMeta(item.text, 'feature') ?? item.text}</p>
                        <p className="mt-0.5 text-[11px] text-text-muted">
                          {mergeMeta ? `${mergeMeta.sourceBranch} -> ${mergeMeta.targetBranch}` : 'Missing branch metadata: use "branch=<source> -> <target>"'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-muted">
                          {isVerified ? 'Verified' : 'Not verified'} · {item.done ? 'Merged' : 'Not merged'} · image={parseTaskMeta(item.text, 'image') ?? 'missing'} · breaking={parseTaskMeta(item.text, 'breaking') ?? 'missing'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => upIdx !== null && apply('team.reorder_task', { stepId: item.stepId, fromIndex: item.taskIndex, toIndex: upIdx }, `mu-${idx}`)}
                        disabled={busy === `mu-${idx}` || upIdx === null}
                        className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
                      >
                        Move up
                      </button>
                      <button
                        onClick={() => downIdx !== null && apply('team.reorder_task', { stepId: item.stepId, fromIndex: item.taskIndex, toIndex: downIdx }, `md-${idx}`)}
                        disabled={busy === `md-${idx}` || downIdx === null}
                        className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
                      >
                        Move down
                      </button>
                      <button
                        onClick={() => apply('team.preview_merge_item', { stepId: item.stepId, taskIndex: item.taskIndex }, `mp-${idx}`)}
                        disabled={busy === `mp-${idx}` || !mergeMeta}
                        className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => apply('team.merge_item', { stepId: item.stepId, taskIndex: item.taskIndex }, `merge-${idx}`)}
                        disabled={busy === `merge-${idx}` || !canMerge}
                        className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-text/5 disabled:opacity-50"
                      >
                        Merge Worktree {mergeMeta ? '' : '(needs metadata)'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {mergeItems.length === 0 && (
                <p className="text-[12px] text-text-muted">No worktrees queued. `MERGE:` items appear after a queued `NEXT:` item is triggered.</p>
              )}
            </div>
          </div>
        </div>

        {watchlistItems.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-section p-3">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Watchlist (Non-blocking)</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {watchlistItems.map((item, idx) => (
                <p key={`watch-${idx}`} className="text-[12px] text-text-muted">- {item}</p>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-bg-section p-3">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Discussion</p>
            <div className="mt-2 flex max-h-[260px] flex-col gap-1 overflow-y-auto">
              {personaEvents.map((event, idx) => {
                const cleaned = event.message
                  .replace(/^\[(stdout|stderr)\]\s*/i, '')
                  .replace(/^\+\s*/, '')
                  .trim()
                if (!cleaned) return null
                if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(cleaned)) return null
                return (
                <p key={`evt-${idx}`} className="text-[12px] text-text-secondary">
                  <span className="mr-1 text-text-muted">[{new Date(event.at).toLocaleTimeString('en-GB', { hour12: false })}]</span>
                  {event.actor ? <span className="mr-1 rounded bg-text/10 px-1 py-0.5 text-[10px] text-text-muted">{event.actor}</span> : null}
                  {event.stage ? <span className="mr-1 rounded bg-text/10 px-1 py-0.5 text-[10px] text-text-muted">{event.stage}</span> : null}
                  <span className="mr-1 text-text-muted">•</span>
                  <span>{cleaned}</span>
                </p>
                )
              })}
              {personaEvents.length === 0 && <p className="text-[12px] text-text-muted">No persona/main-agent output yet.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-section p-3">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Handoffs</p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <div className="max-h-[260px] overflow-y-auto">
                {handoffList.slice().sort((a, b) => b.session_number - a.session_number).slice(0, 12).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => void openHandoff(h.file_path)}
                    className="mb-1.5 w-full rounded border border-border/70 bg-bg px-2 py-1.5 text-left text-[12px] text-text-secondary hover:bg-text/5"
                  >
                    <p className="font-medium">Session {h.session_number}</p>
                    <p className="line-clamp-2 text-[11px] text-text-muted">{h.summary || h.file_path}</p>
                  </button>
                ))}
                {handoffList.length === 0 && <p className="text-[12px] text-text-muted">No handoffs yet.</p>}
              </div>
              <div className="min-h-[220px] rounded border border-border/70 bg-bg p-2">
                <p className="mb-1 text-[11px] text-text-muted">{selectedHandoffPath || 'Select a handoff'}</p>
                <pre className="max-h-[230px] overflow-auto whitespace-pre-wrap text-[11px] text-text-secondary">{selectedHandoffContent || 'Handoff content will render here.'}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
