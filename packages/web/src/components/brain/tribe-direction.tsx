'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMcpTeam } from '@/hooks/use-mcp-team'

type Decision = {
  id: string
  title: string
  status: 'pending' | 'approved' | 'rejected'
  question: string
  rationale: string
  initiativeId?: string
  requiredContextLevel: 'squad' | 'tribe' | 'director' | 'ceo'
  authorityScope: Array<'squad' | 'tribe' | 'director' | 'ceo'>
  decisionPolicy: 'auto_infer' | 'delegated_approval' | 'ceo_required'
  inferable: boolean
  confidence: number
  escalationReason: string
  escalationPath: Array<'squad' | 'tribe' | 'director' | 'ceo'>
  filePath: string
}

function normalizeDecision(raw: Partial<Decision> & { id?: string; title?: string; question?: string }): Decision {
  return {
    id: raw.id ?? '',
    title: raw.title ?? 'Untitled decision',
    status: raw.status === 'approved' || raw.status === 'rejected' ? raw.status : 'pending',
    question: raw.question ?? '',
    rationale: raw.rationale ?? '',
    initiativeId: raw.initiativeId,
    requiredContextLevel: raw.requiredContextLevel ?? 'tribe',
    authorityScope: Array.isArray(raw.authorityScope) ? raw.authorityScope : ['tribe'],
    decisionPolicy: raw.decisionPolicy ?? 'delegated_approval',
    inferable: Boolean(raw.inferable),
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
    escalationReason: raw.escalationReason ?? '',
    escalationPath: Array.isArray(raw.escalationPath) ? raw.escalationPath : ['tribe'],
    filePath: raw.filePath ?? '',
  }
}

export default function TribeDirection({
  brainId,
  onOpenRecord,
}: {
  brainId: string
  onOpenRecord?: (path: string) => void
}) {
  const { call, connected } = useMcpTeam(brainId)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/brains/${brainId}/decisions`, { cache: 'no-store' })
    if (!res.ok) return
    const json = (await res.json()) as { decisions?: Array<Partial<Decision>> }
    setDecisions(Array.isArray(json.decisions) ? json.decisions.map((item) => normalizeDecision(item ?? {})) : [])
  }, [brainId])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 4000)
    return () => clearInterval(id)
  }, [refresh])

  const inbox = useMemo(
    () => decisions.filter((item) => item.status === 'pending' && item.requiredContextLevel === 'tribe'),
    [decisions]
  )

  const resolve = useCallback(async (decisionId: string, status: 'approved' | 'rejected') => {
    setBusy(`${status}-${decisionId}`)
    setError('')
    try {
      const res = await call('decision.resolve', { decisionId, status, actor: 'tribe-head' })
      if (!res.ok) throw new Error(res.error || `decision_${status}_failed`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : `decision_${status}_failed`)
    } finally {
      setBusy(null)
    }
  }, [call, refresh])

  const escalate = useCallback(async (decision: Decision) => {
    setBusy(`escalate-${decision.id}`)
    setError('')
    try {
      const escalationPath = Array.from(new Set([...decision.escalationPath, 'tribe', 'director']))
      const record = await call('decision.record', {
        initiativeId: decision.initiativeId,
        title: `${decision.title} · Director escalation`,
        question: decision.question,
        rationale: decision.rationale || decision.escalationReason || 'Tribe escalation required.',
        requiredContextLevel: 'director',
        authorityScope: ['director'],
        decisionPolicy: 'delegated_approval',
        inferable: false,
        confidence: Math.min(0.59, decision.confidence || 0.59),
        escalationReason: 'Tribe context insufficient or outside delegated authority.',
        escalationPath,
        actor: 'tribe-head',
      })
      if (!record.ok) throw new Error(record.error || 'decision_escalation_record_failed')
      const close = await call('decision.resolve', { decisionId: decision.id, status: 'rejected', actor: 'tribe-head' })
      if (!close.ok) throw new Error(close.error || 'decision_escalation_close_failed')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'decision_escalation_failed')
    } finally {
      setBusy(null)
    }
  }, [call, refresh])

  return (
    <div className="h-full overflow-y-auto bg-[#F7F6F1] p-4 text-[13px] text-text">
      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-text-muted">Tribe</div>
            <div className="text-[12px] text-text-secondary">Tribe-level decision inbox. Resolve where possible, escalate only when authority/context is insufficient.</div>
          </div>
          <div className={`rounded px-2 py-1 text-[11px] ${connected ? 'bg-[#5B9A65]/10 text-[#5B9A65]' : 'bg-[#D95B5B]/10 text-[#D95B5B]'}`}>
            {connected ? 'MCP connected' : 'MCP offline'}
          </div>
        </div>
      </div>

      <div className="rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Pending Tribe Decisions</div>
        {inbox.length === 0 ? (
          <div className="text-[12px] text-text-muted">No pending tribe decisions.</div>
        ) : (
          inbox.map((item) => (
            <div key={item.id} className="mb-2 rounded border border-border/70 bg-[#FCFCFA] p-2 text-[12px] last:mb-0">
              <div className="font-medium">{item.title}</div>
              <div className="mt-1 text-text-secondary">{item.question}</div>
              <div className="mt-1 text-[11px] text-text-muted">Path: {(item.escalationPath ?? []).join(' -> ') || 'tribe'}</div>
              <div className="text-[11px] text-text-muted">Policy: {item.decisionPolicy} · confidence {Math.round((item.confidence || 0) * 100)}%</div>
              {item.escalationReason && <div className="mt-1 text-[11px] text-text-muted">Escalation reason: {item.escalationReason}</div>}
              <button
                onClick={() => onOpenRecord?.(item.filePath)}
                className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-text/5"
              >
                Open decision
              </button>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  disabled={busy === `approved-${item.id}`}
                  onClick={() => void resolve(item.id, 'approved')}
                  className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={busy === `rejected-${item.id}`}
                  onClick={() => void resolve(item.id, 'rejected')}
                  className="rounded border border-[#D95B5B]/40 bg-[#D95B5B]/5 px-2 py-1 text-[11px] text-[#D95B5B] disabled:opacity-50"
                >
                  Deny
                </button>
                <button
                  disabled={busy === `escalate-${item.id}`}
                  onClick={() => void escalate(item)}
                  className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
                >
                  Escalate to Directors
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
