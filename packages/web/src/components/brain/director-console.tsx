'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMcpTeam } from '@/hooks/use-mcp-team'

type Discussion = {
  id: string
  title: string
  layer: 'squad' | 'tribe' | 'director'
  status: 'open' | 'resolved' | 'escalated'
  unresolvedQuestions: number
  question: string
  thread: string[]
  initiativeId?: string
  escalationState: 'none' | 'pending' | 'resolved'
  filePath: string
}

export default function DirectorConsole({ brainId }: { brainId: string }) {
  const { call, connected } = useMcpTeam(brainId)
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const discussionsRes = await fetch(`/api/v2/brains/${brainId}/discussions`, { cache: 'no-store' })
    if (discussionsRes.ok) {
      const json = (await discussionsRes.json()) as { discussions?: Discussion[] }
      setDiscussions(Array.isArray(json.discussions) ? json.discussions : [])
    }
  }, [brainId])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 4000)
    return () => clearInterval(id)
  }, [refresh])

  const run = useCallback(async (method: string, params: Record<string, unknown>, key: string) => {
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
  }, [call, refresh])

  const directorEscalations = useMemo(
    () => discussions.filter((item) => item.layer === 'director' && (item.status !== 'resolved' || item.escalationState === 'pending' || item.unresolvedQuestions > 0)),
    [discussions]
  )

  return (
    <div className="h-full overflow-y-auto bg-[#F7F6F1] p-4 text-[13px] text-text">
      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-text-muted">Directors</div>
            <div className="text-[12px] text-text-secondary">Handle director-level decisions and escalations from tribe reporters.</div>
          </div>
          <div className={`rounded px-2 py-1 text-[11px] ${connected ? 'bg-[#5B9A65]/10 text-[#5B9A65]' : 'bg-[#D95B5B]/10 text-[#D95B5B]'}`}>
            {connected ? 'MCP connected' : 'MCP offline'}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Decisions From Tribe Escalations</div>
        {directorEscalations.length === 0 ? (
          <div className="text-[12px] text-text-muted">No pending director decisions.</div>
        ) : (
          directorEscalations.map((item) => (
            <div key={item.id} className="mb-2 rounded border border-[#D95B5B]/25 bg-[#D95B5B]/5 p-2 text-[12px] last:mb-0">
              <div className="font-medium">{item.title}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-text-muted">Question</div>
              <div className="text-text-secondary">{item.question || 'No explicit question recorded.'}</div>
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
                    await run('discussion.respond', { discussionId: item.id, actor: 'director', message }, `respond-${item.id}`)
                    setResponses((prev) => ({ ...prev, [item.id]: '' }))
                  }}
                  className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
                >
                  Respond
                </button>
                <button
                  disabled={busy === `approve-${item.id}` || !item.question.trim()}
                  onClick={() => void run('discussion.resolve', { discussionId: item.id, actor: 'director', resolution: 'confirmed' }, `approve-${item.id}`)}
                  className="rounded border border-[#5B9A65]/40 bg-[#5B9A65]/5 px-2 py-1 text-[11px] text-[#5B9A65] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={busy === `deny-${item.id}` || !item.question.trim()}
                  onClick={() => void run('discussion.resolve', { discussionId: item.id, actor: 'director', resolution: 'denied' }, `deny-${item.id}`)}
                  className="rounded border border-[#D95B5B]/40 bg-[#D95B5B]/5 px-2 py-1 text-[11px] text-[#D95B5B] disabled:opacity-50"
                >
                  Deny
                </button>
                <button
                  disabled={busy === `escalate-${item.id}` || !item.question.trim()}
                  onClick={() => void run('discussion.escalate', { discussionId: item.id, actor: 'director', message: item.question }, `escalate-${item.id}`)}
                  className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
                >
                  Escalate to CEO
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
