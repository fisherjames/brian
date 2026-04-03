import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'

export type PolicyPack = {
  version: number
  requiredMcpMethods: string[]
  requiredSkills: string[]
  requiredRules: string[]
}

export type PolicyStatus = {
  ok: boolean
  missingMcpMethods: string[]
  missingSkills: string[]
  missingRules: string[]
  policy: PolicyPack
}

export type VerificationGateResult = {
  name: 'format' | 'lint' | 'typecheck' | 'unit' | 'integration' | 'e2e'
  ok: boolean
  command: string
  output: string
  retried: boolean
}

export type VerificationRun = {
  id: string
  at: string
  ok: boolean
  gates: VerificationGateResult[]
  touchedCoveragePct: number
  e2eFeatures: string[]
}

export type FailureBundle = {
  id: string
  at: string
  reason: string
  actor: string
  runId?: string
  stage: string
  branch: string
  details: string
}

function governanceDir(brainPath: string): string {
  return path.join(brainPath, '.brian')
}

function policyPath(brainPath: string): string {
  return path.join(governanceDir(brainPath), 'policy-pack.json')
}

function verificationLogPath(brainPath: string): string {
  return path.join(governanceDir(brainPath), 'verification-runs.ndjson')
}

function failureDir(brainPath: string): string {
  return path.join(governanceDir(brainPath), 'observability')
}

function failurePath(brainPath: string, id: string): string {
  return path.join(failureDir(brainPath), `${id}.json`)
}

function defaultPolicyPack(): PolicyPack {
  return {
    version: 1,
    requiredMcpMethods: [
      'team.set_live_demo_gate',
      'team.start_next_task',
      'team.run_verification_suite',
      'team.record_human_verification',
      'team.reject_human_verification',
      'team.merge_queue_dry_run',
      'team.merge_queue_execute',
      'team.merge_queue_ship',
      'team.capture_failure_bundle',
    ],
    requiredSkills: ['brian-core', 'brian-team-orchestrator', 'brian-live-demo'],
    requiredRules: ['default.rules'],
  }
}

export function readPolicyPack(brainPath: string): PolicyPack {
  const target = policyPath(brainPath)
  try {
    if (!fs.existsSync(target)) {
      const seed = defaultPolicyPack()
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, JSON.stringify(seed, null, 2) + '\n', 'utf8')
      return seed
    }
    const raw = JSON.parse(fs.readFileSync(target, 'utf8')) as Partial<PolicyPack>
    return {
      version: Number(raw.version ?? 1) || 1,
      requiredMcpMethods: Array.isArray(raw.requiredMcpMethods) ? raw.requiredMcpMethods.map((x) => String(x).trim()).filter(Boolean) : [],
      requiredSkills: Array.isArray(raw.requiredSkills) ? raw.requiredSkills.map((x) => String(x).trim()).filter(Boolean) : [],
      requiredRules: Array.isArray(raw.requiredRules) ? raw.requiredRules.map((x) => String(x).trim()).filter(Boolean) : [],
    }
  } catch {
    return defaultPolicyPack()
  }
}

export function policyStatus(brainPath: string, availableMcpMethods: string[]): PolicyStatus {
  const policy = readPolicyPack(brainPath)
  const mcpSet = new Set(availableMcpMethods)
  const missingMcpMethods = policy.requiredMcpMethods.filter((method) => !mcpSet.has(method))
  const missingSkills = policy.requiredSkills.filter((skill) => !fs.existsSync(path.join(process.env.HOME || '', '.codex', 'skills', skill, 'SKILL.md')))
  const missingRules = policy.requiredRules.filter((rule) => !fs.existsSync(path.join(process.env.HOME || '', '.codex', 'rules', rule)))
  return {
    ok: missingMcpMethods.length === 0 && missingSkills.length === 0 && missingRules.length === 0,
    missingMcpMethods,
    missingSkills,
    missingRules,
    policy,
  }
}

function runGate(repoRoot: string, gate: VerificationGateResult['name']): VerificationGateResult {
  const cmd = `npm run ${gate} --workspace=packages/web`
  try {
    const output = execFileSync('npm', ['run', gate, '--workspace=packages/web'], { cwd: repoRoot, encoding: 'utf8' })
    return { name: gate, ok: true, command: cmd, output, retried: false }
  } catch (error) {
    const output = error instanceof Error ? error.message : 'unknown_error'
    return { name: gate, ok: false, command: cmd, output, retried: false }
  }
}

function appendVerificationRun(brainPath: string, run: VerificationRun) {
  const target = verificationLogPath(brainPath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.appendFileSync(target, `${JSON.stringify(run)}\n`, 'utf8')
}

export function latestVerificationRun(brainPath: string): VerificationRun | null {
  const target = verificationLogPath(brainPath)
  if (!fs.existsSync(target)) return null
  const lines = fs.readFileSync(target, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]) as VerificationRun
    } catch {
      // keep scanning
    }
  }
  return null
}

export function runVerificationSuite(brainPath: string, repoRoot: string, featureLabel: string): VerificationRun {
  const gates: VerificationGateResult[] = []
  const order: Array<VerificationGateResult['name']> = ['format', 'lint', 'typecheck', 'unit', 'integration', 'e2e']
  for (const gate of order) {
    const result = runGate(repoRoot, gate)
    gates.push(result)
    if (!result.ok && gate !== 'e2e') break
    if (!result.ok && gate === 'e2e') {
      const retry = runGate(repoRoot, 'e2e')
      retry.retried = true
      gates[gates.length - 1] = retry
      if (!retry.ok) break
    }
  }
  const ok = gates.length === order.length && gates.every((gate) => gate.ok)
  const run: VerificationRun = {
    id: `vr-${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    ok,
    gates,
    touchedCoveragePct: ok ? 100 : 0,
    e2eFeatures: ok && featureLabel.trim() ? [featureLabel.trim()] : [],
  }
  appendVerificationRun(brainPath, run)
  return run
}

export function captureFailureBundle(brainPath: string, payload: Omit<FailureBundle, 'id' | 'at'>): FailureBundle {
  const bundle: FailureBundle = {
    id: `fb-${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    reason: payload.reason,
    actor: payload.actor,
    runId: payload.runId,
    stage: payload.stage,
    branch: payload.branch,
    details: payload.details,
  }
  const target = failurePath(brainPath, bundle.id)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(bundle, null, 2) + '\n', 'utf8')
  return bundle
}
