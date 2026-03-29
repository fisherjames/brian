'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type McpResult<T = unknown> = {
  ok: boolean
  result?: T
  error?: string
}

type Pending = {
  resolve: (value: McpResult) => void
}

export function useMcpTeam(brainId: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const pendingRef = useRef<Map<string, Pending>>(new Map())
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<
    Array<{
      id?: string
      at: string
      message: string
      actor?: string
      layer?: string
      stage?: string
      kind?: 'info' | 'status' | 'blocker'
      initiativeId?: string
      initiativeTitle?: string
      discussionId?: string
      discussionTitle?: string
      decisionQuestion?: string
      refs?: string[]
    }>
  >([])

  useEffect(() => {
    let cancelled = false

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) {
          try { ws.close() } catch {}
          return
        }
        reconnectAttemptsRef.current = 0
        setConnected(true)
      }
      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        for (const pending of pendingRef.current.values()) {
          pending.resolve({ ok: false, error: 'mcp_socket_closed' })
        }
        pendingRef.current.clear()
        if (cancelled) return
        const attempt = reconnectAttemptsRef.current + 1
        reconnectAttemptsRef.current = attempt
        const delayMs = Math.min(5000, 400 * 2 ** Math.min(attempt, 4))
        reconnectTimerRef.current = window.setTimeout(() => {
          if (!cancelled) connect()
        }, delayMs)
      }
      ws.onerror = () => {
        setConnected(false)
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'mcp.result' && msg.id) {
            const pending = pendingRef.current.get(String(msg.id))
            if (pending) {
              pending.resolve({ ok: Boolean(msg.ok), result: msg.result, error: msg.error })
              pendingRef.current.delete(String(msg.id))
            }
          }
          if (msg.type === 'mcp.event' && msg.channel === 'team') {
            if (msg.brainId && String(msg.brainId) !== brainId) return
            setEvents((prev) => [
              {
                id: typeof msg.id === 'string' ? msg.id : undefined,
                at: msg.at ?? new Date().toISOString(),
                message: String(msg.message ?? ''),
                actor: typeof msg.actor === 'string' ? msg.actor : undefined,
                layer: typeof msg.layer === 'string' ? msg.layer : undefined,
                stage: typeof msg.stage === 'string' ? msg.stage : undefined,
                kind: msg.kind === 'status' || msg.kind === 'blocker' ? msg.kind : 'info',
                initiativeId: typeof msg.initiativeId === 'string' ? msg.initiativeId : undefined,
                initiativeTitle: typeof msg.initiativeTitle === 'string' ? msg.initiativeTitle : undefined,
                discussionId: typeof msg.discussionId === 'string' ? msg.discussionId : undefined,
                discussionTitle: typeof msg.discussionTitle === 'string' ? msg.discussionTitle : undefined,
                decisionQuestion: typeof msg.decisionQuestion === 'string' ? msg.decisionQuestion : undefined,
                refs: Array.isArray(msg.refs) ? msg.refs.filter((r: unknown) => typeof r === 'string') as string[] : [],
              },
              ...prev,
            ].slice(0, 40))
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      for (const pending of pendingRef.current.values()) {
        pending.resolve({ ok: false, error: 'mcp_socket_closed' })
      }
      pendingRef.current.clear()
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.close()
      wsRef.current = null
    }
  }, [brainId])

  const call = useCallback(
    <T,>(method: string, params: Record<string, unknown> = {}) =>
      new Promise<McpResult<T>>((resolve) => {
        const ws = wsRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          resolve({ ok: false, error: 'mcp_not_connected' })
          return
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        pendingRef.current.set(id, { resolve: resolve as (value: McpResult) => void })
        ws.send(
          JSON.stringify({
            type: 'mcp.call',
            channel: 'team',
            id,
            brainId,
            method,
            params,
          })
        )
        window.setTimeout(() => {
          if (pendingRef.current.has(id)) {
            pendingRef.current.delete(id)
            resolve({ ok: false, error: 'mcp_timeout' })
          }
        }, 8000)
      }),
    [brainId]
  )

  return { connected, events, call }
}
