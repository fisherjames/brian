import express from 'express'
import cors from 'cors'
import path from 'path'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { handleWsConnection } from './mcp/handler.js'
import { mcpRouter } from './mcp/router.js'
import { brainRouter } from './routes/brain.js'
import { healthRouter } from './routes/health.js'
import { initializeDefaultMethods } from './governance/policy-registry.js'
import { startMemuIngestion } from './memu/ingestion.js'

const PORT = parseInt(process.env.PORT ?? '3010', 10)
const BRAIN_ROOT = process.env.BRAIN_ROOT ?? process.cwd()

const ALL_MCP_METHODS = [
  'company.intent.capture',
  'initiative.propose',
  'initiative.shape',
  'initiative.plan',
  'initiative.execute',
  'initiative.list',
  'task.list',
  'discussion.open',
  'discussion.respond',
  'decision.record',
  'decision.list_pending',
  'briefing.generate',
  'workflow.tick',
  'workflow.get_stage',
  'workflow.seed_backlog',
  'team.get_snapshot',
  'team.get_squads',
  'team.get_live_demo_gate',
  'team.set_live_demo_gate',
  'team.start_next_task',
  'team.run_verification_suite',
  'team.get_policy_status',
  'team.merge_queue_dry_run',
  'team.merge_queue_execute',
  'team.merge_queue_ship',
  'team.create_mission_branch',
  'team.record_human_verification',
  'team.capture_failure_bundle',
  'team.get_tasks',
  'team.get_execution_state',
  'team.get_run_state',
  'team.stop_task',
  'team.complete_task',
  'team.subscribe_output',
  'team.upsert_squad',
  'team.set_active_squad',
  'team.remove_squad',
  'config.get_skills',
  'config.get_rules',
]

initializeDefaultMethods(ALL_MCP_METHODS)

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api/health', healthRouter)
app.use('/api/brain', brainRouter(BRAIN_ROOT))
app.use('/api/mcp', mcpRouter(BRAIN_ROOT))

const server = createServer(app)
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  if (url.pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws) => handleWsConnection(ws, BRAIN_ROOT))

server.listen(PORT, () => {
  console.log(`Brian server listening on http://localhost:${PORT}`)
  console.log(`WebSocket on ws://localhost:${PORT}/ws`)
  console.log(`Brain root: ${BRAIN_ROOT}`)

  const brainDir = path.join(BRAIN_ROOT, 'brian')
  startMemuIngestion(brainDir).catch(() => {
    console.log('memU ingestion start skipped')
  })
})
