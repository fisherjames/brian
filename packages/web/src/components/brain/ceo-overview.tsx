'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMcpTeam } from '@/hooks/use-mcp-team'

type CompanyState = {
  directorInbox: Array<{ status: 'green' | 'yellow' | 'red'; confidence: number }>
  initiatives: Array<{ id: string; title: string; stage: string; status: string; summary: string; filePath: string }>
  pendingDecisions: Array<{
    id: string
    title: string
    question: string
    rationale: string
    status: string
    filePath: string
    initiativeId?: string
    proposalId?: string
    proposalPath?: string
    discussionId?: string
    discussionPath?: string
  }>
  blockers: Array<{ code: string; message: string; class: 'hard_blocker' }>
  advisories?: Array<{ code: string; message: string; class: 'advisory' }>
}

type Briefing = {
  id: string
  title: string
  summary: string
  at: string
  published: boolean
  filePath: string
}

function stageLabel(stage: string) {
  return stage.replace(/_/g, ' ')
}

function prioritizeInitiatives(items: CompanyState['initiatives']) {
  const score = (item: CompanyState['initiatives'][number]) => {
    if (item.status !== 'completed' && item.stage === 'execution') return 4
    if (item.status !== 'completed' && item.stage === 'director_decision') return 3
    if (item.status !== 'completed') return 2
    return 1
  }
  return [...items].sort((a, b) => score(b) - score(a))
}

export default function CeoOverview({
  brainId,
  onOpenRecord,
}: {
  brainId: string
  onOpenRecord?: (path: string) => void
}) {
  const { call, connected } = useMcpTeam(brainId)
  const [state, setState] = useState<CompanyState | null>(null)
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [newInitiativeTitle, setNewInitiativeTitle] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [stateRes, briefingsRes] = await Promise.all([
      fetch(`/api/brains/${brainId}/company-state`, { cache: 'no-store' }),
      fetch(`/api/brains/${brainId}/briefings`, { cache: 'no-store' }),
    ])
    if (stateRes.ok) setState((await stateRes.json()) as CompanyState)
    if (briefingsRes.ok) {
      const json = (await briefingsRes.json()) as { briefings?: Briefing[] }
      setBriefings(Array.isArray(json.briefings) ? json.briefings : [])
    }
  }, [brainId])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => { if (!document.hidden) void refresh() }, 4000)
    return () => clearInterval(id)
  }, [refresh])

  const director = state?.directorInbox?.[0]

  async function createInitiativeFlow() {
    const title = newInitiativeTitle.trim()
    if (!title) return
    setBusy('create')
    setError('')
    try {
      const intent = await call<{ message?: string }>('company.intent.capture', {
        title,
        summary: `CEO-initiated initiative: ${title}`,
        actor: 'founder-ceo',
      })
      if (!intent.ok || !intent.result?.message) throw new Error(intent.error || 'intent_capture_failed')
      const initiativeId = intent.result.message.split(':')[1]?.trim()
      if (!initiativeId) throw new Error('initiative_id_missing')

      const proposed = await call('initiative.propose', {
        initiativeId,
        title,
        summary: `Director proposal drafted for ${title}`,
        actor: 'director',
      })
      if (!proposed.ok) throw new Error(proposed.error || 'initiative_propose_failed')

      const discussion = await call<{ message?: string }>('discussion.open', {
        initiativeId,
        layer: 'director',
        actor: 'director',
        title: `${title} director discussion`,
        question: `What option should we recommend to CEO for "${title}" and why?`,
        questions: [
          `What option should we recommend for "${title}"?`,
          'Which risks are acceptable now versus deferred?',
          'What verification evidence is mandatory before merge?',
        ],
      })
      if (!discussion.ok || !discussion.result?.message) throw new Error(discussion.error || 'director_discussion_open_failed')
      const discussionId = discussion.result.message.split(':')[1]?.trim()
      if (!discussionId) throw new Error('discussion_id_missing')

      const proposal = await call<{
        proposal?: { id: string; filePath: string; decisionQuestion: string; recommendation: string; discussionId: string }
      }>('proposal.generate', {
        initiativeId,
        discussionId,
        actor: 'director',
      })
      if (!proposal.ok || !proposal.result?.proposal) throw new Error(proposal.error || 'proposal_generate_failed')
      const proposalRef = proposal.result.proposal

      const decision = await call('decision.record', {
        initiativeId,
        title: `Approve director proposal: ${title}`,
        question: proposalRef.decisionQuestion,
        rationale: `Director has returned a full proposal packet. Recommendation: ${proposalRef.recommendation}`,
        requiredContextLevel: 'ceo',
        authorityScope: ['ceo'],
        decisionPolicy: 'ceo_required',
        inferable: false,
        confidence: 0.45,
        escalationReason: 'CEO approval required before shaping.',
        escalationPath: ['squad', 'tribe', 'director', 'ceo'],
        actor: 'director',
        proposalId: proposalRef.id,
        proposalPath: proposalRef.filePath,
        discussionId: proposalRef.discussionId,
        discussionPath: `brian/discussions/${proposalRef.discussionId}.md`,
      })
      if (!decision.ok) throw new Error(decision.error || 'decision_record_failed')

      setNewInitiativeTitle('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create_flow_failed')
    } finally {
      setBusy(null)
    }
  }

  async function resolveDecision(decisionId: string, initiativeId: string | undefined, status: 'approved' | 'rejected') {
    setBusy(`${status}-${decisionId}`)
    setError('')
    try {
      let feedback = ''
      if (status === 'rejected') {
        const captured = window.prompt('Provide CEO feedback to reopen director discussion', '')
        if (captured === null) {
          setBusy(null)
          return
        }
        feedback = captured.trim()
        if (!feedback) throw new Error('feedback_required_for_rejection')
      }
      const resolved = await call('decision.resolve', {
        decisionId,
        status,
        actor: 'founder-ceo',
        ...(status === 'rejected' ? { feedback } : {}),
      })
      if (!resolved.ok) throw new Error(resolved.error || 'decision_resolve_failed')
      if (status === 'approved' && initiativeId) {
        const shaped = await call('initiative.shape', {
          initiativeId,
          actor: 'tribe-head',
          summary: 'CEO approved proposal; tribe shaping begins.',
        })
        if (!shaped.ok) throw new Error(shaped.error || 'initiative_shape_failed')
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'decision_resolution_failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#F7F6F1] p-4 text-[13px] text-text">
      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="text-[11px] uppercase tracking-wide text-text-muted">CEO Mission</div>
        <div className="text-[12px] text-text-secondary">CEO-by-exception: fully escalated decisions, strategic blockers, and briefings.</div>
        <div className="mt-1 text-[12px] text-text-muted">
          Director status: {director?.status ?? 'unknown'} · confidence {director?.confidence ?? 0}%
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={newInitiativeTitle}
            onChange={(event) => setNewInitiativeTitle(event.target.value)}
            placeholder="New initiative title"
            className="min-w-[220px] flex-1 rounded border border-border px-2 py-1.5 text-[12px]"
          />
          <button
            onClick={() => void createInitiativeFlow()}
            disabled={!connected || busy === 'create' || !newInitiativeTitle.trim()}
            className="rounded border border-border px-2.5 py-1.5 text-[12px] disabled:opacity-50"
          >
            Create Initiative
          </button>
        </div>
        <div className="mt-1 text-[11px] text-text-muted">Creates initiative, requests director proposal, and opens CEO decision gate.</div>
      </div>

      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Initiatives</div>
        {prioritizeInitiatives(state?.initiatives ?? []).slice(0, 8).map((initiative) => (
          <div key={initiative.id} className="mb-2 rounded border border-border/70 bg-[#FCFCFA] p-2 text-[12px] last:mb-0">
            <div className="font-medium">{initiative.title}</div>
            <div className="text-text-muted">{stageLabel(initiative.stage)} · {initiative.status}</div>
            {initiative.summary && <div className="mt-1 text-text-secondary">{initiative.summary}</div>}
            <button
              onClick={() => onOpenRecord?.(initiative.filePath)}
              className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
            >
              Open note
            </button>
          </div>
        ))}
        {(state?.initiatives ?? []).length === 0 && <div className="text-[12px] text-text-muted">No initiatives yet.</div>}
      </div>

      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Escalated CEO Decisions</div>
        {(state?.pendingDecisions ?? []).map((decision) => (
          <div key={decision.id} className="mb-2 rounded border border-border/70 bg-[#FCFCFA] p-2 text-[12px] last:mb-0">
            <div className="font-medium">{decision.title}</div>
            <div className="mt-1 text-text-secondary">{decision.question}</div>
            {decision.rationale && <div className="mt-1 text-[11px] text-text-muted">Rationale: {decision.rationale}</div>}
            <button
              onClick={() => onOpenRecord?.(decision.filePath)}
              className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
            >
              Open decision
            </button>
            {decision.discussionPath && (
              <button
                onClick={() => onOpenRecord?.(decision.discussionPath!)}
                className="ml-2 mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
              >
                Open discussion
              </button>
            )}
            {decision.proposalPath && (
              <button
                onClick={() => onOpenRecord?.(decision.proposalPath!)}
                className="ml-2 mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
              >
                Open proposal
              </button>
            )}
            {decision.initiativeId && (
              <a
                href={`/api/brains/${brainId}/proposals/${decision.initiativeId}`}
                download
                className="ml-2 mt-1 inline-block rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
              >
                Download proposal PDF
              </a>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                disabled={busy === `approved-${decision.id}`}
                onClick={() => void resolveDecision(decision.id, decision.initiativeId, 'approved')}
                className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
              >
                Accept
              </button>
              <button
                disabled={busy === `rejected-${decision.id}`}
                onClick={() => void resolveDecision(decision.id, decision.initiativeId, 'rejected')}
                className="rounded border border-[#D95B5B]/40 bg-[#D95B5B]/5 px-2 py-1 text-[11px] text-[#D95B5B] disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
        {(state?.pendingDecisions ?? []).length === 0 && <div className="text-[12px] text-text-muted">No CEO-required decisions pending.</div>}
      </div>

      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Briefings</div>
        {briefings.slice(0, 12).map((briefing) => (
          <div key={briefing.id} className="mb-2 rounded border border-border/70 bg-[#FCFCFA] p-2 text-[12px] last:mb-0">
            <div className="font-medium">{briefing.title}</div>
            <div className="text-[11px] text-text-muted">{new Date(briefing.at).toLocaleString('en-GB')} · {briefing.published ? 'published' : 'draft'}</div>
            <div className="mt-1 text-text-secondary">{briefing.summary}</div>
            <button
              onClick={() => onOpenRecord?.(briefing.filePath)}
              className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
            >
              Open briefing
            </button>
          </div>
        ))}
        {briefings.length === 0 && <div className="text-[12px] text-text-muted">No briefings yet.</div>}
      </div>

      <div className="rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Blockers</div>
        {(state?.blockers ?? []).map((blocker) => (
          <div key={blocker.code} className="mb-2 rounded border border-[#D95B5B]/35 bg-[#D95B5B]/5 p-2 text-[12px] text-[#8B2E2E] last:mb-0">
            {blocker.message}
          </div>
        ))}
        {(state?.blockers ?? []).length === 0 && <div className="text-[12px] text-text-muted">No blockers.</div>}
        {(state?.advisories?.length ?? 0) > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">Advisories</div>
            {state?.advisories?.map((item) => (
              <div key={item.code} className="mb-1 rounded border border-[#E8A830]/30 bg-[#E8A830]/8 p-2 text-[12px] text-[#8C6A1A]">
                {item.message}
              </div>
            ))}
          </div>
        )}
      </div>
      {error && <div className="mt-3 rounded border border-[#D95B5B]/40 bg-[#D95B5B]/10 p-2 text-[12px] text-[#D95B5B]">{error}</div>}
    </div>
  )
}
