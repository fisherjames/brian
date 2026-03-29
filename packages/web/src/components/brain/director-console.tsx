'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMcpTeam } from '@/hooks/use-mcp-team'

type CompanyState = {
  brainId: string
  at: string
  directorInbox: Array<{
    director: string
    status: 'green' | 'yellow' | 'red'
    confidence: number
    pendingDecisions: number
    activeEscalations: number
  }>
  pipeline: Record<string, number>
  initiatives: Array<{ id: string; title: string; stage: string; status: string; summary: string }>
  pendingDecisions: Array<{ id: string; title: string; status: string; rationale: string }>
  activeEscalations: Array<{ id: string; title: string; status: string }>
  executionActive: number
  blockers: Array<{ code: string; message: string }>
}

type BriefingsRes = { briefings: Array<{ id: string; title: string; summary: string; published: boolean; at: string }> }
type PlaybackSpeed = 'fast' | 'normal' | 'slow'

export default function DirectorConsole({ brainId }: { brainId: string }) {
  const { call, events, connected } = useMcpTeam(brainId)
  const [state, setState] = useState<CompanyState | null>(null)
  const [briefings, setBriefings] = useState<BriefingsRes['briefings']>([])
  const [intentTitle, setIntentTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [seedTheme, setSeedTheme] = useState('mission control')
  const [playbackRunning, setPlaybackRunning] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>('normal')
  const [playbackStage, setPlaybackStage] = useState('')
  const [playbackStartedAt, setPlaybackStartedAt] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState('')
  const playbackAbortRef = useRef(false)

  const refresh = useCallback(async () => {
    const [company, briefingRes] = await Promise.all([
      fetch(`/api/v2/brains/${brainId}/company-state`, { cache: 'no-store' }),
      fetch(`/api/v2/brains/${brainId}/director-briefings`, { cache: 'no-store' }),
    ])

    if (company.ok) setState((await company.json()) as CompanyState)
    if (briefingRes.ok) setBriefings(((await briefingRes.json()) as BriefingsRes).briefings)
  }, [brainId])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 3000)
    return () => clearInterval(id)
  }, [refresh])

  const runAction = useCallback(async (method: string, params: Record<string, unknown> = {}) => {
    setLoading(true)
    setActionError('')
    try {
      const result = await call(method, params)
      if (!result.ok) throw new Error(result.error || `action_failed:${method}`)
      await refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `action_failed:${method}`)
    } finally {
      setLoading(false)
    }
  }, [call, refresh])

  const playbackWait = useCallback(async (ms: number) => {
    const slice = 250
    let elapsed = 0
    while (elapsed < ms) {
      if (playbackAbortRef.current) throw new Error('playback_stopped')
      const chunk = Math.min(slice, ms - elapsed)
      await new Promise((resolve) => setTimeout(resolve, chunk))
      elapsed += chunk
    }
  }, [])

  const playbackDelay = useCallback((speed: PlaybackSpeed) => {
    if (speed === 'fast') return 1500
    if (speed === 'slow') return 10000
    return 5000
  }, [])

  const runPlayback = useCallback(async (speed: PlaybackSpeed) => {
    if (playbackRunning) return
    setPlaybackRunning(true)
    setPlaybackSpeed(speed)
    setPlaybackStartedAt(new Date().toISOString())
    setPlaybackError('')
    playbackAbortRef.current = false

    const delay = playbackDelay(speed)
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '')
    const intent = `Playback ${stamp}: mission-control clarity`
    const proposal = `Playback ${stamp}: director briefing hardening`
    const callOrThrow = async <T,>(method: string, params: Record<string, unknown>) => {
      const response = await call<T>(method, params)
      if (!response.ok || !response.result) throw new Error(response.error || `playback_action_failed:${method}`)
      return response.result
    }

    try {
      setPlaybackStage('1/7 intent.capture')
      await callOrThrow('company.intent.capture', { title: intent, actor: 'founder-ceo' })
      await playbackWait(delay)

      setPlaybackStage('2/7 initiative.propose')
      const proposeRes = await callOrThrow<{ initiatives?: Array<{ id: string; title: string; updatedAt?: string }> }>('initiative.propose', { title: proposal, actor: 'product-lead' })
      const initiativeCandidates = Array.isArray(proposeRes.initiatives) ? proposeRes.initiatives : []
      const initiative = initiativeCandidates
        .filter((item) => item.title === proposal)
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0] ?? initiativeCandidates[0]
      const initiativeId = initiative?.id
      if (!initiativeId) throw new Error('missing_initiative_id')
      await playbackWait(delay)

      setPlaybackStage('3/7 discussion.open')
      await callOrThrow('discussion.open', {
        title: `Discussion for ${initiativeId}`,
        initiativeId,
        layer: 'squad',
        actor: 'backend-engineer',
      })
      await playbackWait(delay)

      setPlaybackStage('4/7 decision.record')
      await callOrThrow('decision.record', {
        title: `Decision for ${initiativeId}`,
        initiativeId,
        status: 'pending',
        rationale: 'Playback run decision',
        actor: 'founder-ceo',
      })
      await playbackWait(delay)

      setPlaybackStage('5/7 initiative.shape')
      await callOrThrow('initiative.shape', { initiativeId, title: proposal, actor: 'product-lead' })
      await playbackWait(delay)

      setPlaybackStage('6/7 initiative.plan')
      await callOrThrow('initiative.plan', { initiativeId, title: proposal, actor: 'project-operator' })
      await playbackWait(delay)

      setPlaybackStage('7/7 workflow.tick + briefing.generate')
      await callOrThrow('workflow.tick', {})
      await playbackWait(delay)
      await callOrThrow('briefing.generate', { actor: 'founder-ceo' })

      setPlaybackStage('completed')
      await refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'playback_failed'
      if (message !== 'playback_stopped') {
        setPlaybackError(message)
        setPlaybackStage('failed')
      } else {
        setPlaybackStage('stopped')
      }
    } finally {
      setPlaybackRunning(false)
    }
  }, [call, playbackDelay, playbackRunning, playbackWait, refresh])

  const stopPlayback = useCallback(() => {
    playbackAbortRef.current = true
  }, [])

  const actorEvents = useMemo(() => events.slice(0, 20), [events])
  const missionStatus = useMemo<'blocked' | 'awaiting_approval' | 'working'>(
    () => {
      if ((state?.blockers?.length ?? 0) > 0) return 'blocked'
      if ((state?.pendingDecisions?.length ?? 0) > 0 || (state?.activeEscalations?.length ?? 0) > 0) return 'awaiting_approval'
      return 'working'
    },
    [state?.activeEscalations?.length, state?.blockers?.length, state?.pendingDecisions?.length]
  )

  const missionBadge = missionStatus === 'blocked'
    ? 'bg-[#D95B5B]/12 text-[#D95B5B]'
    : missionStatus === 'awaiting_approval'
      ? 'bg-[#E8A830]/12 text-[#E8A830]'
      : 'bg-[#5B9A65]/12 text-[#5B9A65]'

  const resolveAllEscalations = useCallback(async () => {
    const list = state?.activeEscalations ?? []
    if (list.length === 0) return
    setLoading(true)
    try {
      for (const item of list) {
        await call('discussion.resolve', { discussionId: item.id, actor: 'project-operator' })
      }
      await refresh()
    } finally {
      setLoading(false)
    }
  }, [call, refresh, state?.activeEscalations])

  const approveAllDecisions = useCallback(async () => {
    const list = state?.pendingDecisions ?? []
    if (list.length === 0) return
    setLoading(true)
    try {
      for (const item of list) {
        await call('decision.resolve', { decisionId: item.id, status: 'approved', actor: 'founder-ceo' })
      }
      await refresh()
    } finally {
      setLoading(false)
    }
  }, [call, refresh, state?.pendingDecisions])

  return (
    <div className="h-full overflow-y-auto bg-[#F7F6F1] p-4 text-[13px] text-text">
      <div className="mb-4 flex items-center justify-between rounded border border-border bg-white p-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-muted">Director Briefing Console</div>
          <div className="text-[12px] text-text-secondary">{'Intent -> Proposal -> Discussion -> Decision -> Shape -> Plan -> Execute'}</div>
        </div>
        <div className={`rounded px-2 py-1 text-[11px] ${connected ? 'bg-[#5B9A65]/10 text-[#5B9A65]' : 'bg-[#D95B5B]/10 text-[#D95B5B]'}`}>
          {connected ? 'MCP connected' : 'MCP offline'}
        </div>
      </div>

      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">How To Use CEO Dashboard</div>
        <div className="text-[12px] text-text-secondary">1) Capture or seed initiatives. 2) Approve decisions and resolve escalations. 3) Generate briefing and use Team Tracker for verification + merge.</div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded border border-border bg-white p-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-muted">Mission Status</div>
          <div className="text-[12px] text-text-secondary">
            {missionStatus === 'blocked'
              ? 'Blocked: resolve blockers before advancing queue'
              : missionStatus === 'awaiting_approval'
                ? 'Awaiting approval: pending escalations or decisions'
                : 'Working: no blocking approvals outstanding'}
          </div>
        </div>
        <div className={`rounded px-2 py-1 text-[11px] uppercase tracking-wide ${missionBadge}`}>
          {missionStatus.replace('_', ' ')}
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Capture Intent</div>
          <div className="flex gap-2">
            <input
              value={intentTitle}
              onChange={(event) => setIntentTitle(event.target.value)}
              placeholder="Describe the initiative intent"
              className="flex-1 rounded border border-border px-2 py-1.5"
            />
            <button
              disabled={loading || !intentTitle.trim()}
              onClick={() => runAction('company.intent.capture', { title: intentTitle.trim() }).then(() => setIntentTitle(''))}
              className="rounded border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Capture
            </button>
          </div>
        </div>

        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Workflow Controls</div>
          <div className="flex flex-wrap gap-2">
            <button disabled={loading} onClick={() => runAction('workflow.tick')} className="rounded border border-border px-2 py-1.5 disabled:opacity-50">Tick</button>
            <button disabled={loading} onClick={() => runAction('briefing.generate')} className="rounded border border-border px-2 py-1.5 disabled:opacity-50">Generate Briefing</button>
            <button disabled={loading} onClick={() => runAction('workflow.autopilot.start')} className="rounded border border-border px-2 py-1.5 disabled:opacity-50">Start Autopilot</button>
            <button disabled={loading} onClick={() => runAction('workflow.autopilot.stop')} className="rounded border border-border px-2 py-1.5 disabled:opacity-50">Stop Autopilot</button>
          </div>
          <div className="mt-3 rounded border border-border/70 bg-[#F7F6F1] p-2">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Backlog Refinement</div>
            <div className="flex gap-2">
              <input
                value={seedTheme}
                onChange={(event) => setSeedTheme(event.target.value)}
                className="flex-1 rounded border border-border px-2 py-1.5 text-[12px]"
                placeholder="Theme"
              />
              <button
                disabled={loading || !seedTheme.trim()}
                onClick={() => runAction('workflow.seed_backlog', { theme: seedTheme.trim(), actor: 'founder-ceo' })}
                className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50"
              >
                Seed 3-Pack
              </button>
            </div>
          </div>
          <div className="mt-3 border-t border-border/70 pt-3">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Playback Mode</div>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={playbackRunning || !connected}
                onClick={() => void runPlayback('slow')}
                className="rounded border border-border px-2 py-1.5 disabled:opacity-50"
              >
                Run Slow
              </button>
              <button
                disabled={playbackRunning || !connected}
                onClick={() => void runPlayback('normal')}
                className="rounded border border-border px-2 py-1.5 disabled:opacity-50"
              >
                Run Normal
              </button>
              <button
                disabled={playbackRunning || !connected}
                onClick={() => void runPlayback('fast')}
                className="rounded border border-border px-2 py-1.5 disabled:opacity-50"
              >
                Run Fast
              </button>
              <button
                disabled={!playbackRunning}
                onClick={stopPlayback}
                className="rounded border border-[#D95B5B]/40 bg-[#D95B5B]/5 px-2 py-1.5 text-[#D95B5B] disabled:opacity-50"
              >
                Stop
              </button>
            </div>
            <div className="mt-2 text-[11px] text-text-muted">
              {playbackRunning
                ? `Running (${playbackSpeed}) · ${playbackStage}`
                : playbackStartedAt
                  ? `Last run ${new Date(playbackStartedAt).toLocaleTimeString()} · ${playbackStage || 'idle'}`
                  : 'No playback run yet'}
            </div>
            {playbackError && <div className="mt-1 text-[11px] text-[#D95B5B]">Error: {playbackError}</div>}
            {actionError && <div className="mt-1 text-[11px] text-[#D95B5B]">Action error: {actionError}</div>}
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Director Inbox</div>
          {(state?.directorInbox ?? []).map((card) => (
            <div key={card.director} className="mb-2 rounded border border-border/70 p-2">
              <div className="text-[12px] font-medium">{card.director}</div>
              <div className="text-[11px] text-text-muted">status {card.status} · confidence {card.confidence}%</div>
              <div className="text-[11px] text-text-secondary">decisions {card.pendingDecisions} · escalations {card.activeEscalations}</div>
            </div>
          ))}
        </div>

        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Initiative Pipeline</div>
          {Object.entries(state?.pipeline ?? {}).map(([stage, count]) => (
            <div key={stage} className="flex items-center justify-between border-b border-border/60 py-1 text-[12px] last:border-b-0">
              <span>{stage.replace(/_/g, ' ')}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>

        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Needs Decision</div>
          {(state?.pendingDecisions ?? []).length > 1 && (
            <div className="mb-2">
              <button
                disabled={loading}
                onClick={() => void approveAllDecisions()}
                className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
              >
                Approve All
              </button>
            </div>
          )}
          {(state?.pendingDecisions ?? []).length === 0 ? (
            <div className="text-[12px] text-text-muted">No pending decisions</div>
          ) : (
            (state?.pendingDecisions ?? []).map((decision) => (
              <div key={decision.id} className="mb-2 rounded border border-border/70 p-2">
                <div className="text-[12px] font-medium">{decision.title}</div>
                <div className="text-[11px] text-text-muted">{decision.id}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={loading}
                    onClick={() => runAction('decision.resolve', { decisionId: decision.id, status: 'approved', actor: 'founder-ceo' })}
                    className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={loading}
                    onClick={() => runAction('decision.resolve', { decisionId: decision.id, status: 'rejected', actor: 'founder-ceo' })}
                    className="rounded border border-[#D95B5B]/40 bg-[#D95B5B]/5 px-2 py-1 text-[11px] text-[#D95B5B] disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Active Escalations</div>
          {(state?.activeEscalations ?? []).length > 1 && (
            <div className="mb-2">
              <button
                disabled={loading}
                onClick={() => void resolveAllEscalations()}
                className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
              >
                Resolve All
              </button>
            </div>
          )}
          {(state?.activeEscalations ?? []).length === 0 ? (
            <div className="text-[12px] text-text-muted">No active escalations</div>
          ) : (
            (state?.activeEscalations ?? []).map((item) => (
              <div key={item.id} className="mb-2 rounded border border-[#D95B5B]/30 bg-[#D95B5B]/5 p-2 text-[12px]">
                <div className="font-medium">{item.title}</div>
                <div className="text-[11px] text-text-muted">{item.status}</div>
                <div className="mt-2">
                  <button
                    disabled={loading}
                    onClick={() => runAction('discussion.resolve', { discussionId: item.id, actor: 'project-operator' })}
                    className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
                  >
                    Mark Resolved
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Director Briefings</div>
          {briefings.length === 0 ? (
            <div className="text-[12px] text-text-muted">No briefings generated yet</div>
          ) : (
            briefings.slice(0, 8).map((briefing) => (
              <div key={briefing.id} className="mb-2 rounded border border-border/70 p-2">
                <div className="text-[12px] font-medium">{briefing.title}</div>
                <div className="text-[11px] text-text-secondary">{briefing.summary}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Live Workflow Output</div>
        {actorEvents.length === 0 ? (
          <div className="text-[12px] text-text-muted">No live activity yet</div>
        ) : (
          <div className="max-h-[220px] space-y-1 overflow-y-auto font-mono text-[11px]">
            {actorEvents.map((event, idx) => (
              <div key={`${event.at}-${idx}`} className="rounded border border-border/60 px-2 py-1">
                <span className="text-text-muted">[{new Date(event.at).toLocaleTimeString()}]</span>{' '}
                <span className="text-[#5B9A65]">{event.actor ?? 'system'}</span>{' '}
                <span className="text-[#4A9FD9]">{event.stage ?? 'stage'}</span>{' '}
                <span>{event.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
