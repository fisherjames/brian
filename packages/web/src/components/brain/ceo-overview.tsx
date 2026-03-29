'use client'

import { useCallback, useEffect, useState } from 'react'

type CompanyState = {
  directorInbox: Array<{ status: 'green' | 'yellow' | 'red'; confidence: number }>
  initiatives: Array<{ id: string; title: string; stage: string; status: string; summary: string; filePath: string }>
  pendingDecisions: Array<{ id: string; title: string; question: string; rationale: string; status: string; filePath: string }>
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
  const [state, setState] = useState<CompanyState | null>(null)
  const [briefings, setBriefings] = useState<Briefing[]>([])

  const refresh = useCallback(async () => {
    const [stateRes, briefingsRes] = await Promise.all([
      fetch(`/api/v2/brains/${brainId}/company-state`, { cache: 'no-store' }),
      fetch(`/api/v2/brains/${brainId}/director-briefings`, { cache: 'no-store' }),
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

  return (
    <div className="h-full overflow-y-auto bg-[#F7F6F1] p-4 text-[13px] text-text">
      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="text-[11px] uppercase tracking-wide text-text-muted">CEO Mission</div>
        <div className="text-[12px] text-text-secondary">Initiatives, decisions, briefings, and blockers only.</div>
        <div className="mt-1 text-[12px] text-text-muted">
          Director status: {director?.status ?? 'unknown'} · confidence {director?.confidence ?? 0}%
        </div>
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
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Decisions</div>
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
          </div>
        ))}
        {(state?.pendingDecisions ?? []).length === 0 && <div className="text-[12px] text-text-muted">No pending decisions.</div>}
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
    </div>
  )
}
