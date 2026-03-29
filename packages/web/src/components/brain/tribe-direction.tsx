'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMcpTeam } from '@/hooks/use-mcp-team'

type Initiative = {
  id: string
  title: string
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

function actorForLayer(layer: Discussion['layer']) {
  if (layer === 'tribe') return 'tribe-head'
  return 'product-lead'
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
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [initiativesRes, discussionsRes] = await Promise.all([
      fetch(`/api/v2/brains/${brainId}/initiatives`, { cache: 'no-store' }),
      fetch(`/api/v2/brains/${brainId}/discussions`, { cache: 'no-store' }),
    ])
    if (initiativesRes.ok) {
      const data = (await initiativesRes.json()) as { initiatives?: Initiative[] }
      setInitiatives(Array.isArray(data.initiatives) ? data.initiatives : [])
    }
    if (discussionsRes.ok) {
      const data = (await discussionsRes.json()) as { discussions?: Discussion[] }
      setDiscussions(Array.isArray(data.discussions) ? data.discussions : [])
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

  const tribeEscalations = useMemo(
    () =>
      discussions
        .filter((item) => item.layer !== 'director' && (item.status !== 'resolved' || item.unresolvedQuestions > 0))
        .sort((a, b) => (a.layer === b.layer ? a.title.localeCompare(b.title) : a.layer === 'tribe' ? -1 : 1)),
    [discussions]
  )

  return (
    <div className="h-full overflow-y-auto bg-[#F7F6F1] p-4 text-[13px] text-text">
      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-text-muted">Tribe</div>
            <div className="text-[12px] text-text-secondary">
              Handle tribe-level decisions and escalations reported from squad discussions.
            </div>
          </div>
          <div className={`rounded px-2 py-1 text-[11px] ${connected ? 'bg-[#5B9A65]/10 text-[#5B9A65]' : 'bg-[#D95B5B]/10 text-[#D95B5B]'}`}>
            {connected ? 'MCP connected' : 'MCP offline'}
          </div>
        </div>
      </div>

      <div className="rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Decisions From Squad Escalations</div>
        {tribeEscalations.length === 0 ? (
          <div className="text-[12px] text-text-muted">No pending tribe decisions.</div>
        ) : (
          tribeEscalations.map((item) => (
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
                <div className="mt-2 rounded border border-border/70 bg-white p-1.5 text-[11px] text-text-secondary">
                  {item.thread.slice(-3).map((line, idx) => (
                    <div key={`${item.id}-thread-${idx}`}>- {line}</div>
                  ))}
                </div>
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
                  disabled={busy === `approve-${item.id}` || !item.question.trim()}
                  onClick={() => void run('discussion.resolve', { discussionId: item.id, actor: actorForLayer(item.layer), resolution: 'confirmed' }, `approve-${item.id}`)}
                  className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
                >
                  Approve
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
                  onClick={() => void run('discussion.escalate', { discussionId: item.id, actor: 'tribe-head', message: item.question }, `escalate-${item.id}`)}
                  className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
                >
                  Escalate To Directors
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
