import {
  runVerificationSuite,
  captureFailureBundle,
  generateRemediationTask,
} from '../../governance/verification.js'
import {
  dryRunMerge,
  executeMerge,
  pushToRemote,
  getCurrentBranch,
  createMissionBranch,
} from '../../governance/branch-policy.js'
import { checkPolicyForStage } from '../../governance/policy-registry.js'
import { BrainFs } from '../../fs/brain-fs.js'
import { SquadsStore } from '../../fs/squads-store.js'
import { parseExecutionPlan } from '../../engine/task-parser.js'
import {
  startNextTask,
  stopCurrentTask,
  completeCurrentTask,
  getExecutionState,
} from '../../engine/executor.js'
import { getRunState, onAgentOutput } from '../../engine/agent-runner.js'

type McpHandler = (
  params: Record<string, unknown>,
  brainRoot: string,
  brainId?: string,
) => Promise<unknown>

let liveDemoGateReady = false

export const teamHandlers: Record<string, McpHandler> = {
  'team.get_snapshot': async (_params, brainRoot, brainId) => {
    const fs = new BrainFs(brainRoot)
    const snapshot = fs.getSnapshot(brainId ?? '')
    const state = getExecutionState(brainRoot)
    return { ...snapshot, executionState: state }
  },

  'team.get_squads': async (_params, brainRoot) => {
    const store = new SquadsStore(brainRoot)
    return { squads: store.list() }
  },

  'team.upsert_squad': async (params, brainRoot) => {
    const store = new SquadsStore(brainRoot)
    const squad = store.upsert(params.squad as Parameters<SquadsStore['upsert']>[0])
    return { squad }
  },

  'team.set_active_squad': async (params, brainRoot) => {
    const store = new SquadsStore(brainRoot)
    const squad = store.setActive(params.id as string, params.active !== false)
    if (!squad) throw new Error(`Squad ${params.id} not found`)
    return { squad }
  },

  'team.remove_squad': async (params, brainRoot) => {
    const store = new SquadsStore(brainRoot)
    const removed = store.remove(params.id as string)
    return { removed }
  },

  'team.get_live_demo_gate': async () => {
    return { ready: liveDemoGateReady }
  },

  'team.set_live_demo_gate': async (params) => {
    liveDemoGateReady = params.ready === true
    return { ready: liveDemoGateReady }
  },

  'team.get_tasks': async (_params, brainRoot) => {
    const tasks = parseExecutionPlan(brainRoot)
    return { tasks }
  },

  'team.get_execution_state': async (_params, brainRoot) => {
    return getExecutionState(brainRoot)
  },

  'team.get_run_state': async () => {
    return getRunState()
  },

  'team.start_next_task': async (_params, brainRoot) => {
    const state = startNextTask(brainRoot)
    return {
      status: 'started',
      task: state.currentTask,
      branch: state.branch,
      agentStatus: state.agentStatus,
    }
  },

  'team.stop_task': async () => {
    stopCurrentTask()
    return { status: 'stopped' }
  },

  'team.complete_task': async (_params, brainRoot) => {
    completeCurrentTask(brainRoot)
    return { status: 'completed' }
  },

  'team.subscribe_output': async () => {
    return { status: 'ok', message: 'Use WebSocket for real-time output' }
  },

  'team.run_verification_suite': async (_params, brainRoot) => {
    const gates = runVerificationSuite(brainRoot)
    const failures = captureFailureBundle('current', gates)

    if (failures.length > 0) {
      const fs = new BrainFs(brainRoot)
      for (const bundle of failures) {
        const remediation = generateRemediationTask(bundle)
        const filename = `tasks/remediation-${bundle.gate}-${Date.now()}.md`
        try {
          fs.writeFile('', filename, remediation)
        } catch {
          /* brain might not exist for standalone runs */
        }
      }
    }

    return { gates, allPassed: gates.every((g) => g.ok) }
  },

  'team.get_policy_status': async (_params) => {
    const stages = [
      'intent',
      'discussion',
      'proposal',
      'ceo_review',
      'execution',
      'verification',
      'merge',
      'briefing',
    ] as const
    const results = stages.map((stage) => ({
      stage,
      ...checkPolicyForStage(stage),
    }))
    return { policies: results }
  },

  'team.merge_queue_dry_run': async (_params, brainRoot) => {
    const branch = getCurrentBranch(brainRoot)
    if (branch === 'main' || branch === 'v2') return { canMerge: true, conflicts: [], branch }
    return { branch, ...dryRunMerge(brainRoot, branch) }
  },

  'team.merge_queue_execute': async (_params, brainRoot) => {
    const branch = getCurrentBranch(brainRoot)
    const target = 'v2'
    if (branch === target) return { ok: true, message: `Already on ${target}` }
    return executeMerge(brainRoot, branch, target)
  },

  'team.merge_queue_ship': async (_params, brainRoot) => {
    return pushToRemote(brainRoot, 'v2')
  },

  'team.create_mission_branch': async (params, brainRoot) => {
    const initiativeId = params.initiativeId as string
    if (!initiativeId) throw new Error('initiativeId required')
    const branch = createMissionBranch(brainRoot, initiativeId)
    return { branch }
  },

  'team.record_human_verification': async (params) => {
    return { recorded: true, outcome: params.outcome ?? 'approved' }
  },

  'team.capture_failure_bundle': async (params, brainRoot) => {
    const gates = runVerificationSuite(brainRoot)
    const bundles = captureFailureBundle((params.taskId as string) ?? 'unknown', gates)
    return { bundles }
  },
}
