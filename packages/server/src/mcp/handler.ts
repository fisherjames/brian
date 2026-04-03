import { WebSocket } from 'ws'
import { handleMcpCall, type McpCall } from './dispatch.js'
import { BrainWatcher } from '../fs/brain-watcher.js'
import { onAgentOutput } from '../engine/agent-runner.js'

interface WsMessage {
  type: string
  [key: string]: unknown
}

export function handleWsConnection(ws: WebSocket, brainRoot: string) {
  const watchers = new Map<string, BrainWatcher>()
  const cleanups: Array<() => void> = []

  const unsubOutput = onAgentOutput((line) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'agent.output', line }))
    }
  })
  cleanups.push(unsubOutput)

  ws.on('message', async (raw) => {
    let msg: WsMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'invalid JSON' }))
      return
    }

    if (msg.type === 'subscribe' && typeof msg.brainId === 'string') {
      const brainId = msg.brainId
      if (!watchers.has(brainId)) {
        const watcher = new BrainWatcher(brainRoot, brainId, (event) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event))
          }
        })
        watchers.set(brainId, watcher)
        watcher.start()
      }
      return
    }

    if (msg.type === 'mcp.call') {
      const call = msg as unknown as McpCall
      try {
        const result = await handleMcpCall(call, brainRoot)
        ws.send(JSON.stringify({ type: 'mcp.result', id: call.id, result }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error'
        ws.send(JSON.stringify({ type: 'mcp.result', id: call.id, error: message }))
      }
      return
    }
  })

  ws.on('close', () => {
    for (const cleanup of cleanups) cleanup()
    for (const watcher of watchers.values()) watcher.stop()
    watchers.clear()
  })
}
