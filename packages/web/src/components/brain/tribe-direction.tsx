'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMcpTeam } from '@/hooks/use-mcp-team'

type Initiative = {
  id: string
  title: string
  stage: string
  status: string
  summary: string
  filePath: string
}

type Discussion = {
  id: string
  title: string
  layer: 'squad' | 'tribe' | 'director'
  status: 'open' | 'resolved' | 'escalated'
  initiativeId?: string
  unresolvedQuestions: number
  question: string
  thread: string[]
  filePath: string
}

type PendingDecision = {
  id: string
  title: string
  question: string
  rationale: string
  mode: 'yes_no' | 'multi_option'
  options: string[]
  status: string
  filePath: string
}

type CompanyState = {
  pendingDecisions: PendingDecision[]
}

function stageLabel(stage: string) {
  return stage.replace(/_/g, ' ')
}

function actorForLayer(layer: Discussion['layer']) {
  return layer === 'director' ? 'founder-ceo' : 'product-lead'
}

export default function TribeDirection({
  brainId,
  onOpenRecord,
}: {
  brainId: string
  onOpenRecord?: (path: string) => void
}) {
  const { call, connected } = useMcpTeam(brainId)
  const [initiatives, setInitiatives] = useState<Initiative[]>([])
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [pendingDecisions, setPendingDecisions] = useState<PendingDecision[]>([])
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showAllQuestions, setShowAllQuestions] = useState(false)

  const refresh = useCallback(async () => {
    const [initiativesRes, discussionsRes, companyRes] = await Promise.all([
      fetch(`/api/v2/brains/${brainId}/initiatives`, { cache: 'no-store' }),
      fetch(`/api/v2/brains/${brainId}/discussions`, { cache: 'no-store' }),
      fetch(`/api/v2/brains/${brainId}/company-state`, { cache: 'no-store' }),
    ])
    if (initiativesRes.ok) {
      const data = (await initiativesRes.json()) as { initiatives?: Initiative[] }
      setInitiatives(Array.isArray(data.initiatives) ? data.initiatives : [])
    }
    if (discussionsRes.ok) {
      const data = (await discussionsRes.json()) as { discussions?: Discussion[] }
      setDiscussions(Array.isArray(data.discussions) ? data.discussions : [])
    }
    if (companyRes.ok) {
      const data = (await companyRes.json()) as CompanyState
      setPendingDecisions(Array.isArray(data.pendingDecisions) ? data.pendingDecisions : [])
    }
  }, [brainId])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 4000)
    return () => clearInterval(id)
  }, [refresh])

  const run = useCallback(
    async (method: string, params: Record<string, unknown>, key: string) => {
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

  const initiativeById = useMemo(() => {
    const map = new Map<string, Initiative>()
    for (const item of initiatives) map.set(item.id, item)
    return map
  }, [initiatives])

  const openQuestions = useMemo(() => {
    const filtered = discussions
      .filter((item) => item.status !== 'resolved' || item.unresolvedQuestions > 0)
      .sort((a, b) => {
        const score = (d: Discussion) => (d.layer === 'director' ? 3 : d.layer === 'tribe' ? 2 : 1)
        return score(b) - score(a)
      })
    return showAllQuestions ? filtered : filtered.slice(0, 5)
  }, [discussions, showAllQuestions])

  const directionQueue = useMemo(
    () =>
      initiatives
        .filter((item) => ['proposal', 'leadership_discussion', 'director_decision', 'tribe_shaping'].includes(item.stage))
        .slice(0, 10),
    [initiatives]
  )

  return (
    <div className="h-full overflow-y-auto bg-[#F7F6F1] p-4 text-[13px] text-text">
      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-text-muted">Tribe</div>
            <div className="text-[12px] text-text-secondary">
              Resolve squad, tribe, and director questions in one place, then escalate with explicit context.
            </div>
          </div>
          <div className={`rounded px-2 py-1 text-[11px] ${connected ? 'bg-[#5B9A65]/10 text-[#5B9A65]' : 'bg-[#D95B5B]/10 text-[#D95B5B]'}`}>
            {connected ? 'MCP connected' : 'MCP offline'}
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Open Questions</div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] text-text-muted">
              {showAllQuestions ? 'Showing all active questions' : 'Showing top 5 priority questions'}
            </div>
            <button
              onClick={() => setShowAllQuestions((prev) => !prev)}
              className="rounded border border-border px-2 py-1 text-[11px]"
            >
              {showAllQuestions ? 'Show Top 5' : 'Show All'}
            </button>
          </div>
          {openQuestions.length === 0 ? (
            <div className="text-[12px] text-text-muted">No open questions.</div>
          ) : (
            openQuestions.map((item) => (
              <div key={item.id} className="mb-2 rounded border border-border/70 bg-[#FCFCFA] p-2 text-[12px] last:mb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{item.title}</div>
                  <div className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">{item.layer}</div>
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-text-muted">Question</div>
                <div className="text-text-secondary">{item.question || 'No explicit question recorded.'}</div>
                {item.initiativeId && initiativeById.get(item.initiativeId) && (
                  <div className="mt-1 text-[11px] text-text-muted">Initiative: {initiativeById.get(item.initiativeId)?.title}</div>
                )}
                <button
                  onClick={() => onOpenRecord?.(item.filePath)}
                  className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
                >
                  Open discussion
                </button>
                {(item.thread?.length ?? 0) > 0 && (
                  <>
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-text-muted">Latest Thread</div>
                    <div className="rounded border border-border/70 bg-white p-1.5 text-[11px] text-text-secondary">
                      {item.thread.slice(-3).map((line, idx) => (
                        <div key={`${item.id}-thread-${idx}`}>- {line}</div>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={responses[item.id] ?? ''}
                    onChange={(e) => setResponses((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Respond in thread"
                    className="min-w-[180px] flex-1 rounded border border-border px-2 py-1 text-[11px]"
                  />
                  <button
                    disabled={busy === `respond-${item.id}` || !(responses[item.id] ?? '').trim()}
                    onClick={async () => {
                      const message = (responses[item.id] ?? '').trim()
                      if (!message) return
                      await run('discussion.respond', { discussionId: item.id, actor: actorForLayer(item.layer), message }, `respond-${item.id}`)
                      setResponses((prev) => ({ ...prev, [item.id]: '' }))
                    }}
                    className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
                  >
                    Respond
                  </button>
                  <button
                    disabled={busy === `confirm-${item.id}` || !item.question.trim()}
                    onClick={() => void run('discussion.resolve', { discussionId: item.id, actor: actorForLayer(item.layer), resolution: 'confirmed' }, `confirm-${item.id}`)}
                    className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    disabled={busy === `deny-${item.id}` || !item.question.trim()}
                    onClick={() => void run('discussion.resolve', { discussionId: item.id, actor: actorForLayer(item.layer), resolution: 'denied' }, `deny-${item.id}`)}
                    className="rounded border border-[#D95B5B]/40 bg-[#D95B5B]/5 px-2 py-1 text-[11px] text-[#D95B5B] disabled:opacity-50"
                  >
                    Deny
                  </button>
                  <button
                    disabled={busy === `escalate-${item.id}` || !item.question.trim()}
                    onClick={() => void run('discussion.escalate', { discussionId: item.id, actor: actorForLayer(item.layer), message: item.question }, `escalate-${item.id}`)}
                    className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
                  >
                    {item.layer === 'director' ? 'Escalate To CEO Decision' : 'Escalate Up'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded border border-border bg-white p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Pending Decisions</div>
          {pendingDecisions.length === 0 ? (
            <div className="text-[12px] text-text-muted">No pending decisions.</div>
          ) : (
            pendingDecisions.map((decision) => (
              <div key={decision.id} className="mb-2 rounded border border-border/70 bg-[#FCFCFA] p-2 text-[12px] last:mb-0">
                <div className="font-medium">{decision.title}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-text-muted">Question</div>
                <div className="text-text-secondary">{decision.question}</div>
                {decision.rationale && (
                  <div className="mt-1 text-[11px] text-text-muted">Rationale: {decision.rationale}</div>
                )}
                <button
                  onClick={() => onOpenRecord?.(decision.filePath)}
                  className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
                >
                  Open decision
                </button>
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={busy === `approve-${decision.id}`}
                    onClick={() => void run('decision.resolve', { decisionId: decision.id, status: 'approved', actor: 'founder-ceo' }, `approve-${decision.id}`)}
                    className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy === `deny-decision-${decision.id}`}
                    onClick={() => void run('decision.resolve', { decisionId: decision.id, status: 'rejected', actor: 'founder-ceo' }, `deny-decision-${decision.id}`)}
                    className="rounded border border-[#D95B5B]/40 bg-[#D95B5B]/5 px-2 py-1 text-[11px] text-[#D95B5B] disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Direction Queue</div>
        {directionQueue.length === 0 ? (
          <div className="text-[12px] text-text-muted">No initiatives waiting for shaping direction.</div>
        ) : (
          directionQueue.map((item) => (
            <div key={item.id} className="mb-2 rounded border border-border/70 p-2 text-[12px] last:mb-0">
              <div className="font-medium">{item.title}</div>
              <div className="text-text-muted">{stageLabel(item.stage)} · {item.status}</div>
              <div className="mt-1 text-text-secondary">{item.summary}</div>
              <button
                onClick={() => onOpenRecord?.(item.filePath)}
                className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
              >
                Open initiative
              </button>
              <div className="mt-2">
                <button
                  disabled={busy === `tick-${item.id}`}
                  onClick={() => void run('workflow.tick', {}, `tick-${item.id}`)}
                  className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
                >
                  Advance Next Stage
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {error && <div className="mt-3 rounded border border-[#D95B5B]/40 bg-[#D95B5B]/10 p-2 text-[12px] text-[#D95B5B]">{error}</div>}
    </div>
  )
}
