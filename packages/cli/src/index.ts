#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import * as net from 'node:net'
import * as readline from 'node:readline/promises'

const CONFIG_DIR = path.join(os.homedir(), '.brian')
const BRAINS_JSON = path.join(CONFIG_DIR, 'brains.json')
const SERVER_JSON = path.join(CONFIG_DIR, 'server.json')
const CODEX_SKILLS_DIR = path.join(os.homedir(), '.codex', 'skills')

const VERSION = '0.2.0'
const LEGACY_ALIAS_MAP: Record<string, string> = {}

type BrainEntry = {
  id: string
  name: string
  description: string
  path: string
  created: string
}

type BrainsConfig = {
  brains: BrainEntry[]
}

type BrainMeta = {
  id: string
  name: string
  description: string
  created: string
  version: string
}

type BrainStep = {
  id: string
  phase: number
  title: string
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked'
  dependencies: string[]
}

type SquadConfig = {
  id: string
  name: string
  memberAgentIds: string[]
}

type SquadState = {
  activeSquadId: string
  squads: SquadConfig[]
}

type InitPreset = 'core' | 'codex-team'

type InitOptions = {
  name: string
  description: string
  preset: InitPreset
  linkExistingDocs: boolean
  addPackageScripts: boolean
  installSkills: boolean
}

type BrainRoleName =
  | 'general'
  | 'founder'
  | 'product'
  | 'marketing'
  | 'frontend'
  | 'backend'
  | 'mobile'
  | 'ops'

type BrianRole = {
  skills: string[]
  notePath: string
}

const BRIAN_ROLES: Record<BrainRoleName, BrianRole> = {
  general: {
    skills: ['$brian-core'],
    notePath: 'brian/agents/project-operator.md',
  },
  founder: {
    skills: ['$brian-core', '$brian-founder-ceo'],
    notePath: 'brian/agents/founder-ceo.md',
  },
  product: {
    skills: ['$brian-core', '$brian-product-lead'],
    notePath: 'brian/agents/product-lead.md',
  },
  marketing: {
    skills: ['$brian-core', '$brian-growth-marketing'],
    notePath: 'brian/agents/growth-marketing.md',
  },
  frontend: {
    skills: ['$brian-core', '$brian-frontend-engineer'],
    notePath: 'brian/agents/frontend-engineer.md',
  },
  backend: {
    skills: ['$brian-core', '$brian-backend-engineer'],
    notePath: 'brian/agents/backend-engineer.md',
  },
  mobile: {
    skills: ['$brian-core', '$brian-mobile-engineer'],
    notePath: 'brian/agents/mobile-engineer.md',
  },
  ops: {
    skills: ['$brian-core', '$brian-devops-release'],
    notePath: 'brian/agents/devops-release.md',
  },
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  if (!fs.existsSync(BRAINS_JSON)) {
    fs.writeFileSync(BRAINS_JSON, JSON.stringify({ brains: [] }, null, 2) + '\n')
  }
}

function readBrainsConfig(): BrainsConfig {
  ensureConfigDir()
  try {
    const parsed = JSON.parse(fs.readFileSync(BRAINS_JSON, 'utf8'))
    const brains = Array.isArray(parsed.brains) ? parsed.brains : []
    return { brains }
  } catch {
    return { brains: [] }
  }
}

function writeBrainsConfig(config: BrainsConfig) {
  ensureConfigDir()
  fs.writeFileSync(BRAINS_JSON, JSON.stringify(config, null, 2) + '\n')
}

function parseOption(args: string[], name: string): string | undefined {
  const inline = args.find(arg => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const idx = args.indexOf(name)
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1]
  return undefined
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name) || args.some(arg => arg.startsWith(`${name}=`))
}

function removeOptionArgs(args: string[], name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === name) {
      i += 1
      continue
    }
    if (arg.startsWith(`${name}=`)) continue
    out.push(arg)
  }
  return out
}

function isoNow(): string {
  return new Date().toISOString()
}

function appendLegacyTelemetry(brainRoot: string, legacyCommand: string, canonicalCommand: string) {
  const meta = readBrainMeta(brainRoot)
  if (!meta?.id) return
  const eventFile = path.join(CONFIG_DIR, 'state', meta.id, 'events.ndjson')
  const payload = {
    id: crypto.randomUUID(),
    at: isoNow(),
    actor: 'project-operator',
    layer: 'system',
    stage: 'execution',
    kind: 'legacy_command_used',
    message: `${legacyCommand} -> ${canonicalCommand}`,
    refs: [],
  }
  fs.mkdirSync(path.dirname(eventFile), { recursive: true })
  fs.appendFileSync(eventFile, `${JSON.stringify(payload)}\n`, 'utf8')
}

function warnLegacyAlias(brainRoot: string | undefined, legacyCommand: string) {
  const mapped = LEGACY_ALIAS_MAP[legacyCommand]
  if (!mapped) return
  if (brainRoot) appendLegacyTelemetry(brainRoot, `brian ${legacyCommand}`, mapped)
}

function humanNow(): string {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveProjectName(brainRoot: string, explicitName?: string): string {
  if (explicitName && explicitName.trim()) return explicitName.trim()

  const packageJsonPath = path.join(brainRoot, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (typeof packageJson.name === 'string' && packageJson.name.trim()) {
        return packageJson.name.trim()
      }
    } catch {
      // ignore invalid package.json
    }
  }

  return path.basename(brainRoot)
}

function resolveProjectDescription(brainRoot: string, explicitDescription?: string): string {
  if (explicitDescription && explicitDescription.trim()) return explicitDescription.trim()

  const packageJsonPath = path.join(brainRoot, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (typeof packageJson.description === 'string' && packageJson.description.trim()) {
        return packageJson.description.trim()
      }
    } catch {
      // ignore invalid package.json
    }
  }

  return 'Codex-first Brian workspace for this project.'
}

function findBrainRoot(startDir: string, includeLegacy: boolean = false): string | null {
  let current = path.resolve(startDir)
  while (true) {
    if (
      fs.existsSync(path.join(current, 'brian', 'index.md')) ||
      (includeLegacy && fs.existsSync(path.join(current, 'BRAIN-INDEX.md'))) ||
      (includeLegacy && fs.existsSync(path.join(current, '.braintree', 'brain.json'))) ||
      fs.existsSync(path.join(current, '.brian', 'brain.json'))
    ) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function readBrainMeta(brainRoot: string): BrainMeta | null {
  const metaPath = path.join(brainRoot, '.brian', 'brain.json')
  if (!metaPath) return null

  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as BrainMeta
  } catch {
    return null
  }
}

function rootIndexPath(brainRoot: string): string {
  return path.join(brainRoot, 'brian', 'index.md')
}

function executionPlanNotePath(brainRoot: string): string {
  return path.join(brainRoot, 'brian', 'execution-plan.md')
}

function handoffsDirPath(brainRoot: string): string {
  return path.join(brainRoot, 'brian', 'handoffs')
}

function commandsDirPath(brainRoot: string): string {
  return path.join(brainRoot, 'brian', 'commands')
}

function registerBrain(entry: BrainEntry) {
  const config = readBrainsConfig()
  const existing = config.brains.findIndex(brain => brain.id === entry.id || brain.path === entry.path)
  if (existing >= 0) {
    config.brains[existing] = entry
  } else {
    config.brains.push(entry)
  }
  writeBrainsConfig(config)
}

function writeFileIfMissing(filePath: string, content: string) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
  }
}

function updateFileIfExists(filePath: string, updater: (content: string) => string) {
  if (!fs.existsSync(filePath)) return
  const current = fs.readFileSync(filePath, 'utf8')
  const updated = updater(current)
  if (updated !== current) {
    fs.writeFileSync(filePath, updated)
  }
}

function getRole(roleName?: string): BrianRole {
  const key = (roleName ?? 'general') as BrainRoleName
  return BRIAN_ROLES[key] ?? BRIAN_ROLES.general
}

function writeSkillFile(skillName: string, title: string, description: string, body: string) {
  const skillDir = path.join(CODEX_SKILLS_DIR, skillName)
  fs.mkdirSync(skillDir, { recursive: true })
  const frontmatter = [
    '---',
    `name: ${title}`,
    `description: ${description}`,
    '---',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), frontmatter + body.trim() + '\n')
}

function installBrianSkills() {
  fs.mkdirSync(CODEX_SKILLS_DIR, { recursive: true })

  writeSkillFile(
    'brian-core',
    'Brian Core',
    'Use this skill for any repo that has a Brian workspace.',
    `
# Brian Core

Use this skill for any repo that has a Brian workspace.

## Start Rules
- Read \`AGENTS.md\`, \`brian/index.md\`, \`brian/execution-plan.md\`, and the latest handoff in \`brian/handoffs/\` before non-trivial work.
- Open the relevant folder index in \`brian/product/\`, \`brian/engineering/\`, \`brian/operations/\`, \`brian/commands/\`, or \`brian/agents/\` before editing.

## Working Rules
- Keep repo memory in the Brian notes, not only in the chat transcript.
- Update the relevant Brian note when architecture, workflows, priorities, or risks change.
- End meaningful work by updating the newest handoff and \`brian/execution-plan.md\` when status changed.

## Parallel Work Safety
- Split work into role-scoped tasks with explicit paths, dependencies, verification, and merge order before parallel execution.
- Prefer non-overlapping ownership. If two tasks may touch the same files or contracts, call that out before implementation starts.
`
  )

  const roleSkills: Array<[string, string, string, string]> = [
    ['brian-founder-ceo', 'Brian Founder / CEO', 'brian/agents/founder-ceo.md', 'Use for direction, priorities, positioning, and business tradeoffs. Keep decisions high-signal and explicit about tradeoffs.'],
    ['brian-product-lead', 'Brian Product Lead', 'brian/agents/product-lead.md', 'Use for requirements, scope control, rollout decisions, and acceptance criteria.'],
    ['brian-growth-marketing', 'Brian Growth / Marketing', 'brian/agents/growth-marketing.md', 'Use for messaging, launches, funnels, lifecycle copy, and brand consistency.'],
    ['brian-frontend-engineer', 'Brian Frontend Engineer', 'brian/agents/frontend-engineer.md', 'Use for browser UI, design systems, interaction flows, and rendering behavior.'],
    ['brian-backend-engineer', 'Brian Backend Engineer', 'brian/agents/backend-engineer.md', 'Use for APIs, contracts, persistence, jobs, and service boundaries.'],
    ['brian-mobile-engineer', 'Brian Mobile Engineer', 'brian/agents/mobile-engineer.md', 'Use for native/mobile UX, device behavior, and performance-sensitive paths.'],
    ['brian-devops-release', 'Brian DevOps / Release', 'brian/agents/devops-release.md', 'Use for environments, CI/CD, observability, deploys, and rollback safety.'],
    ['brian-team-orchestrator', 'Brian Team Orchestrator', 'brian/commands/team-board.md', 'Use for task decomposition, parallel work ownership, dependency planning, review gates, and merge order.'],
  ]

  for (const [skillName, title, notePath, purpose] of roleSkills) {
    writeSkillFile(
      skillName,
      title,
      purpose,
      `
# ${title}

${purpose}

## Read First
- \`AGENTS.md\`
- \`brian/index.md\`
- \`brian/execution-plan.md\`
- the latest handoff in \`brian/handoffs/\`
- \`${notePath}\`

## Behavior
- Stay within the scope of this role unless cross-role coordination is required.
- Use the exact committed team-board path \`brian/commands/team-board.md\` when that note is needed; do not invent shorter aliases.
- Record any changed assumptions, workflows, or risks back into the Brian notes.
- Prefer the smallest realistic verification that proves the role-specific change.
`
    )
  }
}

function readJsonIfExists(filePath: string): any | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function hasPackageJson(brainRoot: string): boolean {
  return fs.existsSync(path.join(brainRoot, 'package.json'))
}

function detectScripts(brainRoot: string): string[] {
  const packageJsonPath = path.join(brainRoot, 'package.json')
  if (!fs.existsSync(packageJsonPath)) return []

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    return typeof packageJson.scripts === 'object' && packageJson.scripts
      ? Object.keys(packageJson.scripts).slice(0, 6)
      : []
  } catch {
    return []
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function findMarkdownFiles(root: string): string[] {
  const files: string[] = []

  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules') continue
      if (entry.name.startsWith('.')) continue

      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }

  walk(root)
  return files
}

function findExecutionPlanPath(brainRoot: string): string | null {
  const directCandidates = [path.join(brainRoot, 'brian', 'execution-plan.md')]

  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  const matches = findMarkdownFiles(brainRoot).filter(file => {
    const lower = path.basename(file).toLowerCase()
    return lower === 'execution-plan.md' || lower === 'execution_plan.md'
  })

  return matches[0] ?? null
}

function normalizeStatus(raw: string): BrainStep['status'] {
  const value = raw.trim().toLowerCase().replace(/\s+/g, '_')
  if (value.startsWith('complete')) return 'completed'
  if (value.startsWith('in_progress') || value.startsWith('in-progress') || value.startsWith('inprogress')) {
    return 'in_progress'
  }
  if (value.startsWith('blocked')) return 'blocked'
  return 'not_started'
}

function parseDependencies(raw: string): string[] {
  if (!raw || raw.trim().toLowerCase() === 'none') return []
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

function parseExecutionPlanSteps(content: string): BrainStep[] {
  const steps: BrainStep[] = []
  const lines = content.split('\n')
  let currentPhase = 0
  let current: BrainStep | null = null
  let phaseStepCounter = 0

  function pushCurrent() {
    if (current) {
      steps.push(current)
      current = null
    }
  }

  for (const line of lines) {
    const phaseMatch = line.match(/^##\s+Phase\s+(\d+)/i)
    if (phaseMatch) {
      pushCurrent()
      currentPhase = Number(phaseMatch[1])
      phaseStepCounter = 0
      continue
    }

    const explicitStepMatch = line.match(/^#{2,5}\s+Step\s+([\d.]+[a-z]?)\s*:\s*(.+)$/i)
    if (explicitStepMatch) {
      pushCurrent()
      current = {
        id: explicitStepMatch[1],
        phase: currentPhase,
        title: explicitStepMatch[2].trim(),
        status: 'not_started',
        dependencies: [],
      }
      continue
    }

    const headingMatch = line.match(/^###\s+(.+)$/)
    if (headingMatch) {
      pushCurrent()
      const heading = headingMatch[1].trim()
      const prefixedMatch = heading.match(/^([A-Za-z]+-\d+(?:\.\d+)?)\s+(.*)$/)
      const numberedMatch = heading.match(/^(\d+(?:\.\d+)?)\s+(.*)$/)
      phaseStepCounter += 1

      current = {
        id: prefixedMatch?.[1] ?? numberedMatch?.[1] ?? `${currentPhase}.${phaseStepCounter}`,
        phase: currentPhase,
        title: (prefixedMatch?.[2] ?? numberedMatch?.[2] ?? heading).trim(),
        status: 'not_started',
        dependencies: [],
      }
      continue
    }

    if (!current) continue

    const statusMatch = line.match(/^-+\s+\*\*Status\*\*:\s*(.+)$/i)
    if (statusMatch) {
      current.status = normalizeStatus(statusMatch[1])
      continue
    }

    const dependencyMatch = line.match(/^-+\s+\*\*Dependencies\*\*:\s*(.+)$/i)
    if (dependencyMatch) {
      current.dependencies = parseDependencies(dependencyMatch[1])
    }
  }

  pushCurrent()
  return steps
}

function readExecutionPlanSteps(brainRoot: string): { path: string; steps: BrainStep[] } | null {
  const executionPlanPath = findExecutionPlanPath(brainRoot)
  if (!executionPlanPath) return null

  try {
    const content = fs.readFileSync(executionPlanPath, 'utf8')
    return { path: executionPlanPath, steps: parseExecutionPlanSteps(content) }
  } catch {
    return null
  }
}

function resolveFolderContext(
  brainRoot: string,
  candidates: Array<{ dir: string; index: string; name: string }>
): { dir: string; indexPath: string; indexName: string } | null {
  for (const candidate of candidates) {
    const indexPath = path.join(brainRoot, candidate.dir, candidate.index)
    if (fs.existsSync(indexPath)) {
      return {
        dir: path.dirname(indexPath),
        indexPath,
        indexName: candidate.name,
      }
    }
  }
  return null
}

function ensureLinkedNote(
  directory: string,
  indexPath: string,
  indexName: string,
  fileName: string,
  title: string,
  body: string
): string {
  const notePath = path.join(directory, fileName)

  writeFileIfMissing(
    notePath,
    `# ${title}\n\n> Part of [[${indexName}]]\n\n${body.trim()}\n`
  )

  updateFileIfExists(indexPath, content => {
    const link = `- [[${fileName.replace('.md', '')}]]`
    return content.includes(link) ? content : `${content.trimEnd()}\n${link}\n`
  })

  return notePath
}

function printSteps(label: string, steps: BrainStep[]) {
  if (steps.length === 0) return
  console.log(`  ${label}:`)
  for (const step of steps) {
    console.log(`  - ${step.id}: ${step.title}`)
  }
  console.log('')
}

function updateExecutionPlanStepStatus(executionPlanPath: string, stepId: string, status: BrainStep['status']) {
  updateFileIfExists(executionPlanPath, content => {
    const lines = content.split('\n')
    let inTarget = false
    let updated = false

    for (let i = 0; i < lines.length; i += 1) {
      const explicit = lines[i].match(/^#{2,5}\s+Step\s+([\d.]+[a-z]?)\s*:/i)
      const prefixed = lines[i].match(/^###\s+([A-Za-z]+-\d+(?:\.\d+)?)\s+/)
      const numbered = lines[i].match(/^###\s+(\d+(?:\.\d+)?)\s+/)

      if (explicit || prefixed || numbered) {
        const candidateId = explicit?.[1] ?? prefixed?.[1] ?? numbered?.[1] ?? ''
        inTarget = candidateId === stepId
      }

      if (inTarget && lines[i].match(/^-+\s+\*\*Status\*\*:/i)) {
        lines[i] = `- **Status**: ${status}`
        updated = true
        inTarget = false
      }
    }

    return updated ? `${lines.join('\n')}\n` : content
  })
}

function readLatestHandoffPath(brainRoot: string): string | null {
  const handoffDir = handoffsDirPath(brainRoot)
  if (!fs.existsSync(handoffDir)) return null
  const latest = fs.readdirSync(handoffDir)
    .filter(file => /^handoff-.*\.md$/.test(file))
    .sort()
    .at(-1)
  return latest ? path.join(handoffDir, latest) : null
}

function readTeamBoardSteps(brainRoot: string): BrainStep[] {
  const teamBoardPath = path.join(commandsDirPath(brainRoot), 'team-board.md')
  if (!fs.existsSync(teamBoardPath)) return []
  try {
    return parseExecutionPlanSteps(fs.readFileSync(teamBoardPath, 'utf8'))
  } catch {
    return []
  }
}

function recommendNextAction(brainRoot: string): { command: string; reason: string } {
  const v2Initiatives = listV2Initiatives(brainRoot)
  if (v2Initiatives.length > 0) {
    const stageOrder: V2Stage[] = ['intent', 'proposal', 'leadership_discussion', 'director_decision', 'tribe_shaping', 'squad_planning', 'execution']
    const active = [...v2Initiatives].sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage))[0]
    if (active) {
      if (active.stage === 'intent') return { command: `brian propose "${active.title}"`, reason: `${active.id} is at intent stage.` }
      if (active.stage === 'proposal') return { command: `brian shape ${active.id}`, reason: `${active.id} needs tribe shaping.` }
      if (active.stage === 'leadership_discussion') return { command: `brian decide ${active.id} "Approve direction for ${active.title}"`, reason: `${active.id} requires decision closure after discussion.` }
      if (active.stage === 'director_decision') return { command: `brian decide ${active.id} "Resolve pending decision for ${active.title}"`, reason: `${active.id} is waiting on director decision.` }
      if (active.stage === 'tribe_shaping') return { command: `brian plan ${active.id}`, reason: `${active.id} needs squad planning.` }
      if (active.stage === 'squad_planning') return { command: 'brian work', reason: `${active.id} is ready for execution.` }
      if (active.stage === 'execution') return { command: 'brian brief', reason: `${active.id} is executing; generate a director briefing.` }
    }
  }
  return { command: 'brian intent "Define next initiative objective"', reason: 'No active V2 initiative found.' }
}

function createSpecPacket(brainRoot: string, featureName: string): { slug: string; dir: string } {
  const slug = slugify(featureName)
  const packetDir = path.join(brainRoot, 'brian', 'specs', `spec-${slug}`)
  fs.mkdirSync(packetDir, { recursive: true })

  writeFileIfMissing(path.join(packetDir, 'index.md'), `# ${featureName}

> Part of [[../specs]]

## Packet
- [[spec]]
- [[plan]]
- [[tasks]]
- [[review]]
`)

  writeFileIfMissing(path.join(packetDir, 'spec.md'), `# spec

> Part of [[index]]

## Problem
Describe the user problem this feature solves.

## Scope
- In scope:
- Out of scope:

## Acceptance Criteria
- [ ] Define measurable completion criteria.
`)

  writeFileIfMissing(path.join(packetDir, 'plan.md'), `# plan

> Part of [[index]]

## Approach
- Proposed architecture and sequencing.

## Risks
- Technical:
- Product:

## Verification
- [ ] Build
- [ ] Focused tests
`)

  writeFileIfMissing(path.join(packetDir, 'tasks.md'), `# tasks

> Part of [[index]]

- [ ] Break implementation into concrete tasks.
- [ ] Capture owners and merge order if parallelized.
`)

  writeFileIfMissing(path.join(packetDir, 'review.md'), `# review

> Part of [[index]]

## Rollout

## Validation

## Follow-ups
`)

  const specsIndexPath = path.join(brainRoot, 'brian', 'specs', 'specs.md')
  writeFileIfMissing(specsIndexPath, '# specs\n\n> Part of [[index]]\n\n')
  updateFileIfExists(specsIndexPath, content => {
    const link = `- [[spec-${slug}/index]]`
    return content.includes(link) ? content : `${content.trimEnd()}\n${link}\n`
  })

  return { slug, dir: packetDir }
}

function appendMissionExecutionPlan(brainRoot: string, featureName: string, slug: string): string {
  const executionPlanPath = executionPlanNotePath(brainRoot)
  writeFileIfMissing(executionPlanPath, '# execution plan\n\n> Part of [[index]]\n')
  const content = fs.readFileSync(executionPlanPath, 'utf8')
  const existingHeading = content.match(new RegExp(`###\\s+(EP-\\d+)\\s+Build\\s+${featureName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))
  if (existingHeading) return existingHeading[1]

  const numbers = [...content.matchAll(/###\s+EP-(\d+)\s+/g)].map(match => Number(match[1]))
  const next = (numbers.length > 0 ? Math.max(...numbers) + 1 : 1)
  const id = `EP-${next}`
  const section = [
    '',
    `### ${id} Build ${featureName}`,
    '- **Status**: not_started',
    '- **Dependencies**: none',
    `- **Goal**: Deliver spec packet [[spec-${slug}/index]] with verified implementation.`,
    '',
  ].join('\n')
  fs.writeFileSync(executionPlanPath, `${content.trimEnd()}\n${section}`)
  return id
}

function appendMissionTeamBoard(brainRoot: string, featureName: string, stepId: string): string {
  const teamBoardPath = path.join(commandsDirPath(brainRoot), 'team-board.md')
  writeFileIfMissing(
    teamBoardPath,
    '# team board\n\n> Part of [[index]]\n\n## Phase 99 - Team Board\n'
  )
  const content = fs.readFileSync(teamBoardPath, 'utf8')
  const escapedName = featureName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const existing = content.match(new RegExp(`###\\s+Step\\s+(99\\.\\d+)\\s*:\\s*Deliver\\s+${escapedName}`, 'i'))
  if (existing) return existing[1]

  const nums = [...content.matchAll(/###\s+Step\s+99\.(\d+)\s*:/gi)].map(match => Number(match[1]))
  const next = (nums.length > 0 ? Math.max(...nums) + 1 : 1)
  const stepNumber = `99.${next}`
  const section = [
    '',
    `### Step ${stepNumber}: Deliver ${featureName}`,
    '- **Status**: not_started',
    `- [ ] NEXT: feature="Implement ${featureName} from ${stepId}" worktree=feature/${slugify(featureName)} image=pending breaking=none`,
    `- [ ] NEXT: feature="Assign owners + owned paths for ${featureName}" worktree=feature/${slugify(featureName)}-ownership image=pending breaking=none`,
    `- [ ] VERIFY: Human verified "${featureName}" behavior before merge.`,
    `- [ ] MERGE: worktree=feature/${slugify(featureName)} -> main feature="${featureName}" image=pending breaking=none`,
    '- [ ] BLOCKER: Capture blockers and unblock condition.',
    '',
  ].join('\n')
  fs.writeFileSync(teamBoardPath, `${content.trimEnd()}\n${section}`)
  return stepNumber
}

function missionControlStatePath(brainRoot: string): string {
  return path.join(brainRoot, '.brian', 'mission-control.json')
}

function readSquadState(brainRoot: string): SquadState {
  const filePath = missionControlStatePath(brainRoot)
  try {
    if (!fs.existsSync(filePath)) {
      return {
        activeSquadId: 'squad-core',
        squads: [{ id: 'squad-core', name: 'Core Squad', memberAgentIds: ['project-operator', 'product-lead', 'frontend-engineer'] }],
      }
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<SquadState>
    const squads = Array.isArray(parsed.squads)
      ? parsed.squads
          .filter((sq): sq is SquadConfig => Boolean(sq && typeof sq.id === 'string' && typeof sq.name === 'string'))
          .map((sq) => ({
            id: sq.id.trim(),
            name: sq.name.trim(),
            memberAgentIds: Array.isArray(sq.memberAgentIds)
              ? sq.memberAgentIds.map((id) => String(id).trim()).filter(Boolean)
              : [],
          }))
          .filter((sq) => Boolean(sq.id && sq.name))
      : []
    if (squads.length === 0) {
      return {
        activeSquadId: 'squad-core',
        squads: [{ id: 'squad-core', name: 'Core Squad', memberAgentIds: ['project-operator'] }],
      }
    }
    const active = typeof parsed.activeSquadId === 'string' && squads.some((sq) => sq.id === parsed.activeSquadId)
      ? parsed.activeSquadId
      : squads[0].id
    return { activeSquadId: active, squads }
  } catch {
    return {
      activeSquadId: 'squad-core',
      squads: [{ id: 'squad-core', name: 'Core Squad', memberAgentIds: ['project-operator'] }],
    }
  }
}

function resolveSquad(brainRoot: string, squadSelector?: string): SquadConfig {
  const state = readSquadState(brainRoot)
  const selector = (squadSelector ?? '').trim().toLowerCase()
  if (!selector) {
    return state.squads.find((sq) => sq.id === state.activeSquadId) ?? state.squads[0]
  }
  const byId = state.squads.find((sq) => sq.id.toLowerCase() === selector)
  if (byId) return byId
  const byName = state.squads.find((sq) => sq.name.toLowerCase() === selector)
  if (byName) return byName
  return state.squads.find((sq) => sq.id === state.activeSquadId) ?? state.squads[0]
}

function mergePriority(agentId: string): number {
  const order = [
    'project-operator',
    'product-lead',
    'backend-engineer',
    'frontend-engineer',
    'mobile-engineer',
    'devops-release',
  ]
  const idx = order.indexOf(agentId)
  return idx >= 0 ? idx : order.length + 1
}

function appendSquadMissionTeamBoard(
  brainRoot: string,
  featureName: string,
  stepId: string,
  squad: SquadConfig
): { stepNumber: string; mergeOrder: string[]; worktrees: string[] } {
  const teamBoardPath = path.join(commandsDirPath(brainRoot), 'team-board.md')
  writeFileIfMissing(
    teamBoardPath,
    '# team board\n\n> Part of [[index]]\n\n## Phase 99 - Team Board\n'
  )
  const content = fs.readFileSync(teamBoardPath, 'utf8')
  const escapedName = featureName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedSquad = squad.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const existing = content.match(new RegExp(`###\\s+Step\\s+(99\\.\\d+)\\s*:\\s*Deliver\\s+${escapedName}\\s+\\(${escapedSquad}\\)`, 'i'))
  if (existing) {
    return { stepNumber: existing[1], mergeOrder: [], worktrees: [] }
  }

  const nums = [...content.matchAll(/###\s+Step\s+99\.(\d+)\s*:/gi)].map(match => Number(match[1]))
  const next = (nums.length > 0 ? Math.max(...nums) + 1 : 1)
  const stepNumber = `99.${next}`
  const members = squad.memberAgentIds.length > 0 ? squad.memberAgentIds : ['project-operator']
  const uniqueMembers = Array.from(new Set(members))
  const mergeOrder = [...uniqueMembers].sort((a, b) => mergePriority(a) - mergePriority(b))
  const baseSlug = slugify(featureName)
  const worktrees = mergeOrder.map((member) => `feature/${baseSlug}-${slugify(member)}`)

  const nextTasks = mergeOrder.map((member) => {
    const worktree = `feature/${baseSlug}-${slugify(member)}`
    return `- [ ] NEXT: feature="${featureName} (${member})" worktree=${worktree} owner=${member} image=pending breaking=none`
  })
  const mergeTasks = mergeOrder.map((member) => {
    const worktree = `feature/${baseSlug}-${slugify(member)}`
    return `- [ ] MERGE: worktree=${worktree} -> main feature="${featureName}" owner=${member} image=pending breaking=none`
  })

  const section = [
    '',
    `### Step ${stepNumber}: Deliver ${featureName} (${squad.name})`,
    '- **Status**: not_started',
    `- **Squad**: ${squad.name} (${squad.id})`,
    `- **Step**: ${stepId}`,
    `- **Merge Order**: ${mergeOrder.join(' -> ')}`,
    ...nextTasks,
    `- [ ] VERIFY: Human verified "${featureName}" across squad slices before merge.`,
    ...mergeTasks,
    '- [ ] BLOCKER: Capture blockers and unblock condition.',
    '',
  ].join('\n')
  fs.writeFileSync(teamBoardPath, `${content.trimEnd()}\n${section}`)
  return { stepNumber, mergeOrder, worktrees }
}

function ensureV2Docs(brainRoot: string) {
  const dirs = [
    path.join(brainRoot, 'brian', 'org'),
    path.join(brainRoot, 'brian', 'initiatives'),
    path.join(brainRoot, 'brian', 'discussions'),
    path.join(brainRoot, 'brian', 'decisions'),
    path.join(brainRoot, 'brian', 'briefings'),
    path.join(brainRoot, 'brian', 'tasks'),
  ]
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true })

  const indexes: Array<[string, string]> = [
    [path.join(brainRoot, 'brian', 'org', 'index.md'), '# org\n\n> Part of [[index]]\n\n'],
    [path.join(brainRoot, 'brian', 'initiatives', 'index.md'), '# initiatives\n\n> Part of [[index]]\n\n'],
    [path.join(brainRoot, 'brian', 'discussions', 'index.md'), '# discussions\n\n> Part of [[index]]\n\n'],
    [path.join(brainRoot, 'brian', 'decisions', 'index.md'), '# decisions\n\n> Part of [[index]]\n\n'],
    [path.join(brainRoot, 'brian', 'briefings', 'index.md'), '# briefings\n\n> Part of [[index]]\n\n'],
    [path.join(brainRoot, 'brian', 'tasks', 'index.md'), '# tasks\n\n> Part of [[index]]\n\n'],
  ]
  for (const [filePath, content] of indexes) writeFileIfMissing(filePath, content)
}

type V2Stage = 'intent' | 'proposal' | 'leadership_discussion' | 'director_decision' | 'tribe_shaping' | 'squad_planning' | 'execution'

function writeInitiativeRecord(brainRoot: string, payload: { id: string; title: string; stage: V2Stage; summary?: string }) {
  ensureV2Docs(brainRoot)
  const filePath = path.join(brainRoot, 'brian', 'initiatives', `${payload.id}.md`)
  const now = isoNow()
  const body = [
    '---',
    `id: ${payload.id}`,
    `title: ${payload.title}`,
    `stage: ${payload.stage}`,
    `summary: ${payload.summary ?? ''}`,
    `created_at: ${now}`,
    `updated_at: ${now}`,
    '---',
    '',
    `# ${payload.title}`,
    '',
    '## Stage',
    payload.stage,
    '',
    '## Summary',
    payload.summary ?? '',
    '',
  ].join('\n')
  fs.writeFileSync(filePath, body, 'utf8')
  updateFileIfExists(path.join(brainRoot, 'brian', 'initiatives', 'index.md'), (content) => {
    const link = `- [[${payload.id}]]`
    return content.includes(link) ? content : `${content.trimEnd()}\n${link}\n`
  })
  return filePath
}

function listV2Initiatives(brainRoot: string): Array<{ id: string; title: string; stage: V2Stage; path: string }> {
  const dir = path.join(brainRoot, 'brian', 'initiatives')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md') && file !== 'index.md')
    .map((file) => {
      const full = path.join(dir, file)
      const raw = fs.readFileSync(full, 'utf8')
      const title = raw.match(/^title:\s+(.+)$/m)?.[1]?.trim() || file.replace(/\.md$/, '')
      const stage = (raw.match(/^stage:\s+(.+)$/m)?.[1]?.trim() || 'intent') as V2Stage
      return { id: file.replace(/\.md$/, ''), title, stage, path: full }
    })
}

function v2EventLogPath(brainRoot: string): string | null {
  const meta = readBrainMeta(brainRoot)
  if (!meta?.id) return null
  return path.join(CONFIG_DIR, 'state', meta.id, 'events.ndjson')
}

function appendV2Event(brainRoot: string, payload: {
  actor: string
  layer: 'squad' | 'tribe' | 'director' | 'system'
  stage: V2Stage
  kind: string
  message: string
  initiativeId?: string
}) {
  const eventPath = v2EventLogPath(brainRoot)
  if (!eventPath) return
  fs.mkdirSync(path.dirname(eventPath), { recursive: true })
  const event = {
    id: crypto.randomUUID(),
    at: isoNow(),
    actor: payload.actor,
    layer: payload.layer,
    stage: payload.stage,
    kind: payload.kind,
    message: payload.message,
    initiativeId: payload.initiativeId,
    refs: [],
  }
  fs.appendFileSync(eventPath, `${JSON.stringify(event)}\n`, 'utf8')
}

function createDecisionRecord(brainRoot: string, payload: { title: string; initiativeId?: string; rationale?: string; status?: 'pending' | 'approved' | 'rejected' }) {
  ensureV2Docs(brainRoot)
  const id = `decision-${crypto.randomUUID().slice(0, 8)}`
  const filePath = path.join(brainRoot, 'brian', 'decisions', `${id}.md`)
  fs.writeFileSync(
    filePath,
    [
      '---',
      `id: ${id}`,
      `title: ${payload.title}`,
      `initiative_id: ${payload.initiativeId ?? ''}`,
      `status: ${payload.status ?? 'pending'}`,
      `rationale: ${payload.rationale ?? ''}`,
      `at: ${isoNow()}`,
      '---',
      '',
      `# ${payload.title}`,
      '',
      '## Rationale',
      payload.rationale ?? '',
      '',
    ].join('\n'),
    'utf8'
  )
  updateFileIfExists(path.join(brainRoot, 'brian', 'decisions', 'index.md'), (content) => {
    const link = `- [[${id}]]`
    return content.includes(link) ? content : `${content.trimEnd()}\n${link}\n`
  })
  return { id, filePath }
}

function wikilinkTargetExists(target: string, relativeFiles: string[], byBaseName: Map<string, string>): boolean {
  const trimmed = target.trim().replace(/\.md$/i, '')
  if (byBaseName.has(trimmed)) return true

  if (relativeFiles.some(candidate => candidate.replace(/\.md$/i, '') === trimmed)) {
    return true
  }

  const targetParts = trimmed.split(/[\\/]/).filter(Boolean)
  if (targetParts.length <= 1) return false
  const suffix = targetParts.join('/')

  return relativeFiles.some(candidate => candidate.replace(/\.md$/i, '').endsWith(suffix))
}

function commandPromptSummary(brainRoot: string) {
  console.log(`  Brain root: ${brainRoot}`)
  console.log('  Codex slash commands you can use inside the chat:')
  console.log('  - /init      Generate or refresh AGENTS.md instructions')
  console.log('  - /plan      Switch the current chat into planning mode')
  console.log('  - /resume    Resume an old Codex conversation transcript')
  console.log('  - /status    Show Codex session configuration and token usage')
  console.log('')
  console.log('  Brian workflow commands live in the shell:')
  console.log('  - brian intent "<initiative intent>"')
  console.log('  - brian propose "<initiative title>"')
  console.log('  - brian shape <initiative-id>')
  console.log('  - brian plan <initiative-id>')
  console.log('  - brian work [--role <role>]')
  console.log('  - brian end [--role <role>]')
  console.log('  - brian brief')
  console.log('  - brian decide <initiative-id> "<decision title>"')
  console.log('  - brian doctrine-lint')
  console.log('  - brian status')
  console.log('  - brian init')
  console.log('  - brian resume')
  console.log('')
}

function buildWorkPrompt(brainRoot: string, roleName?: string): string {
  const role = getRole(roleName)
  const roleNote = path.join(brainRoot, role.notePath)
  return [
    `Use ${role.skills.join(' and ')} to start this session in ${brainRoot}.`,
    `Read ${rootIndexPath(brainRoot)}, ${path.join(brainRoot, 'AGENTS.md')}, ${executionPlanNotePath(brainRoot)}, the latest handoff in ${handoffsDirPath(brainRoot)}, and ${roleNote} before doing non-trivial work.`,
    `Open ${path.join(brainRoot, 'brian', 'commands', 'commands.md')} if it exists and inspect the relevant brian folder index before editing.`,
    'Keep the work scoped, update the Brian notes when assumptions change, and end with explicit verification.',
  ].join(' ')
}

function buildEndPrompt(brainRoot: string, roleName?: string): string {
  const role = getRole(roleName)
  return [
    `Use ${role.skills.join(' and ')} to wrap up this session in ${brainRoot}.`,
    `Fill the newest handoff in ${handoffsDirPath(brainRoot)} with the session summary, files changed, verification, open risks, and recommended next step.`,
    `Update ${executionPlanNotePath(brainRoot)} if progress changed and reconcile any Brian notes whose assumptions or workflow guidance are now stale.`,
  ].join(' ')
}

async function runInherited(command: string, args: string[], cwd: string = process.cwd()): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', reject)
    child.on('exit', code => resolve(code ?? 0))
  })
}

function managedMarkdownRelativePaths(): string[] {
  return [
    'brian/index.md',
    'brian/constitution.md',
    'AGENTS.md',
    'brian/execution-plan.md',
    path.join('brian', 'specs', 'specs.md'),
    path.join('brian', 'product', 'product.md'),
    path.join('brian', 'product', 'project-goals.md'),
    path.join('brian', 'product', 'current-scope.md'),
    path.join('brian', 'engineering', 'engineering.md'),
    path.join('brian', 'engineering', 'architecture.md'),
    path.join('brian', 'engineering', 'codebase-map.md'),
    path.join('brian', 'operations', 'operations.md'),
    path.join('brian', 'operations', 'runbook.md'),
    path.join('brian', 'operations', 'workflow.md'),
    path.join('brian', 'operations', 'existing-docs.md'),
    path.join('brian', 'commands', 'commands.md'),
    path.join('brian', 'commands', 'start-loop.md'),
    path.join('brian', 'commands', 'plan-loop.md'),
    path.join('brian', 'commands', 'spec-loop.md'),
    path.join('brian', 'commands', 'notes-loop.md'),
    path.join('brian', 'commands', 'team-board.md'),
    path.join('brian', 'commands', 'end-loop.md'),
    path.join('brian', 'agents', 'agents.md'),
    path.join('brian', 'agents', 'project-operator.md'),
    path.join('brian', 'org', 'index.md'),
    path.join('brian', 'initiatives', 'index.md'),
    path.join('brian', 'discussions', 'index.md'),
    path.join('brian', 'decisions', 'index.md'),
    path.join('brian', 'briefings', 'index.md'),
    path.join('brian', 'tasks', 'index.md'),
    path.join('brian', 'assets', 'assets.md'),
    path.join('brian', 'templates', 'templates.md'),
    path.join('brian', 'templates', 'handoff-template.md'),
    path.join('brian', 'handoffs', 'handoffs.md'),
    path.join('brian', 'handoffs', 'handoff-000.md'),
  ]
}

async function askText(rl: readline.Interface, prompt: string, defaultValue: string): Promise<string> {
  const answer = (await rl.question(`${prompt} [${defaultValue}]: `)).trim()
  return answer || defaultValue
}

async function askPreset(rl: readline.Interface, defaultPreset: InitPreset): Promise<InitPreset> {
  const answer = (await rl.question(`Preset ([c]ore / [t]eam) [${defaultPreset === 'codex-team' ? 'team' : 'core'}]: `)).trim().toLowerCase()
  if (!answer) return defaultPreset
  if (answer === 'c' || answer === 'core') return 'core'
  if (answer === 't' || answer === 'team' || answer === 'codex-team') return 'codex-team'
  return defaultPreset
}

async function askYesNo(rl: readline.Interface, prompt: string, defaultValue: boolean): Promise<boolean> {
  const hint = defaultValue ? 'Y/n' : 'y/N'
  const answer = (await rl.question(`${prompt} [${hint}]: `)).trim().toLowerCase()
  if (!answer) return defaultValue
  return answer === 'y' || answer === 'yes'
}

async function resolveInitOptions(brainRoot: string, args: string[]): Promise<InitOptions> {
  const defaultName = resolveProjectName(brainRoot, parseOption(args, '--name'))
  const defaultDescription = resolveProjectDescription(brainRoot, parseOption(args, '--description'))
  const explicitPreset = parseOption(args, '--preset')
  const defaultPreset: InitPreset = explicitPreset === 'core' || explicitPreset === 'codex-team'
    ? explicitPreset
    : 'codex-team'

  const explicitLinkExistingDocs = hasFlag(args, '--link-existing-docs')
    ? true
    : hasFlag(args, '--no-link-existing-docs')
      ? false
      : undefined

  const explicitAddPackageScripts = hasFlag(args, '--package-scripts')
    ? true
    : hasFlag(args, '--no-package-scripts')
      ? false
      : undefined

  const explicitInstallSkills = hasFlag(args, '--install-skills')
    ? true
    : hasFlag(args, '--no-install-skills')
      ? false
      : undefined

  const canAddPackageScripts = hasPackageJson(brainRoot)
  const shouldPrompt = !hasFlag(args, '--yes') && Boolean(process.stdin.isTTY && process.stdout.isTTY)

  if (!shouldPrompt) {
    return {
      name: defaultName,
      description: defaultDescription,
      preset: defaultPreset,
      linkExistingDocs: explicitLinkExistingDocs ?? defaultPreset === 'codex-team',
      addPackageScripts: canAddPackageScripts && (explicitAddPackageScripts ?? defaultPreset === 'codex-team'),
      installSkills: explicitInstallSkills ?? defaultPreset === 'codex-team',
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log('')
    console.log('  Brian init wizard')
    console.log('')
    const name = await askText(rl, 'Brain name', defaultName)
    const description = await askText(rl, 'Description', defaultDescription)
    const preset = await askPreset(rl, defaultPreset)
    const linkExistingDocs = explicitLinkExistingDocs ?? await askYesNo(
      rl,
      'Link existing markdown docs into the brain',
      preset === 'codex-team'
    )
    const addPackageScripts = canAddPackageScripts
      ? explicitAddPackageScripts ?? await askYesNo(
          rl,
          'Add package.json brain helper scripts',
          preset === 'codex-team'
        )
      : false
    const installSkills = explicitInstallSkills ?? await askYesNo(
      rl,
      'Install the managed Brian Codex skill pack',
      preset === 'codex-team'
    )

    console.log('')

    return { name, description, preset, linkExistingDocs, addPackageScripts, installSkills }
  } finally {
    rl.close()
  }
}

function importableMarkdownFiles(brainRoot: string): string[] {
  const excludedDirs = new Set([
    '.brian',
    'brian',
    'node_modules',
  ])
  const managed = new Set(managedMarkdownRelativePaths())

  return findMarkdownFiles(brainRoot)
    .map(file => path.relative(brainRoot, file))
    .filter(relative => {
      if (managed.has(relative)) return false
      const firstSegment = relative.split(path.sep)[0]
      return !excludedDirs.has(firstSegment)
    })
    .sort()
}

function injectPackageScripts(brainRoot: string, preset: InitPreset) {
  if (!hasPackageJson(brainRoot)) return
  const packageJsonPath = path.join(brainRoot, 'package.json')
  const packageJson = readJsonIfExists(packageJsonPath)
  if (!packageJson || typeof packageJson !== 'object') return

  const scripts = typeof packageJson.scripts === 'object' && packageJson.scripts ? packageJson.scripts : {}
  const additions: Record<string, string> = {
    'brain:viewer': 'brian',
    'brain:intent': 'brian intent',
    'brain:propose': 'brian propose',
    'brain:shape': 'brian shape',
    'brain:plan': 'brian plan',
    'brain:work': 'brian work',
    'brain:brief': 'brian brief',
    'brain:decide': 'brian decide',
    'brain:doctrine-lint': 'brian doctrine-lint',
    'brain:resume': 'brian resume',
    'brain:status': 'brian status',
    'brain:end': 'brian end',
  }

  let changed = false
  for (const [key, value] of Object.entries(additions)) {
    if (!scripts[key]) {
      scripts[key] = value
      changed = true
    }
  }

  if (!changed) return
  packageJson.scripts = scripts
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
}

function linkExistingDocs(brainRoot: string) {
  const docs = importableMarkdownFiles(brainRoot)
  if (docs.length === 0) return

  const basenames = new Map<string, number>()
  for (const relative of docs) {
    const base = path.basename(relative, '.md')
    basenames.set(base, (basenames.get(base) || 0) + 1)
  }

  const existingDocsPath = path.join(brainRoot, 'brian', 'operations', 'existing-docs.md')
  const lines = [
    '# existing docs',
    '',
    '> Part of [[operations]]',
    '',
    'Imported markdown docs that already existed in the repository before the brain scaffold was created.',
    '',
    '## Linked Files',
  ]

  for (const relative of docs) {
    const base = path.basename(relative, '.md')
    const unique = basenames.get(base) === 1
    lines.push(unique ? `- [[${base}]] - \`${relative}\`` : `- \`${relative}\``)

    const filePath = path.join(brainRoot, relative)
    const current = fs.readFileSync(filePath, 'utf8')
    if (current.includes('> Part of [[')) continue

    const titleMatch = current.match(/^(# .+\n)/)
    if (titleMatch) {
      const updated = current.replace(titleMatch[1], `${titleMatch[1]}\n> Part of [[existing-docs]]\n\n`)
      fs.writeFileSync(filePath, updated)
    } else {
      fs.writeFileSync(filePath, `> Part of [[existing-docs]]\n\n${current}`)
    }
  }
  lines.push('')

  writeFileIfMissing(existingDocsPath, `${lines.join('\n')}\n`)
  updateFileIfExists(path.join(brainRoot, 'brian', 'operations', 'operations.md'), content => {
    const link = '- [[existing-docs]]'
    return content.includes(link) ? content : `${content.trimEnd()}\n${link}\n`
  })
}

function createBrainScaffold(brainRoot: string, options: InitOptions): BrainMeta {
  const created = isoNow()
  const id = crypto.randomUUID()
  const scripts = detectScripts(brainRoot)
  const scriptList = scripts.length > 0 ? scripts.map(script => `- \`${script}\``).join('\n') : '- Add your common project commands here'
  const preset = options.preset
  const hasCommands = preset === 'codex-team'
  const name = options.name
  const description = options.description
  const docsRoot = path.join(brainRoot, 'brian')
  const meta: BrainMeta = {
    id,
    name,
    description,
    created,
    version: '1.0.0',
  }

  writeFileIfMissing(path.join(brainRoot, '.brian', 'brain.json'), JSON.stringify(meta, null, 2) + '\n')

  writeFileIfMissing(
    path.join(docsRoot, 'index.md'),
    `# ${name}

> ${description}

## Folders
- [[product]] - goals, scope, users, and roadmap notes
- [[engineering]] - architecture, codebase structure, and technical decisions
- [[operations]] - runbooks, workflows, release notes, and maintenance tasks
${hasCommands ? '- [[commands]] - repeatable Codex start, planning, note-sync, and wrap-up loops\n' : ''}- [[agents]] - Codex-facing operating rules and reusable role notes
- [[org/index]] - director, tribe, squad, and role topology (V2)
- [[initiatives/index]] - initiative pipeline artifacts (V2)
- [[discussions/index]] - layered discussion records (V2)
- [[decisions/index]] - decision records and tradeoffs (V2)
- [[briefings/index]] - director briefings to the CEO (V2)
- [[tasks/index]] - execution tasks derived from initiatives (V2)
- [[specs]] - spec-first feature packets with plan, tasks, and review docs
- [[handoffs]] - session continuity notes
- [[templates]] - reusable templates for future sessions
- [[assets]] - screenshots, PDFs, diagrams, and reference files

## Root Files
- \`AGENTS.md\` - Codex instructions for this repository
- [[execution-plan]] - build order, status, and next priorities
- [[constitution]] - project-level workflow and quality rules

## Session Log
- [[handoff-000]] - Brain initialized on ${created.slice(0, 10)}
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'AGENTS.md'),
    `# ${name} Agent Guide

> Part of [[index]]

## Session Start
- Read \`brian/index.md\`, \`brian/execution-plan.md\`, and the latest entry in \`brian/handoffs/\` before making non-trivial changes.
- Open the relevant folder index before changing code or docs.
${hasCommands ? '- Open [[commands]] and the relevant role note in [[agents]] when using the richer Codex workflow layer.\n' : ''}- Prefer small, verifiable edits over speculative rewrites.

## Workflow Contract
- intent -> proposal -> leadership discussion -> director decision -> tribe shaping -> squad planning -> execution -> verification -> merge -> briefing
- no execution without a context packet
- no unresolved discussion without an escalation record
- every interaction must emit one of: answer | decision | task | risk | escalation

## Working Rules
- Keep project-specific decisions in the brain files, not only in chat history.
- Update the matching brain note when architecture, priorities, or risks change.
- Use \`brian notes "<scope>"\` after changing a top-level or workflow note so downstream notes do not drift.
- End meaningful sessions with a new handoff note and execution plan updates.
- Prefer feature-length commits over tiny fragmented commits.
- Include explicit breaking-change callouts in commit messages when behavior or interfaces change.
- For UI-visible changes, attach a before/after image reference in commit or PR notes when possible.

## Verification
- Run the narrowest realistic check for the files you changed.
- If verification is incomplete, record the gap in the handoff.
`
  )

  writeFileIfMissing(
    path.join(docsRoot, 'execution-plan.md'),
    `# execution plan

> Part of [[index]]

## Phase 1 - Brain Setup

### EP-1 Brain scaffold
- **Status**: completed
- **Goal**: Create the Brian structure and register this project with the viewer.

## Phase 2 - Current Project Work

### EP-2 Inspect the existing codebase
- **Status**: not_started
- **Goal**: Summarize the real architecture, current priorities, and active risks for this project.

### EP-3 Replace placeholder notes with project-specific notes
- **Status**: not_started
- **Goal**: Refine the product, engineering, and operations notes from the actual repository.

### EP-4 Link existing docs and workflows into the brain
- **Status**: not_started
- **Goal**: Pull the existing repo docs and routines into the brain so Codex sees the real operating context.

### EP-5 Start the next meaningful task
- **Status**: not_started
- **Goal**: Use the updated brain to drive the next real code change.
`
  )

  writeFileIfMissing(path.join(docsRoot, 'constitution.md'), `# constitution

> Part of [[index]]

## Principles
- Markdown is the system state. If it matters, it must be written.
- Initiatives and decisions are primary; tasks are derived.
- Intent before implementation for non-trivial work.
- Multi-step refinement over one-shot generation (\`spec -> plan -> tasks -> review\`).
- Keep [[execution-plan]], [[team-board]], and [[handoffs]] in sync.
- Prefer feature-length but reversible slices with explicit verification.
- Call out breaking changes explicitly and attach UI evidence when feasible.
`)

  writeFileIfMissing(path.join(docsRoot, 'specs', 'specs.md'), `# specs

> Part of [[index]]

Spec packets live in this folder. Each packet should include:
- \`index.md\`
- \`spec.md\`
- \`plan.md\`
- \`tasks.md\`
- \`review.md\`
`)

  writeFileIfMissing(path.join(docsRoot, 'product', 'product.md'), `# product

> Part of [[index]]

This area tracks the user-facing purpose of the project, the scope, and the current priorities.

## Key Files
- [[project-goals]]
- [[current-scope]]
`)

  writeFileIfMissing(path.join(docsRoot, 'product', 'project-goals.md'), `# project goals

> Part of [[product]]

- Replace this note with the real goals of the existing project.
- Capture who the user is, what problem the project solves, and what "done" looks like.
`)

  writeFileIfMissing(path.join(docsRoot, 'product', 'current-scope.md'), `# current scope

> Part of [[product]]

- Record the features already implemented.
- Record what is intentionally deferred.
- Record any obvious mismatch between the current codebase and the intended product shape.
`)

  writeFileIfMissing(path.join(docsRoot, 'engineering', 'engineering.md'), `# engineering

> Part of [[index]]

This area tracks the real code structure, runtime model, and implementation constraints.

## Key Files
- [[architecture]]
- [[codebase-map]]
`)

  writeFileIfMissing(path.join(docsRoot, 'engineering', 'architecture.md'), `# architecture

> Part of [[engineering]]

- Replace this with the real runtime architecture of the project.
- Note the main entry points, services, frameworks, and persistence model.
`)

  writeFileIfMissing(path.join(docsRoot, 'engineering', 'codebase-map.md'), `# codebase map

> Part of [[engineering]]

## Important Commands
${scriptList}

## Important Paths
- Replace this with the real directories and files that matter most.
`)

  writeFileIfMissing(path.join(docsRoot, 'operations', 'operations.md'), `# operations

> Part of [[index]]

This area tracks how to run the project, verify changes, and keep session continuity intact.

## Key Files
- [[runbook]]
- [[workflow]]
- [[existing-docs]]
- [[../specs/specs]]
- [[../constitution]]
`)

  writeFileIfMissing(path.join(docsRoot, 'operations', 'existing-docs.md'), `# existing docs

> Part of [[operations]]

Imported markdown docs from the repository should be linked here when you run init with doc linking enabled.
`)

  writeFileIfMissing(path.join(docsRoot, 'operations', 'runbook.md'), `# runbook

> Part of [[operations]]

- Replace this with the real setup, run, test, and deploy commands for the project.
- Capture any environment prerequisites or local services.
${options.addPackageScripts ? '\n## Canonical V2 Commands\n- `npm run brain:viewer`\n- `npm run brain:intent -- "<initiative intent>"`\n- `npm run brain:propose -- "<initiative title>"`\n- `npm run brain:shape -- <initiative-id>`\n- `npm run brain:plan -- <initiative-id>`\n- `npm run brain:work`\n- `npm run brain:brief`\n- `npm run brain:decide -- <initiative-id> "<decision title>"`\n- `npm run brain:status`\n- `npm run brain:doctrine-lint`\n- `npm run brain:end`\n' : ''}
${options.installSkills ? '\n## Managed Skills\n- Brian installs a shared Codex skill pack under `~/.codex/skills/` for core work, roles, and team orchestration.\n' : ''}
`)

  writeFileIfMissing(path.join(docsRoot, 'operations', 'workflow.md'), `# workflow

> Part of [[operations]]

${hasCommands
  ? `1. Read [[index]], \`AGENTS.md\`, [[execution-plan]], and the latest handoff.
2. Use initiative-centric commands as canonical flow: \`brian intent\`, \`brian propose\`, \`brian shape\`, \`brian plan\`, \`brian work\`, \`brian brief\`, \`brian decide\`, \`brian status\`.
3. Use [[commands]] for run-loop details and consistency checks.
4. Open the relevant area note before editing code or docs.
5. Keep queue items feature-length and worktree-mapped (\`feature/worktree/image/breaking\`).
6. Record human verification in [[team-board]] before completing MERGE tasks.
7. Create a new handoff before ending a meaningful session.
8. Treat legacy aliases as migration-only; convert to canonical commands immediately.`
  : `1. Read [[index]], \`AGENTS.md\`, [[execution-plan]], and the latest handoff.
2. Inspect the relevant area before editing code.
3. Make a narrow, testable change.
4. Update the brain files and create a new handoff before ending the session.`}
`)

  if (hasCommands) {
    writeFileIfMissing(path.join(docsRoot, 'commands', 'commands.md'), `# commands

> Part of [[index]]

This folder defines the managed Codex workflow layer for the repository.

## Key Files
- [[start-loop]]
- [[plan-loop]]
- [[spec-loop]]
- [[team-board]]
- [[notes-loop]]
- [[end-loop]]
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'start-loop.md'), `# start loop

> Part of [[commands]]

## Canonical Start
\`\`\`bash
brian work
${options.addPackageScripts ? 'npm run brain:work' : 'brian work --role frontend'}
\`\`\`

## Sequence
1. \`brian work\` launches Codex with the Brian skill pack and startup context.
2. Open the relevant note index and role note before non-trivial work.
3. Keep the work scoped and update the brain when decisions change.
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'plan-loop.md'), `# plan loop

> Part of [[commands]]

## Canonical Planning
\`\`\`bash
brian plan <initiative-id>
${options.addPackageScripts ? 'npm run brain:plan -- <initiative-id>' : ''}
\`\`\`

## Sequence
1. Use \`brian plan\` to move an initiative into squad planning.
2. Use Codex \`/plan\` inside the chat to refine that step into an implementation sequence.
3. Record decisions and verification before editing code.
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'spec-loop.md'), `# spec loop

> Part of [[commands]]

## Canonical Spec-First Flow
\`\`\`bash
brian propose "Feature Name"
${options.addPackageScripts ? 'npm run brain:propose -- "Feature Name"' : ''}
\`\`\`

## Sequence
1. \`brian propose\` creates proposal-stage initiative records.
2. Continue with \`brian shape\`, \`brian plan\`, and \`brian work\`.
3. Keep team-board queue synced using feature/worktree metadata.
4. End with verification evidence and a handoff note.
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'notes-loop.md'), `# notes loop

> Part of [[commands]]

## Canonical Reconciliation
\`\`\`bash
brian brief
${options.addPackageScripts ? 'npm run brain:brief' : ''}
\`\`\`

## Sequence
1. Run \`brian brief\` after meaningful lifecycle or governance changes.
2. Let the director briefing capture downstream state changes explicitly.
3. Run \`brian doctrine-lint\` for an explicit integrity check.
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'team-board.md'), `# team board

> Part of [[index]]

This note is the viewer-facing coordination surface for managed multi-role work.

## Phase 99 - Team Board

### Step 99.1: Team workflow ready
- **Status**: in_progress
- [ ] NEXT: feature="Capture active role owners and owned paths for the current sprint" worktree=feature/owners-paths image=pending breaking=none
- [ ] NEXT: feature="Record review dependencies before opening parallel PRs" worktree=feature/review-dependencies image=pending breaking=none
- [ ] VERIFY: Human verifies feature behavior + acceptance criteria before merge.
- [ ] MERGE: worktree=feature/owners-paths -> main feature="Owners and owned paths baseline" image=pending breaking=none
- [ ] BLOCKER: Add unresolved blockers with owner + unblock condition.

### Step 99.2: Session updates
- **Status**: not_started
- [ ] NOTE: Refresh this board when plan state changes, not only at handoff time.
- [ ] NOTE: Keep statuses aligned with [[execution-plan]] to preserve viewer accuracy.
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'end-loop.md'), `# end loop

> Part of [[commands]]

## Canonical Wrap-Up
\`\`\`bash
brian end
${options.addPackageScripts ? 'npm run brain:end' : 'brian end --role backend'}
\`\`\`

## Sequence
1. Create the next handoff note.
2. Launch Codex with the managed wrap-up prompt and matching Brian role skills.
3. Fill it with what changed, verification, risks, and the next step.
4. Update [[execution-plan]] if progress changed.
`)
  }

  writeFileIfMissing(path.join(docsRoot, 'agents', 'agents.md'), `# agents

> Part of [[index]]

Codex-specific operating notes live here.

## Key Files
- [[project-operator]]
${hasCommands ? '- [[founder-ceo]]\n- [[director]]\n- [[tribe-head]]\n- [[product-lead]]\n- [[growth-marketing]]\n- [[frontend-engineer]]\n- [[backend-engineer]]\n- [[mobile-engineer]]\n- [[devops-release]]\n' : ''}`)

  writeFileIfMissing(path.join(docsRoot, 'agents', 'project-operator.md'), `# project operator

> Part of [[agents]]

## Purpose
Use this agent note for routine implementation work in Codex.

## Instructions
- Read the current brain state before coding.
- Prefer targeted edits and explicit verification.
- Keep decisions in the repository brain, not only in session memory.
- Use the managed Brian skill pack and role notes instead of rewriting the same prompts by hand.
`)

  if (hasCommands) {
    const roleNotes: Array<[string, string, string]> = [
      ['founder-ceo.md', 'founder / ceo', 'Use this note when shaping direction, priorities, positioning, or business tradeoffs. Keep the output high-level, explicit about tradeoffs, and tied back to the actual product constraints.'],
      ['director.md', 'director', 'Use this note for director-level decisions and escalation handling. Convert ambiguity into explicit yes/no or option-based decisions with concise rationale.'],
      ['tribe-head.md', 'tribe head', 'Use this note for tribe-level shaping and cross-squad escalation triage. Resolve what can be resolved locally, escalate only unresolved cross-cutting risks.'],
      ['product-lead.md', 'product lead', 'Use this note for scope shaping, requirement clarity, rollout planning, and user-facing tradeoffs. Convert vague ideas into concrete acceptance criteria before coding starts.'],
      ['growth-marketing.md', 'growth / marketing', 'Use this note for messaging, landing pages, funnels, lifecycle copy, or launch planning. Keep claims honest and tie messaging to the real product behavior.'],
      ['frontend-engineer.md', 'frontend engineer', 'Use this note for web UI, design systems, rendering behavior, and browser-facing user flows. Preserve existing UX patterns unless the product direction clearly changed.'],
      ['backend-engineer.md', 'backend engineer', 'Use this note for APIs, data contracts, services, and persistence concerns. Be explicit about schema, error handling, and contract drift risks.'],
      ['mobile-engineer.md', 'mobile engineer', 'Use this note for native or mobile-specific UI, device behavior, and performance-sensitive flows. Keep verification grounded in the platform reality.'],
      ['devops-release.md', 'devops / release', 'Use this note for build pipelines, environment setup, deploys, observability, or operational safety work. Prefer reversible changes and clear rollback guidance.'],
    ]

    for (const [fileName, title, body] of roleNotes) {
      writeFileIfMissing(path.join(docsRoot, 'agents', fileName), `# ${title}

> Part of [[agents]]

## Purpose
${body}

## Instructions
- Read the relevant brain notes before changing implementation details.
- Keep decisions explicit in the repository brain when workflows or priorities shift.
- Prefer the narrowest realistic verification for the work in this role.
`)
    }
  }

  writeFileIfMissing(path.join(docsRoot, 'assets', 'assets.md'), `# assets

> Part of [[index]]

Store screenshots, diagrams, PDFs, and other external reference material here.
`)

  writeFileIfMissing(path.join(docsRoot, 'org', 'index.md'), `# org

> Part of [[index]]

Document director, tribe, squad, and role structure here.
`)
  writeFileIfMissing(path.join(docsRoot, 'initiatives', 'index.md'), `# initiatives

> Part of [[index]]

Initiative proposals, shaped plans, and execution packets live here.
`)
  writeFileIfMissing(path.join(docsRoot, 'discussions', 'index.md'), `# discussions

> Part of [[index]]

Layered discussion records with unresolved questions and escalations.
`)
  writeFileIfMissing(path.join(docsRoot, 'decisions', 'index.md'), `# decisions

> Part of [[index]]

Decision records with rationale, tradeoffs, and owner.
`)
  writeFileIfMissing(path.join(docsRoot, 'briefings', 'index.md'), `# briefings

> Part of [[index]]

Director-to-CEO summaries and operating status.
`)
  writeFileIfMissing(path.join(docsRoot, 'tasks', 'index.md'), `# tasks

> Part of [[index]]

Execution tasks derived from initiatives and decisions.
`)

  writeFileIfMissing(path.join(docsRoot, 'templates', 'templates.md'), `# templates

> Part of [[index]]

## Key Files
- [[handoff-template]]
`)

  writeFileIfMissing(path.join(docsRoot, 'templates', 'handoff-template.md'), `# handoff template

> Part of [[templates]]

## Session

## Summary

## Files Updated

## Verification

## Commit Notes
- Breaking changes:
- Commit scope:
- UI before/after evidence:

## Open Risks

## Recommended Next Step
`)

  writeFileIfMissing(path.join(docsRoot, 'handoffs', 'handoffs.md'), `# handoffs

> Part of [[index]]

## Session History
- [[handoff-000]] - Brain initialized
`)

  writeFileIfMissing(path.join(docsRoot, 'handoffs', 'handoff-000.md'), `# handoff-000

> Part of [[handoffs]]

## Session
${humanNow()}

## Summary
Initialized a Codex-first Brian workspace for this existing project.

## Files Updated
- Added the Brian scaffold and registration metadata.

## Verification
- Brain files created
- Brain registered in ~/.brian/brains.json

## Open Risks
- Placeholder notes still need to be replaced with project-specific content.

## Recommended Next Step
Inspect the real repository and replace the placeholder notes in [[product]], [[engineering]], and [[operations]].
`)

  if (options.addPackageScripts) injectPackageScripts(brainRoot, preset)
  if (options.installSkills) installBrianSkills()
  if (options.linkExistingDocs) linkExistingDocs(brainRoot)

  return meta
}

function formatViewerUrl(brainId: string): string | null {
  if (!fs.existsSync(SERVER_JSON)) return null
  try {
    const server = JSON.parse(fs.readFileSync(SERVER_JSON, 'utf8'))
    if (server && server.port) {
      return `http://localhost:${server.port}/brains/${brainId}`
    }
  } catch {
    // ignore broken server config
  }
  return null
}

function printStatus(brainRoot?: string) {
  if (brainRoot) {
    const meta = readBrainMeta(brainRoot)
    if (meta) {
      console.log(`  Brain: ${meta.name}`)
      console.log(`  Path: ${brainRoot}`)
      const initiatives = listV2Initiatives(brainRoot)
      if (initiatives.length > 0) {
        const byStage = new Map<string, number>()
        for (const item of initiatives) byStage.set(item.stage, (byStage.get(item.stage) ?? 0) + 1)
        console.log(`  V2 initiatives: ${initiatives.length}`)
        console.log(`  V2 pipeline: ${Array.from(byStage.entries()).map(([stage, count]) => `${stage}=${count}`).join(', ')}`)
      }
      const viewerUrl = formatViewerUrl(meta.id)
      if (viewerUrl) console.log(`  Viewer: ${viewerUrl}`)
      return
    }
  }

  const config = readBrainsConfig()
  if (config.brains.length === 0) {
    console.log('  No brains registered yet.')
    console.log('  Run `brian init` inside an existing project to create one.')
    return
  }

  console.log(`  Registered brains (${config.brains.length}):`)
  for (const brain of config.brains) {
    console.log(`    ${brain.name} -> ${brain.path}`)
  }
}

function printResume(brainRoot: string) {
  const handoffDir = handoffsDirPath(brainRoot)
  const latestHandoff = fs.existsSync(handoffDir)
    ? fs.readdirSync(handoffDir)
        .filter(file => /^handoff-.*\.md$/.test(file))
        .sort()
        .at(-1)
    : null

  console.log('')
  console.log('  Resume this brain by reading:')
  console.log(`  - ${rootIndexPath(brainRoot)}`)
  console.log(`  - ${path.join(brainRoot, 'AGENTS.md')}`)
  console.log(`  - ${executionPlanNotePath(brainRoot)}`)
  const commandsPath = path.join(brainRoot, 'brian', 'commands', 'commands.md')
  if (fs.existsSync(commandsPath)) {
    console.log(`  - ${commandsPath}`)
  }
  if (latestHandoff) {
    console.log(`  - ${path.join(handoffDir, latestHandoff)}`)
  }
  console.log('')
  console.log('  Then inspect the relevant folder index before editing code.')
  console.log('')
}

function buildNotesPrompt(brainRoot: string, scope: string): string {
  const commandsPath = path.join(brainRoot, 'brian', 'commands', 'commands.md')
  const commandsText = fs.existsSync(commandsPath)
    ? ` Also read ${commandsPath}.`
    : ''

  return [
    `Reconcile the Brian notes in ${brainRoot} after changes to "${scope}".`,
    `Read ${rootIndexPath(brainRoot)}, ${path.join(brainRoot, 'AGENTS.md')}, ${executionPlanNotePath(brainRoot)}, and the latest handoff in ${handoffsDirPath(brainRoot)}.${commandsText}`,
    `Treat "${scope}" as the authoritative changed note, area, or workflow input.`,
    'Update only the downstream brain notes whose assumptions, priorities, workflows, or command references are now stale.',
    'Keep wikilinks valid, preserve the existing structure, and avoid changing product code unless a note references a stale path or command.',
    'End with a concise summary of which notes changed and whether any manual follow-up is still needed.',
  ].join(' ')
}

function moveIfMissing(fromPath: string, toPath: string): boolean {
  if (!fs.existsSync(fromPath) || fs.existsSync(toPath)) return false
  fs.mkdirSync(path.dirname(toPath), { recursive: true })
  fs.renameSync(fromPath, toPath)
  return true
}

function migrateLegacyLayout(brainRoot: string): string[] {
  const moved: string[] = []
  const moves: Array<[string, string]> = [
    [path.join(brainRoot, '.braintree', 'brain.json'), path.join(brainRoot, '.brian', 'brain.json')],
    [path.join(brainRoot, 'BRAIN-INDEX.md'), path.join(brainRoot, 'brian', 'index.md')],
    [path.join(brainRoot, 'Execution-Plan.md'), path.join(brainRoot, 'brian', 'execution-plan.md')],
    [path.join(brainRoot, '01_Product'), path.join(brainRoot, 'brian', 'product')],
    [path.join(brainRoot, '02_Engineering'), path.join(brainRoot, 'brian', 'engineering')],
    [path.join(brainRoot, '03_Operations'), path.join(brainRoot, 'brian', 'operations')],
    [path.join(brainRoot, 'Commands'), path.join(brainRoot, 'brian', 'commands')],
    [path.join(brainRoot, 'Agents'), path.join(brainRoot, 'brian', 'agents')],
    [path.join(brainRoot, 'Handoffs'), path.join(brainRoot, 'brian', 'handoffs')],
    [path.join(brainRoot, 'Templates'), path.join(brainRoot, 'brian', 'templates')],
    [path.join(brainRoot, 'Assets'), path.join(brainRoot, 'brian', 'assets')],
  ]

  for (const [fromPath, toPath] of moves) {
    if (moveIfMissing(fromPath, toPath)) {
      moved.push(`${path.relative(brainRoot, fromPath)} -> ${path.relative(brainRoot, toPath)}`)
    }
  }

  return moved
}

function createWrapUp(brainRoot: string): string {
  const handoffDir = handoffsDirPath(brainRoot)
  fs.mkdirSync(handoffDir, { recursive: true })

  const existing = fs.readdirSync(handoffDir)
    .filter(file => /^handoff-\d+\.md$/.test(file))
    .map(file => Number(file.match(/^handoff-(\d+)\.md$/)?.[1] || '0'))

  const next = String((existing.length > 0 ? Math.max(...existing) : 0) + 1).padStart(3, '0')
  const fileName = `handoff-${next}.md`
  const handoffPath = path.join(handoffDir, fileName)

  writeFileIfMissing(
    handoffPath,
    `# ${fileName.replace('.md', '')}

> Part of [[handoffs]]

## Session
${humanNow()}

## Summary

## Files Updated

## Verification

## Commit Notes
- Breaking changes:
- Commit scope:
- UI before/after evidence:

## Open Risks

## Recommended Next Step
`
  )

  const handoffsIndexPath = path.join(handoffDir, 'handoffs.md')
  writeFileIfMissing(
    handoffsIndexPath,
    '# handoffs\n\n> Part of [[index]]\n\n## Session History\n'
  )

  updateFileIfExists(handoffsIndexPath, content => {
    const entry = `- [[${fileName.replace('.md', '')}]] - Session wrap-up`
    return content.includes(entry) ? content : content.trimEnd() + '\n' + entry + '\n'
  })

  return handoffPath
}

function runDoctrineLint(brainRoot: string): { ok: boolean; issues: string[] } {
  const issues: string[] = []
  const agentsPath = path.join(brainRoot, 'AGENTS.md')
  const constitutionPath = path.join(brainRoot, 'brian', 'constitution.md')
  const initiativesDir = path.join(brainRoot, 'brian', 'initiatives')
  const discussionsDir = path.join(brainRoot, 'brian', 'discussions')
  const decisionsDir = path.join(brainRoot, 'brian', 'decisions')

  const pipelineContract = 'intent -> proposal -> leadership discussion -> director decision -> tribe shaping -> squad planning -> execution -> verification -> merge -> briefing'
  const agentsContent = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : ''
  const constitutionContent = fs.existsSync(constitutionPath) ? fs.readFileSync(constitutionPath, 'utf8') : ''

  if (!agentsContent.toLowerCase().includes(pipelineContract)) {
    issues.push('AGENTS.md missing hard workflow contract pipeline.')
  }
  if (!agentsContent.includes('every interaction must emit one of')) {
    issues.push('AGENTS.md missing interaction output contract.')
  }
  if (!constitutionContent.toLowerCase().includes('markdown')) {
    issues.push('constitution.md should explicitly assert markdown-first doctrine.')
  }

  if (!fs.existsSync(initiativesDir)) {
    issues.push('brian/initiatives is missing.')
  } else {
    for (const file of fs.readdirSync(initiativesDir).filter((f) => f.endsWith('.md') && f !== 'index.md')) {
      const raw = fs.readFileSync(path.join(initiativesDir, file), 'utf8')
      if (!/^stage:\s+.+$/m.test(raw)) issues.push(`initiative missing stage metadata: ${file}`)
    }
  }

  const discussions = fs.existsSync(discussionsDir)
    ? fs.readdirSync(discussionsDir).filter((f) => f.endsWith('.md') && f !== 'index.md')
    : []
  const decisions = fs.existsSync(decisionsDir)
    ? fs.readdirSync(decisionsDir).filter((f) => f.endsWith('.md') && f !== 'index.md')
    : []

  const unresolved = discussions.filter((file) => {
    const raw = fs.readFileSync(path.join(discussionsDir, file), 'utf8')
    const status = raw.match(/^status:\s+(.+)$/m)?.[1]?.trim() || 'open'
    return status === 'open' || status === 'escalated'
  })
  if (unresolved.length > 0 && decisions.length === 0) {
    issues.push('open discussions exist without any decision records.')
  }

  const eventPath = v2EventLogPath(brainRoot)
  if (eventPath && fs.existsSync(eventPath)) {
    const events = fs.readFileSync(eventPath, 'utf8').split('\n').filter(Boolean)
    const merged = events.some((line) => line.includes('"kind":"merge_completed"'))
    const verified = events.some((line) => line.includes('"kind":"verification_recorded"'))
    if (merged && !verified) {
      issues.push('merge_completed events found without verification_recorded event.')
    }
  }

  return { ok: issues.length === 0, issues }
}

async function findFreePort(preferred: number): Promise<number> {
  return new Promise(resolve => {
    const server = net.createServer()
    server.listen(preferred, () => {
      server.close(() => resolve(preferred))
    })
    server.on('error', () => {
      const server2 = net.createServer()
      server2.listen(0, () => {
        const port = (server2.address() as net.AddressInfo).port
        server2.close(() => resolve(port))
      })
    })
  })
}

async function openBrowser(url: string) {
  try {
    const open = (await import('open')).default
    await open(url)
  } catch {
    // Browser open failed silently, URL is shown in welcome message
  }
}

function saveServerConfig(port: number) {
  const payload = JSON.stringify({ port, pid: process.pid, startedAt: new Date().toISOString() }, null, 2) + '\n'
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(SERVER_JSON, payload)
}

function cleanupServerConfig() {
  try {
    if (fs.existsSync(SERVER_JSON)) fs.unlinkSync(SERVER_JSON)
  } catch {
    // ignore cleanup errors
  }
}

function showWelcome(port: number) {
  const url = `http://localhost:${port}/brains`
  console.log('')
  console.log(`  Brian v${VERSION}`)
  console.log('')
  console.log('  > Codex-first workflow enabled')
  console.log(`  > Server running at ${url}`)
  console.log('')
  console.log('  +-------------------------------------------------------------+')
  console.log('  |                                                             |')
  console.log('  |  To create a brain for an existing project:                 |')
  console.log('  |                                                             |')
  console.log('  |  1. Open that project in a terminal                         |')
  console.log('  |  2. Run: brian init                                         |')
  console.log('  |  3. Run: brian intent "New initiative"                      |')
  console.log('  |  4. Then: brian propose / brian shape / brian plan / brian work |')
  console.log('  |  5. Use brian brief + brian decide for director loop        |')
  console.log('  |                                                             |')
  console.log('  |  The brain will appear in the viewer automatically.         |')
  console.log('  +-------------------------------------------------------------+')
  console.log('')
  console.log('  Press Ctrl+C to stop the server.')
  console.log('')
}

function showHelp() {
  console.log(`
  brian v${VERSION} - Codex-first brain viewer and workflow

  Usage:
    brian                           Start the viewer
    brian init                      Create a Brian scaffold in the current project
    brian status                    Show the current brain or all registered brains
    brian intent <text>             Capture initiative intent
    brian propose <name>            Create proposal-stage initiative
    brian shape <initiative-id>     Move initiative to tribe shaping stage
    brian plan <initiative-id> [--squad <name>]   Plan initiative using a squad's agent roster
    brian work                      Launch Codex with managed Brian start context
    brian verify                    Record verification gate for active initiative
    brian merge                     Record merge completion for active initiative
    brian mission <name> [--squad <name>]  Prepare a mission packet + squad worktree queue
    brian end                       Create handoff + launch managed wrap-up context
    brian brief                     Generate director briefing note
    brian decide <id> <title>       Record director decision
    brian doctrine-lint             Validate workflow doctrine + governance hygiene
    brian resume                    Show the files to read before working
    brian codex                     Show the Codex slash-command mapping for Brian
    brian help                      Show this help

  Viewer options:
    --port <number>                 Custom port (default: 3000)
    --no-open                       Don't auto-open browser

  Init options:
    --name <text>                   Override the brain name
    --description <text>            Override the brain description
    --preset <core|codex-team>      Choose the scaffold depth (default: codex-team)
    --yes                           Accept init defaults without prompts
    --link-existing-docs            Link existing markdown docs into the brain
    --no-link-existing-docs         Skip linking existing markdown docs
    --package-scripts               Add package.json brain helper scripts when possible
    --no-package-scripts            Skip package.json helper scripts
    --install-skills                Install the managed Brian Codex skill pack
    --no-install-skills             Skip skill-pack installation

  Session options:
    --role <general|founder|product|marketing|frontend|backend|mobile|ops>
`)
}

async function startViewer(args: string[]) {
  const noOpen = hasFlag(args, '--no-open')
  const preferredPort = Number(parseOption(args, '--port') || '3000')

  ensureConfigDir()

  const port = await findFreePort(preferredPort)
  saveServerConfig(port)

  const webDir = path.join(__dirname, '..', '..', 'web')
  const serverScript = path.join(webDir, 'src', 'server', 'custom-server.ts')
  const serverDist = path.join(webDir, 'dist', 'server', 'custom-server.js')
  const isBuilt = fs.existsSync(path.join(webDir, '.next'))

  let child: ReturnType<typeof spawn>

  if (isBuilt && fs.existsSync(serverDist)) {
    child = spawn('node', [serverDist], {
      env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
      stdio: 'inherit',
      cwd: webDir,
    })
  } else if (isBuilt) {
    child = spawn('npx', ['next', 'start', '-p', String(port)], {
      env: { ...process.env, PORT: String(port) },
      stdio: 'inherit',
      cwd: webDir,
    })
  } else {
    child = spawn('npx', ['tsx', serverScript], {
      env: { ...process.env, PORT: String(port), NODE_ENV: 'development' },
      stdio: 'inherit',
      cwd: webDir,
    })
  }

  child.on('error', err => {
    cleanupServerConfig()
    console.error('Failed to start server:', err.message)
    process.exit(1)
  })

  setTimeout(() => {
    showWelcome(port)
    if (!noOpen) openBrowser(`http://localhost:${port}/brains`)
  }, 2000)

  const cleanup = () => {
    cleanupServerConfig()
    child.kill('SIGINT')
    setTimeout(() => process.exit(0), 1000)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  child.on('exit', code => {
    cleanupServerConfig()
    process.exit(code ?? 0)
  })
}

function commandArgs(allArgs: string[], command: string): string[] {
  return allArgs[0] === command ? allArgs.slice(1) : allArgs
}

async function main() {
  const allArgs = process.argv.slice(2)
  const command = allArgs[0] && !allArgs[0].startsWith('-') ? allArgs[0] : 'start'
  const args = commandArgs(allArgs, command)
  const retiredCommands = new Set(['next', 'spec', 'feature', 'sprint', 'sync', 'notes', 'wrap-up', 'migrate'])

  if (command === 'help' || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    showHelp()
    return
  }

  if (command === 'start') {
    await startViewer(args)
    return
  }

  if (retiredCommands.has(command)) {
    console.log(`  Command retired: brian ${command}`)
    console.log('  Canonical workflow: intent -> propose -> shape -> plan -> work -> verify -> merge -> brief')
    process.exitCode = 1
    return
  }

  if (command === 'intent') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    const text = args.join(' ').trim()
    if (!text) {
      console.log('  Usage: brian intent <text>')
      return
    }
    const id = `initiative-${crypto.randomUUID().slice(0, 8)}`
    const note = writeInitiativeRecord(brainRoot, { id, title: text, stage: 'intent', summary: text })
    appendV2Event(brainRoot, {
      actor: 'project-operator',
      layer: 'system',
      stage: 'intent',
      kind: 'initiative_created',
      message: `intent captured: ${text}`,
      initiativeId: id,
    })
    console.log(`  Intent captured: ${id}`)
    console.log(`  Note: ${note}`)
    return
  }

  if (command === 'propose') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    const title = args.join(' ').trim()
    if (!title) {
      console.log('  Usage: brian propose <name>')
      return
    }
    const id = `initiative-${crypto.randomUUID().slice(0, 8)}`
    const note = writeInitiativeRecord(brainRoot, { id, title, stage: 'proposal', summary: title })
    appendV2Event(brainRoot, {
      actor: 'product-lead',
      layer: 'tribe',
      stage: 'proposal',
      kind: 'initiative_created',
      message: `proposal created: ${title}`,
      initiativeId: id,
    })
    console.log(`  Proposal created: ${id}`)
    console.log(`  Note: ${note}`)
    return
  }

  if (command === 'shape') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    const initiativeId = args[0]?.trim()
    if (!initiativeId) {
      console.log('  Usage: brian shape <initiative-id>')
      return
    }
    const initiatives = listV2Initiatives(brainRoot)
    const initiative = initiatives.find((item) => item.id === initiativeId)
    if (!initiative) {
      console.log(`  Initiative not found: ${initiativeId}`)
      return
    }
    const note = writeInitiativeRecord(brainRoot, {
      id: initiative.id,
      title: initiative.title,
      stage: 'tribe_shaping',
      summary: `Shaped for implementation: ${initiative.title}`,
    })
    appendV2Event(brainRoot, {
      actor: 'product-lead',
      layer: 'tribe',
      stage: 'tribe_shaping',
      kind: 'task_planned',
      message: `initiative shaped: ${initiative.title}`,
      initiativeId: initiative.id,
    })
    console.log(`  Initiative shaped: ${initiative.id}`)
    console.log(`  Note: ${note}`)
    return
  }

  if (command === 'brief') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    ensureV2Docs(brainRoot)
    const initiatives = listV2Initiatives(brainRoot)
    const pending = initiatives.filter((item) => item.stage !== 'execution')
    const id = `briefing-${crypto.randomUUID().slice(0, 8)}`
    const filePath = path.join(brainRoot, 'brian', 'briefings', `${id}.md`)
    const summary = `Initiatives: ${initiatives.length}; pending progression: ${pending.length}`
    fs.writeFileSync(
      filePath,
      [
        '---',
        `id: ${id}`,
        `title: Director briefing ${new Date().toISOString().slice(0, 10)}`,
        `summary: ${summary}`,
        `published: false`,
        `at: ${isoNow()}`,
        '---',
        '',
        `# Director briefing`,
        '',
        `- ${summary}`,
        '',
      ].join('\n'),
      'utf8'
    )
    updateFileIfExists(path.join(brainRoot, 'brian', 'briefings', 'index.md'), (content) => {
      const link = `- [[${id}]]`
      return content.includes(link) ? content : `${content.trimEnd()}\n${link}\n`
    })
    appendV2Event(brainRoot, {
      actor: 'founder-ceo',
      layer: 'director',
      stage: 'director_decision',
      kind: 'briefing_generated',
      message: summary,
    })
    console.log(`  Briefing generated: ${filePath}`)
    return
  }

  if (command === 'decide') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    const initiativeId = args[0]?.trim()
    const title = args.slice(1).join(' ').trim()
    if (!initiativeId || !title) {
      console.log('  Usage: brian decide <initiative-id> <title>')
      return
    }
    const decision = createDecisionRecord(brainRoot, {
      initiativeId,
      title,
      status: 'pending',
      rationale: 'Decision captured via CLI.',
    })
    appendV2Event(brainRoot, {
      actor: 'founder-ceo',
      layer: 'director',
      stage: 'director_decision',
      kind: 'decision_recorded',
      message: title,
      initiativeId,
    })
    console.log(`  Decision recorded: ${decision.filePath}`)
    return
  }

  if (command === 'doctrine-lint') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    const result = runDoctrineLint(brainRoot)
    if (result.ok) {
      console.log('  Doctrine lint passed.')
      return
    }
    console.log(`  Doctrine lint failed (${result.issues.length})`)
    for (const issue of result.issues) console.log(`  - ${issue}`)
    process.exitCode = 1
    return
  }

  if (command === 'status') {
    printStatus(findBrainRoot(process.cwd()) || undefined)
    return
  }

  if (command === 'init') {
    const existingBrain = findBrainRoot(process.cwd())
    if (existingBrain) {
      console.log(`  Brian workspace already exists at ${existingBrain}`)
      console.log('  Run `brian resume` to continue working with it.')
      return
    }

    const brainRoot = process.cwd()
    const initOptions = await resolveInitOptions(brainRoot, args)
    const meta = createBrainScaffold(brainRoot, initOptions)

    registerBrain({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      path: brainRoot,
      created: meta.created,
    })

    console.log(`  Brain created for ${meta.name}`)
    console.log(`  Path: ${brainRoot}`)
    const viewerUrl = formatViewerUrl(meta.id)
    if (viewerUrl) {
      console.log(`  Viewer: ${viewerUrl}`)
    } else {
      console.log('  Start `brian` to open the viewer.')
    }
    console.log(`  Preset: ${initOptions.preset}`)
    if (initOptions.addPackageScripts) {
      console.log('  Package scripts: added helper `brain:*` scripts to package.json')
    }
    if (initOptions.installSkills) {
      console.log(`  Skill pack: installed managed Brian skills into ${CODEX_SKILLS_DIR}`)
    }
    if (initOptions.linkExistingDocs) {
      console.log('  Existing docs: linked into brian/operations/existing-docs.md where possible')
    }
    console.log('  Next: run `brian intent "<initiative>"` then `brian propose "<title>"` to start the lifecycle.')
    return
  }

  if (command === 'resume') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` inside an existing project to create one.')
      return
    }

    printResume(brainRoot)
    return
  }

  if (command === 'wrap-up') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    warnLegacyAlias(brainRoot, 'wrap-up')

    const handoffPath = createWrapUp(brainRoot)
    console.log(`  Created handoff template: ${handoffPath}`)
    console.log('  Fill it in, then update brian/execution-plan.md before ending the session.')
    return
  }

  if (command === 'work') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    const roleName = parseOption(args, '--role')
    printResume(brainRoot)
    const exitCode = await runInherited('codex', [buildWorkPrompt(brainRoot, roleName)], brainRoot)
    if (exitCode !== 0) process.exit(exitCode)
    return
  }

  if (command === 'verify') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    const initiatives = listV2Initiatives(brainRoot)
    const active = initiatives.find((item) => item.stage === 'execution') ?? initiatives[0]
    if (!active) {
      console.log('  No active initiative to verify.')
      return
    }
    appendV2Event(brainRoot, {
      actor: 'project-operator',
      layer: 'squad',
      stage: 'execution',
      kind: 'verification_recorded',
      message: `verification recorded for ${active.title}`,
      initiativeId: active.id,
    })
    console.log(`  Verification recorded for ${active.id}`)
    return
  }

  if (command === 'merge') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    const initiatives = listV2Initiatives(brainRoot)
    const active = initiatives.find((item) => item.stage === 'execution') ?? initiatives[0]
    if (!active) {
      console.log('  No active initiative to merge.')
      return
    }
    appendV2Event(brainRoot, {
      actor: 'project-operator',
      layer: 'squad',
      stage: 'execution',
      kind: 'merge_completed',
      message: `merge recorded for ${active.title}`,
      initiativeId: active.id,
    })
    console.log(`  Merge recorded for ${active.id}`)
    return
  }

  if (command === 'end') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    const roleName = parseOption(args, '--role')
    const handoffPath = createWrapUp(brainRoot)
    console.log(`  Created handoff template: ${handoffPath}`)
    const exitCode = await runInherited('codex', [buildEndPrompt(brainRoot, roleName)], brainRoot)
    if (exitCode !== 0) process.exit(exitCode)
    return
  }

  if (command === 'migrate') {
    const brainRoot = findBrainRoot(process.cwd(), true)
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    const moved = migrateLegacyLayout(brainRoot)
    if (moved.length === 0) {
      console.log('  No legacy paths needed migration.')
    } else {
      console.log('  Migrated paths:')
      for (const item of moved) console.log(`  - ${item}`)
    }
    console.log('  Next: run `brian resume` and `brian doctrine-lint` to verify the new layout.')
    return
  }

  if (command === 'notes') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    const scope = args.join(' ').trim()
    if (!scope) {
      console.log('  Usage: brian notes "<scope>"')
      return
    }
    warnLegacyAlias(brainRoot, 'notes')

    const exitCode = await runInherited('codex', ['exec', '--full-auto', '--ephemeral', buildNotesPrompt(brainRoot, scope)], brainRoot)
    if (exitCode !== 0) {
      process.exit(exitCode)
    }
    console.log('  Reconciliation finished. Run `brian doctrine-lint` if you want an explicit integrity check.')
    return
  }

  if (command === 'next') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    warnLegacyAlias(brainRoot, 'next')

    const recommendation = recommendNextAction(brainRoot)

    console.log('')
    console.log(`  Brain root: ${brainRoot}`)
    console.log(`  Recommended canonical command: ${recommendation.command}`)
    console.log(`  Reason: ${recommendation.reason}`)
    console.log('')
    return
  }

  if (command === 'plan') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    const squadName = parseOption(args, '--squad')
    const positionalArgs = removeOptionArgs(args, '--squad')
    const stepArg = positionalArgs[0]
    const initiatives = listV2Initiatives(brainRoot)
    const looksLegacyStep = typeof stepArg === 'string' && /^ep-/i.test(stepArg)
    const initiativeMatch = stepArg ? initiatives.find((item) => item.id.toLowerCase() === stepArg.toLowerCase()) : null

    if (!looksLegacyStep && (initiativeMatch || (initiatives.length > 0 && stepArg && !/^ep-/i.test(stepArg)))) {
      if (!stepArg) {
        console.log('  Usage: brian plan <initiative-id> [--squad <name>]')
        return
      }
      if (!initiativeMatch) {
        console.log(`  Initiative not found: ${stepArg}`)
        console.log('  Available initiatives:')
        for (const item of initiatives.slice(0, 10)) console.log(`  - ${item.id}: ${item.title}`)
        return
      }
      const notePath = writeInitiativeRecord(brainRoot, {
        id: initiativeMatch.id,
        title: initiativeMatch.title,
        stage: 'squad_planning',
        summary: `Planned execution scope for ${initiativeMatch.title}`,
      })
      appendV2Event(brainRoot, {
        actor: 'project-operator',
        layer: 'squad',
        stage: 'squad_planning',
        kind: 'task_planned',
        message: `initiative planned: ${initiativeMatch.title}`,
        initiativeId: initiativeMatch.id,
      })
      const squad = resolveSquad(brainRoot, squadName)
      const board = appendSquadMissionTeamBoard(brainRoot, initiativeMatch.title, initiativeMatch.id, squad)
      console.log(`  Initiative planned: ${initiativeMatch.id}`)
      console.log(`  Squad: ${squad.name} (${squad.id})`)
      console.log(`  Note: ${notePath}`)
      console.log(`  Team board step: ${board.stepNumber}`)
      if (board.worktrees.length > 0) {
        console.log(`  Worktrees queued (${board.worktrees.length}):`)
        for (const wt of board.worktrees) console.log(`  - ${wt}`)
        console.log(`  Merge order: ${board.mergeOrder.join(' -> ')}`)
      } else {
        console.log('  Team board step already existed; no new worktrees added.')
      }
      return
    }

    if (looksLegacyStep && stepArg) {
      appendLegacyTelemetry(brainRoot, `brian plan ${stepArg}`, 'brian plan <initiative-id>')
      console.log(`  Interpreting legacy execution-plan step "${stepArg}"`)
      console.log('  Recommended command: brian plan <initiative-id>')
    }

    const executionPlan = readExecutionPlanSteps(brainRoot)
    if (!executionPlan || executionPlan.steps.length === 0) {
      console.log('  No parseable execution plan found.')
      console.log('  Keep using Codex `/plan`, but add brian/execution-plan.md if you want Brian step planning.')
      return
    }

    const completedIds = new Set(
      executionPlan.steps.filter(step => step.status === 'completed').map(step => step.id)
    )
    const readySteps = executionPlan.steps.filter(step => {
      if (step.status !== 'not_started') return false
      return step.dependencies.every(dep => completedIds.has(dep))
    })
    const inProgressSteps = executionPlan.steps.filter(step => step.status === 'in_progress')

    if (!stepArg) {
      console.log('')
      printSteps('In progress', inProgressSteps)
      printSteps('Ready to plan', readySteps)
      console.log('  Next:')
      console.log('  - Run `brian plan <step-id>` to create a linked plan note.')
      console.log('  - Optional: pass `--squad "<name>"` to bind queue generation to a squad roster.')
      console.log('  - In Codex, use `/plan` for the conversation-level planning pass.')
      console.log('')
      return
    }

    const step = executionPlan.steps.find(candidate => candidate.id.toLowerCase() === stepArg.toLowerCase())
    if (!step) {
      console.log(`  Step not found: ${stepArg}`)
      return
    }

    const operations = resolveFolderContext(brainRoot, [
      { dir: path.join('brian', 'operations'), index: 'operations.md', name: 'operations' },
    ])

    if (!operations) {
      console.log('  No Operations index found to attach the plan note.')
      return
    }

    const fileName = `plan-${slugify(step.id)}.md`
    const planPath = ensureLinkedNote(
      operations.dir,
      operations.indexPath,
      operations.indexName,
      fileName,
      `plan ${step.id}`,
      `## Step\n- **ID**: ${step.id}\n- **Title**: ${step.title}\n- **Phase**: ${step.phase}\n- **Dependencies**: ${step.dependencies.length > 0 ? step.dependencies.join(', ') : 'none'}\n\n## Goal\n${step.title}\n\n## Suggested Codex Prompt\nUse \`/plan\` in Codex with this request:\n\n\`/plan Propose an implementation plan for ${step.id}: ${step.title}. Read brian/index.md, AGENTS.md, brian/execution-plan.md, and this note first.\`\n\n## Tasks\n- [ ] Inspect the relevant notes and code paths\n- [ ] Break the work into concrete changes\n- [ ] Decide verification before editing\n- [ ] Record decisions and risks\n\n## Verification\n- Add the exact checks to run before execution starts.\n`
    )

    updateExecutionPlanStepStatus(executionPlan.path, step.id, 'in_progress')

    console.log(`  Created step plan: ${planPath}`)
    console.log('  Next in Codex: run `/plan` and reference this note plus brian/execution-plan.md.')
    return
  }

  if (command === 'sprint') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    warnLegacyAlias(brainRoot, 'sprint')

    const executionPlan = readExecutionPlanSteps(brainRoot)
    if (!executionPlan || executionPlan.steps.length === 0) {
      console.log('  No parseable execution plan found.')
      return
    }

    const completedIds = new Set(
      executionPlan.steps.filter(step => step.status === 'completed').map(step => step.id)
    )
    const inProgress = executionPlan.steps.filter(step => step.status === 'in_progress')
    const ready = executionPlan.steps.filter(step => {
      if (step.status !== 'not_started') return false
      return step.dependencies.every(dep => completedIds.has(dep))
    })

    const operations = resolveFolderContext(brainRoot, [
      { dir: path.join('brian', 'operations'), index: 'operations.md', name: 'operations' },
    ])

    if (!operations) {
      console.log('  No Operations index found to attach the sprint note.')
      return
    }

    const dateStamp = new Date().toISOString().slice(0, 10)
    const fileName = `sprint-${dateStamp}.md`
    const sprintPath = ensureLinkedNote(
      operations.dir,
      operations.indexPath,
      operations.indexName,
      fileName,
      `sprint ${dateStamp}`,
      `## Current Focus\n${inProgress.length > 0 ? inProgress.map(step => `- [ ] ${step.id}: ${step.title}`).join('\n') : '- No in-progress steps'}\n\n## Ready Queue\n${ready.length > 0 ? ready.slice(0, 5).map(step => `- [ ] ${step.id}: ${step.title}`).join('\n') : '- No unblocked steps ready'}\n\n## Suggested Codex Prompt\nUse \`/plan\` in Codex with:\n\n\`/plan Propose a one-week sprint using this sprint note, brian/execution-plan.md, AGENTS.md, and the latest handoff.\`\n`
    )

    console.log(`  Created sprint note: ${sprintPath}`)
    console.log('  Next in Codex: run `/plan` to refine the sprint inside the active chat.')
    return
  }

  if (command === 'spec' || command === 'feature') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    warnLegacyAlias(brainRoot, command)

    const featureName = args.join(' ').trim()
    if (!featureName) {
      console.log(`  Usage: brian ${command} <name>`)
      return
    }

    const packet = createSpecPacket(brainRoot, featureName)
    console.log(`  Spec packet ready: ${packet.dir}`)
    console.log(`  Next: run \`brian propose "${featureName}"\` to continue in canonical lifecycle.`)
    return
  }

  if (command === 'mission') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    warnLegacyAlias(brainRoot, 'mission')

    const squadName = parseOption(args, '--squad')
    const positionalArgs = removeOptionArgs(args, '--squad')
    const featureName = positionalArgs.join(' ').trim()
    if (!featureName) {
      console.log('  Usage: brian mission <name> [--squad <name>]')
      return
    }

    const packet = createSpecPacket(brainRoot, featureName)
    const stepId = appendMissionExecutionPlan(brainRoot, featureName, packet.slug)
    const squad = resolveSquad(brainRoot, squadName)
    const teamStep = appendSquadMissionTeamBoard(brainRoot, featureName, stepId, squad)

    console.log(`  Mission prepared for "${featureName}"`)
    console.log(`  Squad: ${squad.name} (${squad.id})`)
    console.log(`  Spec packet: ${packet.dir}`)
    console.log(`  Execution plan: ${stepId}`)
    console.log(`  Team board: Step ${teamStep.stepNumber}`)
    if (teamStep.worktrees.length > 0) {
      console.log(`  Worktrees queued (${teamStep.worktrees.length}):`)
      for (const wt of teamStep.worktrees) console.log(`  - ${wt}`)
      console.log(`  Merge order: ${teamStep.mergeOrder.join(' -> ')}`)
    } else {
      console.log('  Team board step already existed; no new worktrees added.')
    }
    console.log('  Next: run `brian plan <initiative-id> --squad "' + squad.name + '"` then `brian work`.')
    return
  }

  if (command === 'sync') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }
    warnLegacyAlias(brainRoot, 'sync')

    const files = findMarkdownFiles(brainRoot)
    const relativeFiles = files.map(file => path.relative(brainRoot, file))
    const byBaseName = new Map(relativeFiles.map(file => [path.basename(file, '.md'), file]))
    const brokenLinks: Array<{ file: string; target: string }> = []
    const missingParents: string[] = []

    for (const file of files) {
      const relative = path.relative(brainRoot, file)
      const content = fs.readFileSync(file, 'utf8')

      if (relative !== path.join('brian', 'index.md') && !content.includes('> Part of [[')) {
        missingParents.push(relative)
      }

      const matches = [...content.matchAll(/\[\[([^\]]+)\]\]/g)]
      for (const match of matches) {
        const target = match[1].trim()
        if (!wikilinkTargetExists(target, relativeFiles, byBaseName)) {
          brokenLinks.push({ file: relative, target })
        }
      }
    }

    console.log('')
    console.log(`  Files scanned: ${relativeFiles.length}`)
    console.log(`  Broken wikilinks: ${brokenLinks.length}`)
    console.log(`  Files missing parent link: ${missingParents.length}`)
    if (brokenLinks.length > 0) {
      console.log('')
      console.log('  Broken links:')
      for (const item of brokenLinks.slice(0, 10)) {
        console.log(`  - ${item.file} -> [[${item.target}]]`)
      }
    }
    if (missingParents.length > 0) {
      console.log('')
      console.log('  Missing `> Part of [[...]]` lines:')
      for (const item of missingParents.slice(0, 10)) {
        console.log(`  - ${item}`)
      }
    }
    console.log('')
    console.log('  Next in Codex: ask it to fix the issues found here, then run `brian doctrine-lint` again.')
    return
  }

  if (command === 'codex') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    commandPromptSummary(brainRoot)
    return
  }

  console.error(`Unknown command: ${command}`)
  showHelp()
  process.exit(1)
}

main().catch(err => {
  cleanupServerConfig()
  console.error(err)
  process.exit(1)
})
