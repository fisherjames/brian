'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type CompanyState = {
  initiatives?: Array<{ stage: string; status: string }>
  pendingDecisions?: Array<{ id: string }>
  activeEscalations?: Array<{ id: string; layer: 'squad' | 'tribe' | 'director'; status: 'open' | 'escalated' | 'resolved' }>
  executionActive?: number
}

const STAGES = [
  { id: 'intent', label: 'Intent' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'leadership_discussion', label: 'Discussion' },
  { id: 'director_decision', label: 'Decision' },
  { id: 'tribe_shaping', label: 'Shaping' },
  { id: 'squad_planning', label: 'Planning' },
  { id: 'execution', label: 'Execution' },
] as const

function stageIndex(stageId: string) {
  return Math.max(0, STAGES.findIndex((stage) => stage.id === stageId))
}

function deriveCurrentStage(state: CompanyState | null): string {
  if (!state) return 'intent'
  if ((state.pendingDecisions?.length ?? 0) > 0) return 'director_decision'
  if ((state.activeEscalations?.some((item) => item.status !== 'resolved') ?? false)) return 'leadership_discussion'
  if ((state.executionActive ?? 0) > 0) return 'execution'
  const open = (state.initiatives ?? []).find((item) => item.status !== 'completed')
  return open?.stage ?? 'intent'
}

function nextActionForTab(tabId: string): string {
  if (tabId === 'mission') return 'Define/approve priorities and clear pending decisions.'
  if (tabId === 'directors') return 'Resolve pending decisions/escalations with explicit yes/no or option answers.'
  if (tabId === 'tribe-direction') return 'Resolve open questions, shape scope, and escalate only when needed.'
  if (tabId === 'mission-control') return 'Run one task, verify outcome, then merge safely.'
  if (tabId === 'agents-workflow') return 'Adjust personas, rules, and skills only when flow quality drops.'
  return 'Inspect notes and graph only when you need deeper context.'
}

export default function WorkflowRibbon({ brainId, activeTabId }: { brainId: string; activeTabId: string }) {
  const [state, setState] = useState<CompanyState | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/v2/brains/${brainId}/company-state`, { cache: 'no-store' })
    if (!res.ok) return
    setState((await res.json()) as CompanyState)
  }, [brainId])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const currentStage = deriveCurrentStage(state)
  const currentIndex = stageIndex(currentStage)

  const summary = useMemo(() => {
    const decisions = state?.pendingDecisions?.length ?? 0
    const escalations = state?.activeEscalations?.filter((item) => item.status !== 'resolved').length ?? 0
    const execution = state?.executionActive ?? 0
    return `${decisions} pending decisions · ${escalations} active escalations · ${execution} active execution`
  }, [state])

  return (
    <div className="border-b border-border bg-[#F7F6F1] px-3 py-2">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <div className="uppercase tracking-wide text-text-muted">Workflow Contract</div>
        <div className="text-text-secondary">{summary}</div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {STAGES.map((stage, idx) => {
          const complete = idx < currentIndex
          const active = idx === currentIndex
          return (
            <div
              key={stage.id}
              className={`rounded border px-2 py-1 text-[11px] ${
                complete
                  ? 'border-[#5B9A65]/40 bg-[#5B9A65]/10 text-[#2f6638]'
                  : active
                    ? 'border-[#4A9FD9]/40 bg-[#4A9FD9]/10 text-[#2a6d96]'
                    : 'border-border bg-white text-text-muted'
              }`}
            >
              {stage.label}
            </div>
          )
        })}
      </div>
      <div className="text-[12px] text-text-secondary">
        Now in <span className="font-medium text-text">{STAGES[currentIndex]?.label ?? 'Intent'}</span>. {nextActionForTab(activeTabId)}
      </div>
    </div>
  )
}
