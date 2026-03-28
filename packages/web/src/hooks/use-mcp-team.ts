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
    Array<{ at: string; message: string; actor?: string; stage?: string; kind?: 'info' | 'status' | 'blocker' }>
  >([])

  useEffect(() => {
    let cancelled = false

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
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
        ws.close()
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
                at: msg.at ?? new Date().toISOString(),
                message: String(msg.message ?? ''),
                actor: typeof msg.actor === 'string' ? msg.actor : undefined,
                stage: typeof msg.stage === 'string' ? msg.stage : undefined,
                kind: msg.kind === 'status' || msg.kind === 'blocker' ? msg.kind : 'info',
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
      if (ws) ws.close()
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
