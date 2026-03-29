'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

type Initiative = {
  id: string
  title: string
  summary: string
  stage: string
  status: string
  filePath: string
}

type Discussion = {
  id: string
  title: string
  layer: 'squad' | 'tribe' | 'director'
  status: 'open' | 'escalated' | 'resolved'
  initiativeId?: string
  unresolvedQuestions: number
  filePath: string
  updatedAt: string
}

type Decision = {
  id: string
  title: string
  initiativeId?: string
  status: 'pending' | 'approved' | 'rejected'
  rationale: string
  filePath: string
  at: string
}

type Briefing = {
  id: string
  title: string
  summary: string
  filePath: string
  published: boolean
  at: string
}

type RecordItem =
  | { kind: 'initiative'; id: string; title: string; subtitle: string; filePath: string }
  | { kind: 'discussion'; id: string; title: string; subtitle: string; filePath: string }
  | { kind: 'decision'; id: string; title: string; subtitle: string; filePath: string }
  | { kind: 'briefing'; id: string; title: string; subtitle: string; filePath: string }

function stageLabel(stage: string) {
  return stage.replace(/_/g, ' ')
}

export default function CompanyOS({
  brainId,
  brainName,
}: {
  brainId: string
  brainName: string
}) {
  const { call, connected, events } = useMcpTeam(brainId)
  const [state, setState] = useState<CompanyState | null>(null)
  const [initiatives, setInitiatives] = useState<Initiative[]>([])
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [intent, setIntent] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [runningCycle, setRunningCycle] = useState(false)
  const [lastPing, setLastPing] = useState('')
  const [error, setError] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null)
  const [selectedContent, setSelectedContent] = useState('')
  const [loadingRecord, setLoadingRecord] = useState(false)

  const loadRecordContent = useCallback(
    async (record: RecordItem) => {
      setSelectedRecord(record)
      setSelectedContent('')
      setLoadingRecord(true)
      try {
        const res = await fetch(`/api/brain-file/${brainId}?path=${encodeURIComponent(record.filePath)}`)
        if (!res.ok) throw new Error('failed_record_load')
        const text = await res.text()
        setSelectedContent(text)
      } catch {
        setSelectedContent('Unable to load note content.')
      } finally {
        setLoadingRecord(false)
      }
    },
    [brainId]
  )

  const refresh = useCallback(async () => {
    const [company, initiativesRes, discussionsRes, decisionsRes, briefingsRes] = await Promise.all([
      fetch(`/api/v2/brains/${brainId}/company-state`, { cache: 'no-store' }),
      fetch(`/api/v2/brains/${brainId}/initiatives`, { cache: 'no-store' }),
      fetch(`/api/v2/brains/${brainId}/discussions`, { cache: 'no-store' }),
      fetch(`/api/v2/brains/${brainId}/decisions`, { cache: 'no-store' }),
      fetch(`/api/v2/brains/${brainId}/director-briefings`, { cache: 'no-store' }),
    ])
    if (company.ok) setState((await company.json()) as CompanyState)
    if (initiativesRes.ok) {
      const data = (await initiativesRes.json()) as { initiatives?: Initiative[] }
      setInitiatives(Array.isArray(data.initiatives) ? data.initiatives : [])
    }
    if (discussionsRes.ok) {
      const data = (await discussionsRes.json()) as { discussions?: Discussion[] }
      setDiscussions(Array.isArray(data.discussions) ? data.discussions : [])
    }
    if (decisionsRes.ok) {
      const data = (await decisionsRes.json()) as { decisions?: Decision[] }
      setDecisions(Array.isArray(data.decisions) ? data.decisions : [])
    }
    if (briefingsRes.ok) {
      const data = (await briefingsRes.json()) as { briefings?: Briefing[] }
      setBriefings(Array.isArray(data.briefings) ? data.briefings : [])
    }
  }, [brainId])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 3000)
    return () => clearInterval(id)
  }, [refresh])

  const run = useCallback(
    async (method: string, params: Record<string, unknown> = {}, key: string = method) => {
      setBusy(key)
      setError('')
      try {
        const res = await call(method, params)
        if (!res.ok) throw new Error(res.error || `action_failed:${method}`)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : `action_failed:${method}`)
      } finally {
        setBusy(null)
      }
    },
    [call, refresh]
  )

  const director = state?.directorInbox?.[0]
  const live = useMemo(() => events.slice(0, 40), [events])

  const recordGroups = useMemo(
    () => ({
      initiatives: initiatives.slice(0, 24).map(
        (item): RecordItem => ({
          kind: 'initiative',
          id: item.id,
          title: item.title,
          subtitle: `${stageLabel(item.stage)} · ${item.status}`,
          filePath: item.filePath,
        })
      ),
      discussions: discussions.slice(0, 24).map(
        (item): RecordItem => ({
          kind: 'discussion',
          id: item.id,
          title: item.title,
          subtitle: `${item.layer} · ${item.status} · unresolved=${item.unresolvedQuestions}`,
          filePath: item.filePath,
        })
      ),
      decisions: decisions.slice(0, 24).map(
        (item): RecordItem => ({
          kind: 'decision',
          id: item.id,
          title: item.title,
          subtitle: `${item.status} · ${item.initiativeId ?? 'no-initiative'}`,
          filePath: item.filePath,
        })
      ),
      briefings: briefings.slice(0, 24).map(
        (item): RecordItem => ({
          kind: 'briefing',
          id: item.id,
          title: item.title,
          subtitle: `${new Date(item.at).toLocaleString('en-GB')} · ${item.published ? 'published' : 'draft'}`,
          filePath: item.filePath,
        })
      ),
    }),
    [briefings, decisions, discussions, initiatives]
  )

  useEffect(() => {
    if (selectedRecord) return
    const first =
      recordGroups.initiatives[0] ??
      recordGroups.discussions[0] ??
      recordGroups.decisions[0] ??
      recordGroups.briefings[0] ??
      null
    if (!first) return
    void loadRecordContent(first)
  }, [loadRecordContent, recordGroups, selectedRecord])

  const runOneCycle = useCallback(
    async (cycleIndex: number) => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
      const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '')
      const base = `UI cycle ${cycleIndex} ${stamp}: real workflow`
      const actors = {
        ceo: 'founder-ceo',
        product: 'product-lead',
        backend: 'backend-engineer',
        frontend: 'frontend-engineer',
        ops: 'project-operator',
      }
      await run('company.intent.capture', { title: base, summary: 'Feature-length initiative with explicit rationale and specialist discussion.', actor: actors.ceo }, `cycle-${cycleIndex}-intent`)
      await delay(1500)
      const proposed = await call<{ initiatives: Initiative[] }>('initiative.propose', { title: `${base} proposal`, summary: 'Proposal includes risks, validation, and merge-readiness intent.', actor: actors.product })
      const initiativeId = proposed.ok ? (proposed.result?.initiatives ?? []).find((item) => item.title === `${base} proposal`)?.id : ''
      if (!initiativeId) throw new Error('missing_initiative_after_propose')
      await delay(1500)
      const discussion = await call<{ message: string }>('discussion.open', {
        title: `Discussion ${initiativeId}`,
        initiativeId,
        layer: 'squad',
        actor: actors.backend,
        message: 'Backend specialist opened architecture discussion with concrete tradeoffs.',
      })
      const discussionId = discussion.ok ? (discussion.result?.message ?? '').split(':')[1] : ''
      if (!discussionId) throw new Error('missing_discussion_after_open')
      await delay(1500)
      await run('discussion.escalate', { discussionId, initiativeId, actor: actors.product, message: 'Escalating priority and merge-order decision for director approval.' }, `cycle-${cycleIndex}-escalate`)
      await delay(1500)
      await run('decision.record', { title: `Decision ${initiativeId}`, initiativeId, status: 'pending', rationale: 'Approve when sequencing, verification, and rollback are explicit.', actor: actors.ceo }, `cycle-${cycleIndex}-decision-record`)
      await delay(1500)
      const pending = await call<{ pending: Array<{ id: string; initiativeId?: string }> }>('decision.list_pending', {})
      const decisionId = pending.ok ? (pending.result?.pending ?? []).find((item) => item.initiativeId === initiativeId)?.id : ''
      if (decisionId) {
        await run('decision.resolve', { decisionId, status: 'approved', actor: actors.ceo }, `cycle-${cycleIndex}-decision-approve`)
        await delay(1200)
      }
      await run('discussion.answer', { discussionId, initiativeId, actor: actors.frontend, message: 'Frontend specialist documented concrete verification instructions and fallback behavior.' }, `cycle-${cycleIndex}-answer`)
      await delay(1200)
      await run('discussion.resolve', { discussionId, initiativeId, actor: actors.ops, message: 'Discussion resolved after approved director decision and specialist input.' }, `cycle-${cycleIndex}-resolve`)
      await delay(1200)
      await run('initiative.shape', { initiativeId, title: `${base} shaped`, summary: 'Tribe shaping captured architecture and risk controls.', actor: actors.product }, `cycle-${cycleIndex}-shape`)
      await delay(1200)
      await run('initiative.plan', { initiativeId, title: `${base} planned`, summary: 'Squad plan includes explicit merge order and verification gate.', actor: actors.ops }, `cycle-${cycleIndex}-plan`)
      await delay(1200)
      await run('initiative.execute', { initiativeId, title: `${base} execute`, summary: 'Execution started with human verification required before merge.', actor: actors.backend }, `cycle-${cycleIndex}-execute`)
      await delay(1200)
      await run('briefing.generate', { actor: actors.ceo }, `cycle-${cycleIndex}-briefing`)
    },
    [call, run]
  )

  const runCycles = useCallback(
    async (count: number) => {
      if (runningCycle) return
      setRunningCycle(true)
      setError('')
      try {
        for (let i = 1; i <= count; i += 1) {
          await runOneCycle(i)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'cycle_run_failed')
      } finally {
        setRunningCycle(false)
        await refresh()
      }
    },
    [refresh, runOneCycle, runningCycle]
  )

  return (
    <div className="h-full overflow-y-auto bg-[#F7F6F1] p-4 text-[13px] text-text">
      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-text-muted">Brian V2 Company OS</div>
            <div className="text-[15px] font-semibold">{brainName}</div>
          </div>
          <div className={`rounded px-2 py-1 text-[11px] ${connected ? 'bg-[#5B9A65]/10 text-[#5B9A65]' : 'bg-[#D95B5B]/10 text-[#D95B5B]'}`}>
            {connected ? 'MCP connected' : 'MCP offline'}
          </div>
        </div>
        <div className="mt-2 rounded border border-border/70 bg-[#F7F6F1] p-2 text-[12px] text-text-secondary">
          {'Workflow contract: intent -> proposal -> leadership discussion -> director decision -> tribe shaping -> squad planning -> execution'}
        </div>
        <div className="mt-2 text-[12px] text-text-muted">
          V2-only command center. Every record below is clickable and opens full markdown details in-place.
        </div>
      </div>

      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">Feature Callout + Instructions</div>
        <div className="text-[12px] text-text-secondary">
          Feature: CEO can progress initiatives through explicit governance gates with visible persona discussion and decision records.
        </div>
        <div className="mt-1 text-[12px] text-text-secondary">
          Instruction: use <strong>Tick</strong> to move one active initiative exactly one stage forward in the canonical lifecycle.
          Tick does not skip gates; use approvals/escalation resolution before ticking when needed.
        </div>
        <div className="mt-1 text-[12px] text-text-secondary">
          Instruction: use <strong>Verify Watch</strong> to emit a unique ping in live output and confirm you and Brian are on the same localhost stream.
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Start Initiative</div>
          <div className="flex gap-2">
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Intent title"
              className="flex-1 rounded border border-border px-2 py-1.5"
            />
            <button
              onClick={() => void run('company.intent.capture', { title: intent.trim(), actor: 'founder-ceo' }, 'intent')}
              disabled={busy === 'intent' || intent.trim().length === 0}
              className="rounded border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Capture
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => void run('workflow.seed_backlog', { theme: 'company os', actor: 'founder-ceo' }, 'seed')} disabled={busy === 'seed'} className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50">Seed Backlog</button>
            <button onClick={() => void run('workflow.tick', {}, 'tick')} disabled={busy === 'tick'} className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50">Tick (Advance 1 Stage)</button>
            <button onClick={() => void run('briefing.generate', { actor: 'founder-ceo' }, 'brief')} disabled={busy === 'brief'} className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50">Generate Briefing</button>
            <button
              onClick={async () => {
                const token = `watch-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`
                setLastPing(token)
                await run('workflow.watch_ping', { token, actor: 'founder-ceo' }, 'watch-ping')
              }}
              disabled={busy === 'watch-ping'}
              className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50"
            >
              Verify Watch
            </button>
            <button onClick={() => void runCycles(1)} disabled={runningCycle} className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50">
              Run 1 Slow Cycle
            </button>
            <button onClick={() => void runCycles(3)} disabled={runningCycle} className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50">
              Run 3 Slow Cycles
            </button>
          </div>
          {lastPing && <div className="mt-2 text-[11px] text-text-muted">Latest watch token: {lastPing}</div>}
        </div>

        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">CEO Inbox</div>
          <div className="text-[12px] text-text-secondary">
            Status: {director?.status ?? 'unknown'} · Confidence: {director?.confidence ?? 0}%
          </div>
          <div className="text-[12px] text-text-secondary">
            Pending decisions: {state?.pendingDecisions.length ?? 0} · Active escalations: {state?.activeEscalations.length ?? 0}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              disabled={busy === 'approve-all' || (state?.pendingDecisions.length ?? 0) === 0}
              onClick={async () => {
                setBusy('approve-all')
                for (const decision of state?.pendingDecisions ?? []) {
                  await call('decision.resolve', { decisionId: decision.id, status: 'approved', actor: 'founder-ceo' })
                }
                setBusy(null)
                await refresh()
              }}
              className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50"
            >
              Approve All
            </button>
            <button
              disabled={busy === 'resolve-all' || (state?.activeEscalations.length ?? 0) === 0}
              onClick={async () => {
                setBusy('resolve-all')
                for (const discussion of state?.activeEscalations ?? []) {
                  await call('discussion.resolve', { discussionId: discussion.id, actor: 'project-operator' })
                }
                setBusy(null)
                await refresh()
              }}
              className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50"
            >
              Resolve All Escalations
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded border border-border bg-white p-3 md:col-span-2">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Initiative Pipeline</div>
          <div className="mb-2 grid gap-1 sm:grid-cols-2">
            {Object.entries(state?.pipeline ?? {}).map(([stage, count]) => (
              <div key={stage} className="flex items-center justify-between rounded border border-border/70 px-2 py-1 text-[12px]">
                <span>{stageLabel(stage)}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
          <div className="max-h-[220px] overflow-y-auto rounded border border-border/70">
            {(state?.initiatives ?? []).map((initiative) => (
              <div key={initiative.id} className="border-b border-border/60 px-2 py-1.5 text-[12px] last:border-b-0">
                <div className="font-medium">{initiative.title}</div>
                <div className="text-text-muted">{initiative.id} · {stageLabel(initiative.stage)} · {initiative.status}</div>
              </div>
            ))}
            {(state?.initiatives ?? []).length === 0 && <div className="px-2 py-2 text-[12px] text-text-muted">No initiatives yet.</div>}
          </div>
        </div>
        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Blockers</div>
          {(state?.blockers ?? []).length === 0 ? (
            <div className="text-[12px] text-text-muted">No blockers.</div>
          ) : (
            (state?.blockers ?? []).map((blocker) => (
              <div key={blocker.code} className="mb-2 rounded border border-[#D95B5B]/30 bg-[#D95B5B]/5 p-2 text-[12px] text-[#D95B5B]">
                <div className="font-medium">{blocker.code}</div>
                <div>{blocker.message}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">V2 Record Graph (Clickable)</div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Initiatives</div>
              <div className="max-h-[170px] overflow-y-auto space-y-1">
                {recordGroups.initiatives.map((record) => (
                  <button key={record.id} onClick={() => void loadRecordContent(record)} className="w-full rounded border border-border/70 px-2 py-1 text-left text-[12px] hover:bg-text/5">
                    <div className="font-medium">{record.title}</div>
                    <div className="text-[11px] text-text-muted">{record.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Discussions</div>
              <div className="max-h-[170px] overflow-y-auto space-y-1">
                {recordGroups.discussions.map((record) => (
                  <button key={record.id} onClick={() => void loadRecordContent(record)} className="w-full rounded border border-border/70 px-2 py-1 text-left text-[12px] hover:bg-text/5">
                    <div className="font-medium">{record.title}</div>
                    <div className="text-[11px] text-text-muted">{record.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Decisions</div>
              <div className="max-h-[170px] overflow-y-auto space-y-1">
                {recordGroups.decisions.map((record) => (
                  <button key={record.id} onClick={() => void loadRecordContent(record)} className="w-full rounded border border-border/70 px-2 py-1 text-left text-[12px] hover:bg-text/5">
                    <div className="font-medium">{record.title}</div>
                    <div className="text-[11px] text-text-muted">{record.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Briefings</div>
              <div className="max-h-[170px] overflow-y-auto space-y-1">
                {recordGroups.briefings.map((record) => (
                  <button key={record.id} onClick={() => void loadRecordContent(record)} className="w-full rounded border border-border/70 px-2 py-1 text-left text-[12px] hover:bg-text/5">
                    <div className="font-medium">{record.title}</div>
                    <div className="text-[11px] text-text-muted">{record.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded border border-border bg-white p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">Record Detail</div>
          <div className="mb-2 text-[11px] text-text-muted">
            {selectedRecord ? `${selectedRecord.kind}:${selectedRecord.id}` : 'Select any record from initiatives/discussions/decisions/briefings.'}
          </div>
          <div className="max-h-[360px] overflow-auto rounded border border-border/70 bg-[#F7F6F1] p-2">
            {loadingRecord ? (
              <div className="text-[12px] text-text-muted">Loading note...</div>
            ) : (
              <pre className="whitespace-pre-wrap text-[12px] text-text-secondary">{selectedContent || 'No note selected.'}</pre>
            )}
          </div>
        </div>
      </div>

      <div className="rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Live Workflow Events</div>
        {live.length === 0 ? (
          <div className="text-[12px] text-text-muted">No events yet.</div>
        ) : (
          <div className="max-h-[240px] space-y-1 overflow-y-auto font-mono text-[11px]">
            {live.map((event, i) => (
              <div key={`${event.at}-${i}`} className="rounded border border-border/70 px-2 py-1">
                [{new Date(event.at).toLocaleTimeString('en-GB', { hour12: false })}] {event.actor ?? 'system'} {event.stage ?? 'stage'} {event.message}
              </div>
            ))}
          </div>
        )}
      </div>
      {error && <div className="mt-3 rounded border border-[#D95B5B]/40 bg-[#D95B5B]/10 p-2 text-[12px] text-[#D95B5B]">{error}</div>}
    </div>
  )
}
