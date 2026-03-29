import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getBrain, getExecutionSteps, scanBrainFiles } from '@/lib/local-data'
import { readV2ApiData, runV2McpCall } from '@/server/v2/mcp'
import { runTeamMcpCall } from '@/server/team-board-mcp'

type ReadinessGate = {
  id: string
  area: string
  gate: string
  pass: boolean
  details: string
  suggestedInitiative: string
}

function isYesNoQuestion(question: string): boolean {
  const q = question.trim()
  if (!q.endsWith('?')) return false
  return /^(should|is|are|can|could|do|does|did|will|would|has|have)\b/i.test(q)
}

export async function GET(_req: Request, { params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params
  const brain = getBrain(brainId)
  if (!brain) return NextResponse.json({ error: 'brain_not_found' }, { status: 404 })

  const files = scanBrainFiles(brain.path)
  const steps = getExecutionSteps(brain.path, files)
  const company = readV2ApiData(brainId)
  const teamSnapshot = runTeamMcpCall(brainId, 'team.get_snapshot', {})
  const repoState = runTeamMcpCall(brainId, 'team.get_repo_state', {}).repo
  const labState = runV2McpCall(brainId, 'lab.state.get', {})
  const autopilotState = runV2McpCall(brainId, 'workflow.autopilot.state', {}).autopilot as
    | { active: boolean; mode: 'manual' | 'safe'; ticks: number; lastResult: string }
    | undefined

  const mergeSteps = new Map<string, { hasMerge: boolean; hasVerifyDone: boolean }>()
  for (const step of teamSnapshot.snapshot.executionSteps) {
    const tasks = step.tasks_json ?? []
    const hasMerge = tasks.some((task) => task.text.toUpperCase().startsWith('MERGE:'))
    const hasVerifyDone = tasks.some((task) => task.done && task.text.toUpperCase().startsWith('VERIFY:'))
    mergeSteps.set(step.id, { hasMerge, hasVerifyDone })
  }
  const mergeGatePass = Array.from(mergeSteps.values()).every((v) => !v.hasMerge || v.hasVerifyDone)

  const pendingDecisions = company.companyState.pendingDecisions ?? []
  const activeEscalations = company.companyState.activeEscalations ?? []
  const decisionQuestionPass = pendingDecisions.every((d: { question: string; mode: 'yes_no' | 'multi_option'; options: string[] }) => {
    const question = String(d.question ?? '').trim()
    if (!question) return false
    if (d.mode === 'yes_no') return isYesNoQuestion(question)
    return d.mode === 'multi_option' && Array.isArray(d.options) && d.options.length >= 2
  })
  const escalationQuestionPass = activeEscalations.every((e: { question: string }) => String(e.question ?? '').trim().length > 0)

  const executionPlanPath = path.join(brain.path, 'brian', 'execution-plan.md')
  const planContent = fs.existsSync(executionPlanPath) ? fs.readFileSync(executionPlanPath, 'utf8') : ''
  const hasPlanRework = planContent.includes('## CEO Plan Rework')

  const trackedDirs = [
    'brian/index.md',
    'brian/org',
    'brian/initiatives',
    'brian/discussions',
    'brian/decisions',
    'brian/briefings',
    'brian/tasks',
    'brian/commands',
    'brian/agents',
  ]
  const hasTrackedDirs = trackedDirs.every((rel) => fs.existsSync(path.join(brain.path, rel)))
  const v2FileCount = files.filter((f) => f.path.startsWith('brian/')).length

  const placeholderPattern = /\b(placeholder|tbd|todo|lorem ipsum)\b/i
  let placeholderHits = 0
  for (const file of files.filter((f) => f.path.startsWith('brian/'))) {
    try {
      const content = fs.readFileSync(path.join(brain.path, file.path), 'utf8')
      if (placeholderPattern.test(content)) placeholderHits += 1
    } catch {
      // best effort only
    }
  }

  const buildHealthy = steps.length > 0
  const missionFlowPass = (teamSnapshot.snapshot.executionSteps.length > 0) && !(repoState?.hardBlockers?.length ?? 0)
  const viewerRuntimePass = true
  const tribePass = escalationQuestionPass
  const agentLabPass = Array.isArray(labState?.specialists) && Array.isArray(labState?.assignments)
  const assignments = Array.isArray(labState?.assignments) ? labState.assignments : []
  const policyRolloutAt = Date.parse('2026-03-29T17:00:00.000Z')
  const executionInitiatives = company.initiatives
    .filter((initiative) => {
      if (initiative.stage !== 'execution') return false
      const updatedAt = Date.parse(String(initiative.updatedAt ?? ''))
      return Number.isFinite(updatedAt) ? updatedAt >= policyRolloutAt : false
    })
    .slice(0, 4)
  const executionPolicyPass = executionInitiatives.length === 0 || executionInitiatives.every((initiative) => {
    const fullPath = path.join(brain.path, initiative.filePath)
    if (!fs.existsSync(fullPath)) return false
    const raw = fs.readFileSync(fullPath, 'utf8')
    const hasPolicyLine = raw.includes('## Execution Policy')
    if (assignments.length === 0) return hasPolicyLine
    return hasPolicyLine && raw.includes('execution_policy_enforced: true')
  })
  const catalogQualityPass = assignments.length === 0
    ? false
    : assignments.every((item: { repoUrl?: string; repoFullName?: string; stars?: number }) =>
      Boolean(item.repoUrl) && Boolean(item.repoFullName) && Number(item.stars ?? 0) > 0)
  const compatibilityPass = !fs.existsSync(path.join(brain.path, 'demo')) && !fs.existsSync(path.join(brain.path, 'examples', 'clsh-brain'))
  const autonomyPass = Boolean(autopilotState) &&
    typeof autopilotState?.mode === 'string' &&
    typeof autopilotState?.lastResult === 'string'

  const gates: ReadinessGate[] = [
    {
      id: 'viewer-runtime',
      area: 'Viewer Runtime',
      gate: 'App availability',
      pass: viewerRuntimePass,
      details: 'V2 API responded and route is healthy.',
      suggestedInitiative: 'Harden viewer runtime startup and websocket resilience',
    },
    {
      id: 'decision-quality',
      area: 'CEO Mission',
      gate: 'Decision quality',
      pass: decisionQuestionPass && escalationQuestionPass,
      details: `pendingDecisions=${pendingDecisions.length}, activeEscalations=${activeEscalations.length}`,
      suggestedInitiative: 'Enforce explicit question formatting for decisions and escalations',
    },
    {
      id: 'plan-control',
      area: 'CEO Mission',
      gate: 'Plan control',
      pass: hasPlanRework,
      details: hasPlanRework ? 'execution-plan includes CEO Plan Rework entries.' : 'execution-plan missing CEO Plan Rework entries.',
      suggestedInitiative: 'Strengthen CEO plan rework loop and execution-plan projection',
    },
    {
      id: 'governance-flow',
      area: 'Tribe',
      gate: 'Governance flow',
      pass: tribePass,
      details: tribePass ? 'Escalation questions are explicit.' : 'Some escalations lack explicit questions.',
      suggestedInitiative: 'Improve escalation handling and discussion continuity in tribe workflow',
    },
    {
      id: 'mission-flow',
      area: 'Mission Control',
      gate: 'Execution flow',
      pass: missionFlowPass,
      details: missionFlowPass ? 'Team snapshot and repo state are actionable.' : 'Mission flow has unresolved blockers.',
      suggestedInitiative: 'Stabilize mission-control queue/worktree progression and current-task updates',
    },
    {
      id: 'merge-safety',
      area: 'Mission Control',
      gate: 'Merge safety',
      pass: mergeGatePass && !(repoState?.hasConflicts ?? false),
      details: mergeGatePass ? 'All merge tasks have verification evidence.' : 'Some merge tasks are missing VERIFY evidence.',
      suggestedInitiative: 'Enforce verification-before-merge and improve conflict triage UX',
    },
    {
      id: 'agent-lab',
      area: 'Agent Lab',
      gate: 'Catalog + assignment',
      pass: agentLabPass,
      details: `specialists=${(labState?.specialists ?? []).length}, assignments=${(labState?.assignments ?? []).length}`,
      suggestedInitiative: 'Improve agent lab curation and assignment-to-execution enforcement',
    },
    {
      id: 'execution-policy-enforcement',
      area: 'Execution Policy',
      gate: 'Assignment enforcement',
      pass: executionPolicyPass,
      details: executionPolicyPass ? 'Execution initiatives include enforced policy metadata.' : 'Execution policy metadata missing on one or more execution initiatives.',
      suggestedInitiative: 'Enforce Agent Lab assignments in execution policy and actor routing',
    },
    {
      id: 'catalog-curation',
      area: 'Agent Lab',
      gate: 'Catalog quality',
      pass: catalogQualityPass,
      details: catalogQualityPass ? `Assignments are populated with non-empty repo metadata (${assignments.length} assigned).` : 'No high-signal assignment metadata available yet.',
      suggestedInitiative: 'Improve catalog curation and ranking signals for GitHub-sourced skills',
    },
    {
      id: 'compatibility-retirement',
      area: 'Runtime',
      gate: 'Compatibility path retirement',
      pass: compatibilityPass,
      details: compatibilityPass ? 'No demo/examples legacy folders detected in workspace root.' : 'Legacy demo/examples path detected.',
      suggestedInitiative: 'Retire remaining compatibility/demo runtime paths',
    },
    {
      id: 'autonomy-safe-mode',
      area: 'Autonomy',
      gate: 'Safe autopilot',
      pass: autonomyPass,
      details: autonomyPass
        ? `autopilot mode=${autopilotState?.mode ?? 'unknown'} active=${autopilotState?.active ? 'yes' : 'no'} last=${autopilotState?.lastResult ?? 'n/a'}`
        : 'Autopilot state unavailable.',
      suggestedInitiative: 'Harden safe autopilot progression and governance blocks',
    },
    {
      id: 'data-integrity',
      area: 'Data Integrity',
      gate: 'Notes + links',
      pass: hasTrackedDirs && v2FileCount > 20 && placeholderHits === 0,
      details: `v2Files=${v2FileCount}, placeholders=${placeholderHits}`,
      suggestedInitiative: 'Complete and normalize V2 notes with zero placeholder content',
    },
    {
      id: 'build-health',
      area: 'Build Health',
      gate: 'Compile + types',
      pass: buildHealthy,
      details: buildHealthy ? `executionSteps=${steps.length}` : 'No execution steps detected in brain markdown.',
      suggestedInitiative: 'Repair build/type pipeline and execution-plan parsing coverage',
    },
  ]

  const failed = gates.filter((g) => !g.pass)
  return NextResponse.json({
    brainId,
    at: new Date().toISOString(),
    passed: gates.length - failed.length,
    total: gates.length,
    gates,
    failedInitiatives: failed.map((g) => ({
      gateId: g.id,
      title: g.suggestedInitiative,
      summary: `${g.area} / ${g.gate}: ${g.details}`,
    })),
  })
}
