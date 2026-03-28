'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  CheckSquare,
  Clock,
  Copy,
  ListChecks,
  PanelRightClose,
  PanelRightOpen,
  Square,
  Terminal,
} from 'lucide-react'

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

interface RightPaneProps {
  executionSteps: ExecutionStep[]
  handoffs: Handoff[]
  onToggleStep?: (stepId: string, currentStatus: string) => void
  onSelectHandoff?: (fileId: string, filePath: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

const PHASE_TITLES: Record<number, string> = {
  1: 'Foundation',
  2: 'Brain View',
  3: 'MCP + CLI',
  4: 'Polish + Launch',
  99: 'Team Board',
}

function formatDateTime(createdAt: string | null, dateFallback: string): string {
  try {
    if (createdAt) {
      const d = new Date(createdAt)
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    }
    const d = new Date(dateFallback)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateFallback
  }
}

function ResumeBrainCta() {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText('brian work')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-2 mt-2 mb-1 rounded-xl border border-border bg-bg-section px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="flex-1 text-[12px] font-semibold text-text">Continue workflow</span>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#2B2A25] px-3 py-2.5">
        <code className="flex-1 text-[13px] font-mono text-[#E8E6E0]">
          <span className="text-[#27C93F]">$</span> brian work
        </code>
        <button
          onClick={handleCopy}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: copied ? '#5B9A65' : '#4A7FE5' }}
          title="Copy command"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5 text-white" />}
        </button>
      </div>
    </div>
  )
}

function StepList({
  steps,
  onToggleStep,
}: {
  steps: ExecutionStep[]
  onToggleStep?: (stepId: string, currentStatus: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      {steps.map((step) => {
        const canToggle = !step.id.startsWith('team-step-') && Boolean(onToggleStep)
        return (
          <div key={step.id} className="rounded-md border border-border bg-bg-section px-2 py-1.5">
            <div className="flex items-center gap-2">
              <button
                disabled={!canToggle}
                onClick={() => canToggle && onToggleStep?.(step.id, step.status)}
                className={`shrink-0 text-text-muted ${canToggle ? 'hover:text-leaf' : 'cursor-default opacity-40'}`}
              >
                {step.status === 'completed' ? <CheckSquare className="h-3.5 w-3.5 text-leaf" /> : <Square className="h-3.5 w-3.5" />}
              </button>
              <span className="text-[10px] text-text-muted">{step.phase_number}.{step.step_number}</span>
              <p className="min-w-0 truncate text-[12px] text-text-secondary">{step.title}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

type ViewMode = 'plan' | 'log'

export default function RightPane({
  executionSteps,
  handoffs,
  onToggleStep,
  onSelectHandoff,
  collapsed,
  onToggleCollapsed,
}: RightPaneProps) {
  const [activeView, setActiveView] = useState<ViewMode>('plan')

  const grouped = useMemo(() => {
    const byPhase = new Map<number, ExecutionStep[]>()
    for (const step of executionSteps) {
      const list = byPhase.get(step.phase_number) ?? []
      list.push(step)
      byPhase.set(step.phase_number, list)
    }
    return [...byPhase.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([phase, steps]) => ({
        phase,
        title: PHASE_TITLES[phase] ?? `Phase ${phase}`,
        steps: steps.sort((a, b) => a.step_number - b.step_number),
      }))
  }, [executionSteps])

  const counts = useMemo(() => ({
    inProgress: executionSteps.filter((s) => s.status === 'in_progress').length,
    blocked: executionSteps.filter((s) => s.status === 'blocked').length,
    completed: executionSteps.filter((s) => s.status === 'completed').length,
  }), [executionSteps])

  return (
    <aside className="flex h-full shrink-0 flex-col border-l border-border bg-bg/80 backdrop-blur-sm lg:bg-bg/50 lg:backdrop-blur-none">
      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        <button
          onClick={onToggleCollapsed}
          className="rounded p-1 text-text-muted transition-colors hover:bg-text/5 hover:text-text-secondary"
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
        {!collapsed && (
          <>
            <button onClick={() => setActiveView('plan')} className="rounded p-1 transition-colors hover:bg-text/5" title="Execution Plan">
              <ListChecks className="h-4 w-4" style={{ color: activeView === 'plan' ? '#5B9A65' : '#9B9A92' }} />
            </button>
            <button onClick={() => setActiveView('log')} className="rounded p-1 transition-colors hover:bg-text/5" title="Session Log">
              <Clock className="h-4 w-4" style={{ color: activeView === 'log' ? '#5B9A65' : '#9B9A92' }} />
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          {activeView === 'plan' ? (
            <>
              <ResumeBrainCta />
              <div className="mx-2 mt-2 grid grid-cols-3 gap-1.5">
                <div className="rounded-md border border-border bg-bg-section px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-text-muted">In Progress</p>
                  <p className="text-[14px] font-semibold" style={{ color: '#E8A830' }}>{counts.inProgress}</p>
                </div>
                <div className="rounded-md border border-border bg-bg-section px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-text-muted">Blocked</p>
                  <p className="text-[14px] font-semibold" style={{ color: '#D95B5B' }}>{counts.blocked}</p>
                </div>
                <div className="rounded-md border border-border bg-bg-section px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-text-muted">Done</p>
                  <p className="text-[14px] font-semibold text-leaf">{counts.completed}</p>
                </div>
              </div>

              {grouped.length === 0 ? (
                <div className="flex h-full items-center justify-center px-3 py-8">
                  <p className="text-[12px] text-text-muted">No execution steps yet</p>
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.phase} className="mt-2">
                    <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                      Phase {group.phase}: {group.title}
                    </p>
                    <StepList steps={group.steps} onToggleStep={onToggleStep} />
                  </div>
                ))
              )}
            </>
          ) : handoffs.length === 0 ? (
            <div className="flex h-full items-center justify-center px-3 py-8">
              <p className="text-[12px] text-text-muted">No sessions yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 px-2 py-2">
              {[...handoffs]
                .sort((a, b) => b.session_number - a.session_number)
                .map((h) => (
                  <button
                    key={h.id}
                    onClick={() => onSelectHandoff?.(h.id, h.file_path)}
                    className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-text/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-full bg-leaf px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                        Session {h.session_number}
                      </span>
                      <span className="text-[10px] text-text-muted">{formatDateTime(h.created_at, h.date)}</span>
                    </div>
                    <p className="line-clamp-2 text-[12px] leading-snug text-text-secondary">{h.summary}</p>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
