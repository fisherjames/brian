import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { getBrain } from '../../lib/local-data'
import { readV2Models } from '../../lib/v2/projection'
import { appendEvent, ensureV2Scaffold, nextId, parseFrontmatter, writeRecordMarkdown } from '../../lib/v2/storage'
import type { V2Event, V2Stage } from '../../lib/v2/types'

export const V2_METHODS = new Set([
  'company.intent.capture',
  'initiative.propose',
  'initiative.shape',
  'initiative.plan',
  'initiative.execute',
  'discussion.open',
  'discussion.answer',
  'discussion.respond',
  'discussion.escalate',
  'discussion.resolve',
  'decision.record',
  'decision.resolve',
  'decision.list_pending',
  'briefing.generate',
  'briefing.publish',
  'workflow.tick',
  'workflow.update_plan',
  'workflow.mark_merged',
  'workflow.seed_backlog',
  'workflow.watch_ping',
  'workflow.autopilot.start',
  'workflow.autopilot.stop',
  'workflow.autopilot.state',
  'lab.state.get',
  'lab.catalog.search',
  'lab.assignment.set',
  'lab.assignment.clear',
])

export function isV2Method(method: string): boolean {
  return V2_METHODS.has(method)
}

function requireBrain(brainId: string) {
  const brain = getBrain(brainId)
  if (!brain) throw new Error(`brain_not_found:${brainId}`)
  ensureV2Scaffold(brain.path)
  return brain
}

function mapStage(method: string): V2Stage {
  if (method.startsWith('company.intent')) return 'intent'
  if (method.startsWith('initiative.propose')) return 'proposal'
  if (method.startsWith('initiative.shape')) return 'tribe_shaping'
  if (method.startsWith('initiative.plan')) return 'squad_planning'
  if (method.startsWith('initiative.execute')) return 'execution'
  if (method.startsWith('lab.')) return 'squad_planning'
  if (method.startsWith('discussion')) return 'leadership_discussion'
  if (method.startsWith('decision')) return 'director_decision'
  return 'execution'
}

function summarizeParams(params: Record<string, unknown>): string {
  if (typeof params.repoFullName === 'string' && params.repoFullName.trim()) return params.repoFullName.trim()
  if (typeof params.prompt === 'string' && params.prompt.trim()) return params.prompt.trim()
  if (typeof params.title === 'string' && params.title.trim()) return params.title.trim()
  if (typeof params.message === 'string' && params.message.trim()) return params.message.trim()
  if (typeof params.initiativeId === 'string' && params.initiativeId.trim()) return `initiative=${params.initiativeId.trim()}`
  return 'update'
}

function normalizeQuestion(input: unknown): string {
  return typeof input === 'string' ? input.trim() : ''
}

function ensureExplicitQuestion(question: string, errorCode: string) {
  if (!question) throw new Error(errorCode)
}

function isYesNoQuestion(question: string): boolean {
  const q = question.trim()
  if (!q.endsWith('?')) return false
  return /^(should|is|are|can|could|do|does|did|will|would|has|have)\b/i.test(q)
}

function ensureYesNoQuestion(question: string, fallbackSubject: string): string {
  const raw = question.trim()
  if (isYesNoQuestion(raw)) return raw
  const normalized = raw.replace(/[.!]+$/g, '').trim()
  if (/^(should|is|are|can|could|do|does|did|will|would|has|have)\b/i.test(normalized)) {
    return `${normalized}?`
  }
  if (normalized) return `Should we proceed with "${normalized}" now?`
  const subject = fallbackSubject.trim() || 'this initiative'
  return `Should we proceed with "${subject}" now?`
}

function parseDecisionOptions(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.map((item) => String(item).trim()).filter(Boolean)
}

type PersonaIdentity = {
  id: string
  name: string
  role: string
  voice: string
  concern: string
}

const PERSONA_IDENTITY: Record<string, PersonaIdentity> = {
  director: {
    id: 'director',
    name: 'Director',
    role: 'Director',
    voice: 'strategic and structured',
    concern: 'Tradeoff clarity and decision quality',
  },
  'tribe-head': {
    id: 'tribe-head',
    name: 'Tribe Head',
    role: 'Tribe Head',
    voice: 'cross-functional and pragmatic',
    concern: 'Scope, sequencing, and escalations',
  },
  'founder-ceo': {
    id: 'founder-ceo',
    name: 'James',
    role: 'Founder / CEO',
    voice: 'strategic and direct',
    concern: 'Decision quality and downside risk',
  },
  'product-lead': {
    id: 'product-lead',
    name: 'Avery',
    role: 'Product Lead',
    voice: 'user-outcome and scope clarity',
    concern: 'Scope, sequencing, and validation signal',
  },
  'backend-engineer': {
    id: 'backend-engineer',
    name: 'Milo',
    role: 'Backend Engineer',
    voice: 'systems and reliability',
    concern: 'Failure modes, contracts, and rollback',
  },
  'frontend-engineer': {
    id: 'frontend-engineer',
    name: 'Rae',
    role: 'Frontend Engineer',
    voice: 'interaction quality and UX clarity',
    concern: 'Comprehensibility and operator ergonomics',
  },
  'project-operator': {
    id: 'project-operator',
    name: 'Kai',
    role: 'Project Operator',
    voice: 'execution rhythm',
    concern: 'Flow throughput and merge safety',
  },
}

function persona(actor: string): PersonaIdentity {
  return PERSONA_IDENTITY[actor] || {
    id: actor,
    name: actor,
    role: 'Specialist',
    voice: 'pragmatic',
    concern: 'Execution',
  }
}

function parseStringJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

function parseDiscussionQuestions(params: Record<string, unknown>, fallback: string): string[] {
  const fromList = Array.isArray(params.questions)
    ? params.questions.map((item) => String(item).trim()).filter(Boolean)
    : []
  const fromProblemList = Array.isArray(params.problems)
    ? params.problems.map((item) => String(item).trim()).filter(Boolean)
    : []
  const merged = [...fromList, ...fromProblemList]
  if (merged.length > 0) return Array.from(new Set(merged))
  return [fallback]
}

function appendThreadMessage(filePath: string, actor: string, message: string) {
  const p = persona(actor)
  appendSectionLine(filePath, 'Thread', `${new Date().toISOString()} · ${p.name} (${p.id}, ${p.role}): ${message}`)
}

function discussionPersonas(layer: 'squad' | 'tribe' | 'director', actor: string): string[] {
  if (layer === 'director') return ['founder-ceo', 'product-lead', 'backend-engineer']
  if (layer === 'tribe') return ['product-lead', 'backend-engineer', 'frontend-engineer', 'project-operator']
  return ['backend-engineer', 'frontend-engineer', 'project-operator', 'product-lead']
}

function nextEscalationTarget(layer: 'squad' | 'tribe' | 'director'): 'tribe' | 'director' | 'ceo' {
  if (layer === 'squad') return 'tribe'
  if (layer === 'tribe') return 'director'
  return 'ceo'
}

function seedDiscussionThread(filePath: string, layer: 'squad' | 'tribe' | 'director', questions: string[], actor: string) {
  const starter = questions[0] || 'What is the best path forward?'
  appendThreadMessage(filePath, actor, `Kickoff: ${starter}`)
  const personas = discussionPersonas(layer, actor)
  const secondary = questions[1] || 'Which risk should we mitigate first?'
  const tertiary = questions[2] || 'What evidence is required before merge?'
  if (layer === 'squad') {
    appendThreadMessage(filePath, personas[0], `Question: ${secondary}`)
    appendThreadMessage(filePath, personas[1], 'Counterpoint: we can simplify the UX path if backend contract stays stable.')
    appendThreadMessage(filePath, personas[2], `Question: ${tertiary}`)
    appendThreadMessage(filePath, personas[3], 'Proposal: split into two deliverables and preserve user-verification gate.')
    return
  }
  if (layer === 'tribe') {
    appendThreadMessage(filePath, personas[0], `Question: ${secondary}`)
    appendThreadMessage(filePath, personas[1], 'Debate: limiting scope now avoids contract churn later.')
    appendThreadMessage(filePath, personas[2], 'Debate: if we trim too hard we could hide UX regressions.')
    appendThreadMessage(filePath, personas[3], `Question: ${tertiary}`)
    return
  }
  appendThreadMessage(filePath, personas[0], `Question: ${secondary}`)
  appendThreadMessage(filePath, personas[1], 'Recommendation pending: we need option framing with explicit downside.')
  appendThreadMessage(filePath, personas[2], `Question: ${tertiary}`)
}

function lifecycleEvent(brainId: string, method: string, params: Record<string, unknown>): V2Event {
  const summary = summarizeParams(params)
  const stage = mapStage(method)
  const actor = (typeof params.actor === 'string' && params.actor.trim()) ? params.actor.trim() : 'project-operator'
  const layer =
    stage === 'director_decision' ? 'director'
      : stage === 'tribe_shaping' ? 'tribe'
        : stage === 'squad_planning' || stage === 'execution' ? 'squad'
          : 'system'

  const kind =
    method === 'company.intent.capture' ? 'initiative_created'
      : method === 'discussion.open' ? 'discussion_opened'
        : method === 'discussion.respond' ? 'task_completed'
        : method === 'discussion.escalate' ? 'escalation_raised'
          : method === 'discussion.resolve' ? 'task_completed'
            : method === 'decision.record' ? 'decision_recorded'
                : method === 'initiative.plan' ? 'task_planned'
                : method === 'workflow.update_plan' ? 'task_planned'
                  : method === 'lab.assignment.set' ? 'task_planned'
                    : method === 'lab.assignment.clear' ? 'task_completed'
                : method === 'initiative.execute' ? 'task_started'
                  : method === 'briefing.generate' ? 'briefing_generated'
                    : method === 'briefing.publish' ? 'briefing_published'
                      : 'task_completed'

  return appendEvent(brainId, {
    actor,
    layer,
    stage,
    kind,
    initiativeId: typeof params.initiativeId === 'string' ? params.initiativeId : undefined,
    initiativeTitle:
      typeof params.initiativeTitle === 'string'
        ? params.initiativeTitle
        : typeof params.title === 'string'
          ? params.title
          : undefined,
    discussionId: typeof params.discussionId === 'string' ? params.discussionId : undefined,
    discussionTitle: typeof params.discussionTitle === 'string' ? params.discussionTitle : undefined,
    decisionQuestion:
      typeof params.decisionQuestion === 'string'
        ? params.decisionQuestion
        : typeof params.question === 'string'
          ? params.question
          : undefined,
    message: `${method}: ${summary}`,
    refs: typeof params.ref === 'string' ? [params.ref] : [],
  })
}

function appendSectionLine(filePath: string, heading: string, line: string) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const marker = `## ${heading}`
  if (!raw.includes(marker)) {
    const next = `${raw.trimEnd()}\n\n${marker}\n- ${line}\n`
    fs.writeFileSync(filePath, next, 'utf8')
    return
  }
  const idx = raw.indexOf(marker)
  const tail = raw.slice(idx)
  const nextHeadingIdx = tail.slice(marker.length).search(/\n##\s+/)
  if (nextHeadingIdx < 0) {
    const next = `${raw.trimEnd()}\n- ${line}\n`
    fs.writeFileSync(filePath, next, 'utf8')
    return
  }
  const insertAt = idx + marker.length + nextHeadingIdx + 1
  const next = `${raw.slice(0, insertAt)}- ${line}\n${raw.slice(insertAt)}`
  fs.writeFileSync(filePath, next, 'utf8')
}

function upsertInitiative(
  brainPath: string,
  payload: { id?: string; title: string; stage: V2Stage; summary?: string; actor?: string; note?: string }
) {
  const id = payload.id || nextId('initiative')
  const rel = path.join('brian', 'initiatives', `${id}.md`)
  const fullPath = path.join(brainPath, rel)
  const existingFm = fs.existsSync(fullPath) ? parseFrontmatter(fs.readFileSync(fullPath, 'utf8')) : {}
  const createdAt = existingFm.created_at || new Date().toISOString()
  const actor = payload.actor || 'project-operator'
  const note = payload.note || payload.summary || ''
  if (fs.existsSync(fullPath)) {
    writeRecordMarkdown(
      brainPath,
      rel,
      {
        id,
        title: payload.title,
        stage: payload.stage,
        summary: payload.summary ?? '',
        created_at: createdAt,
        updated_at: new Date().toISOString(),
      },
      fs.readFileSync(fullPath, 'utf8').replace(/^---[\s\S]*?---\n?/, '').trim()
    )
    appendSectionLine(fullPath, 'Activity Log', `${new Date().toISOString()} · ${actor} · stage=${payload.stage} · ${note || 'updated'}`)
    return id
  }
  writeRecordMarkdown(
    brainPath,
    rel,
    {
      id,
      title: payload.title,
      stage: payload.stage,
      summary: payload.summary ?? '',
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    },
    [
      `# ${payload.title}`,
      '',
      `## Stage`,
      payload.stage,
      '',
      `## Summary`,
      payload.summary ?? '',
      '',
      `## Linked Records`,
      `- Discussions: [[brian/discussions/index]]`,
      `- Decisions: [[brian/decisions/index]]`,
      `- Briefings: [[brian/briefings/index]]`,
      '',
      `## Activity Log`,
      `- ${new Date().toISOString()} · ${actor} · stage=${payload.stage} · ${note || 'created'}`,
    ].join('\n')
  )
  return id
}

function createRecord(brainPath: string, kind: 'discussions' | 'decisions' | 'briefings', title: string, data: Record<string, string>) {
  const id = nextId(kind.slice(0, -1))
  const rel = path.join('brian', kind, `${id}.md`)
  const initiativeId = data.initiative_id || ''
  const initiativeRef = initiativeId ? `[[brian/initiatives/${initiativeId}]]` : ''
  const question = data.initial_question || ''
  const questions = parseStringJsonArray(data.open_questions_json)
  const participants = parseStringJsonArray(data.personas_json)
  const outcomes = parseStringJsonArray(data.outcomes_json)
  const decisionQuestion = data.decision_question || data.question || ''
  const rationale = data.rationale || 'No rationale provided yet.'
  const summary = data.summary || 'No summary yet.'
  writeRecordMarkdown(
    brainPath,
    rel,
    {
      id,
      title,
      ...data,
      at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    [
      `# ${title}`,
      '',
      `## Context`,
      initiativeRef ? `- Initiative: ${initiativeRef}` : '- Initiative: none',
      ...Object.entries(data).map(([key, value]) => `- ${key}: ${value}`),
      '',
      kind === 'discussions' ? '## Participants' : '## Owner',
      kind === 'discussions'
        ? (participants.length > 0 ? participants.map((line) => `- ${line}`).join('\n') : '- product-lead\n- backend-engineer\n- frontend-engineer')
        : `- ${data.actor || 'founder-ceo'}`,
      '',
      kind === 'discussions' ? '## Questions' : kind === 'decisions' ? '## Decision Notes' : '## Briefing Notes',
      kind === 'discussions'
        ? (questions.length > 0 ? questions.map((line) => `- ${line}`).join('\n') : `- ${question || 'QUESTION_MISSING'}`)
        : kind === 'decisions'
          ? `- Question: ${decisionQuestion || 'QUESTION_MISSING'}\n- Rationale: ${rationale}\n- Recommendation: ${data.recommendation || 'Pending leadership alignment.'}\n- Human verification: ${data.human_verification || 'Required before merge.'}`
          : `- ${summary}`,
      '',
      kind === 'discussions' ? '## Outcomes' : '',
      kind === 'discussions'
        ? (outcomes.length > 0 ? outcomes.map((line) => `- ${line}`).join('\n') : '- outcome_pending')
        : '',
      '',
      `## Evidence`,
      `- Linked initiative documents and event log entries`,
      `- Updated at ${new Date().toISOString()}`,
      '',
      kind === 'discussions' ? '## Thread' : '',
      kind === 'discussions' ? '' : '',
      '## Outcome Log',
      `- ${new Date().toISOString()} · record_created`,
    ].join('\n')
  )
  return { id, rel }
}

function findRecordPath(brainPath: string, kind: 'discussions' | 'decisions' | 'briefings' | 'initiatives', id: string): string | null {
  const candidate = path.join(brainPath, 'brian', kind, `${id}.md`)
  return fs.existsSync(candidate) ? candidate : null
}

function updateFrontmatter(filePath: string, updates: Record<string, string>) {
  const raw = fs.readFileSync(filePath, 'utf8')
  if (!raw.startsWith('---\n')) throw new Error(`invalid_frontmatter:${path.basename(filePath)}`)

  const lines = raw.split('\n')
  const secondFence = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---')
  if (secondFence < 0) throw new Error(`invalid_frontmatter:${path.basename(filePath)}`)

  const fmRaw = lines.slice(0, secondFence + 1).join('\n')
  const body = lines.slice(secondFence + 1).join('\n').replace(/^\n+/, '')
  const current = parseFrontmatter(fmRaw)
  const merged = { ...current, ...updates }
  const fmLines = ['---', ...Object.entries(merged).map(([k, v]) => `${k}: ${v}`), '---', ''].join('\n')
  fs.writeFileSync(filePath, `${fmLines}${body.trimEnd()}\n`, 'utf8')
}

function readInitiativeMeta(brainPath: string, initiativeId: string): { title: string; summary: string } | null {
  const recordPath = findRecordPath(brainPath, 'initiatives', initiativeId)
  if (!recordPath) return null
  const fm = parseFrontmatter(fs.readFileSync(recordPath, 'utf8'))
  return {
    title: String(fm.title || initiativeId),
    summary: String(fm.summary || ''),
  }
}

type LabKind = 'skill' | 'rule' | 'soul'
type LabAssignment = {
  id: string
  agent: string
  kind: LabKind
  repoFullName: string
  repoUrl: string
  note: string
  stars: number
  assignedAt: string
}

type LabCatalogItem = {
  kind: LabKind
  repoFullName: string
  repoUrl: string
  description: string
  stars: number
  updatedAt: string
  score?: number
  signals?: string[]
}

type AutopilotState = {
  active: boolean
  mode: 'manual' | 'safe'
  startedAt: string | null
  stoppedAt: string | null
  ticks: number
  lastResult: string
}

type ExecutionPolicySnapshot = {
  enforced: boolean
  actor: string
  assignmentCount: number
  missingKinds: LabKind[]
  assignments: Array<{
    agent: string
    kind: LabKind
    repoFullName: string
  }>
}

function labFilePath(brainPath: string): string {
  return path.join(brainPath, 'brian', 'org', 'agent-lab.md')
}

function ensureLabState(brainPath: string) {
  const filePath = labFilePath(brainPath)
  if (fs.existsSync(filePath)) return
  writeRecordMarkdown(
    brainPath,
    path.join('brian', 'org', 'agent-lab.md'),
    {
      id: 'agent-lab',
      title: 'Agent Lab',
      assignments_json: '[]',
      updated_at: new Date().toISOString(),
    },
    [
      '# Agent Lab',
      '',
      '> Dynamic catalog and assignment state for skills, rules, and souls.',
      '',
      '## Purpose',
      '- Allow CEO to experiment with external skill/rule/soul sources from popular GitHub repositories.',
      '- Keep assignment state explicit and auditable in-repo.',
      '',
      '## Assignment Log',
      '- initialized',
      '',
    ].join('\n')
  )
}

function parseJsonArray<T>(value: string | undefined): T[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function readLabAssignments(brainPath: string): LabAssignment[] {
  ensureLabState(brainPath)
  const raw = fs.readFileSync(labFilePath(brainPath), 'utf8')
  const fm = parseFrontmatter(raw)
  return parseJsonArray<LabAssignment>(fm.assignments_json)
}

function writeLabAssignments(brainPath: string, assignments: LabAssignment[]) {
  const target = labFilePath(brainPath)
  updateFrontmatter(target, {
    assignments_json: JSON.stringify(assignments),
    updated_at: new Date().toISOString(),
  })
  appendSectionLine(target, 'Assignment Log', `${new Date().toISOString()} · assignments=${assignments.length}`)
}

function autopilotStatePath(brainId: string): string {
  return path.join(process.env.HOME || '', '.brian', 'state', brainId, 'autopilot.json')
}

function defaultAutopilotState(): AutopilotState {
  return {
    active: false,
    mode: 'manual',
    startedAt: null,
    stoppedAt: null,
    ticks: 0,
    lastResult: 'idle',
  }
}

function readAutopilotState(brainId: string): AutopilotState {
  const filePath = autopilotStatePath(brainId)
  if (!fs.existsSync(filePath)) return defaultAutopilotState()
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<AutopilotState>
    return {
      ...defaultAutopilotState(),
      ...parsed,
      mode: parsed.mode === 'safe' ? 'safe' : 'manual',
    }
  } catch {
    return defaultAutopilotState()
  }
}

function writeAutopilotState(brainId: string, state: AutopilotState) {
  const filePath = autopilotStatePath(brainId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8')
}

function listSpecialists(brainPath: string): string[] {
  const dir = path.join(brainPath, 'brian', 'agents')
  if (!fs.existsSync(dir)) return ['project-operator', 'director', 'tribe-head']
  const discovered = fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md') && file !== 'agents.md')
    .map((file) => file.replace(/\.md$/, ''))
  const base = new Set([...discovered, 'director', 'tribe-head'])
  return [...base].sort()
}

function defaultCatalogQuery(kind: LabKind): string {
  if (kind === 'skill') return 'ai agents stars:>500'
  if (kind === 'rule') return 'cursor rules stars:>20'
  return 'system prompts ai stars:>20'
}

function searchGithubCatalog(kind: LabKind, query: string, limit: number): LabCatalogItem[] {
  const q = query.trim() || defaultCatalogQuery(kind)
  const perPage = Math.max(1, Math.min(20, limit))
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`
  try {
    const out = execFileSync('curl', ['-sSL', '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: brian-v2-agent-lab', url], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    })
    const parsed = JSON.parse(out) as { items?: Array<Record<string, unknown>> }
    const items = Array.isArray(parsed.items) ? parsed.items : []
    const tokens = q
      .toLowerCase()
      .replace(/stars:\S+/g, ' ')
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)

    const ranked: LabCatalogItem[] = items
      .map((item) => {
        const repoFullName = String(item.full_name || '')
        const repoUrl = String(item.html_url || '')
        const description = String(item.description || '')
        const stars = Number(item.stargazers_count || 0)
        const updatedAt = String(item.updated_at || '')
        const archived = Boolean(item.archived)
        const disabled = Boolean(item.disabled)
        const fork = Boolean(item.fork)
        if (!repoFullName || !repoUrl || archived || disabled || fork) return null

        const haystack = `${repoFullName} ${description}`.toLowerCase()
        const keywordHits = tokens.filter((token) => haystack.includes(token)).length
        const daysSinceUpdate = (() => {
          const stamp = Date.parse(updatedAt)
          if (!Number.isFinite(stamp)) return 9999
          return Math.max(0, Math.floor((Date.now() - stamp) / (1000 * 60 * 60 * 24)))
        })()
        const freshnessBonus = daysSinceUpdate <= 30 ? 40 : daysSinceUpdate <= 180 ? 15 : 0
        const score = Math.round(Math.log10(Math.max(1, stars)) * 100 + freshnessBonus + Math.min(40, keywordHits * 8))
        const signals = [
          `stars=${stars}`,
          `updated=${daysSinceUpdate}d`,
          keywordHits > 0 ? `query_hit=${keywordHits}` : '',
        ].filter(Boolean)

        return {
          kind,
          repoFullName,
          repoUrl,
          description,
          stars,
          updatedAt,
          score,
          signals,
        } satisfies LabCatalogItem
      })
      .filter((item) => item !== null)
      .sort((a, b) => {
        const scoreDelta = (b.score || 0) - (a.score || 0)
        if (scoreDelta !== 0) return scoreDelta
        return b.stars - a.stars
      })

    return ranked.slice(0, perPage)
  } catch {
    return []
  }
}

function buildExecutionPolicy(brainPath: string, requestedActor: string): ExecutionPolicySnapshot {
  const assignments = readLabAssignments(brainPath)
  if (assignments.length === 0) {
    return {
      enforced: false,
      actor: requestedActor,
      assignmentCount: 0,
      missingKinds: ['skill', 'rule', 'soul'],
      assignments: [],
    }
  }

  const assignedAgents = new Set(assignments.map((item) => item.agent))
  const actor = assignedAgents.has(requestedActor)
    ? requestedActor
    : (assignedAgents.has('project-operator') ? 'project-operator' : assignments[0].agent)
  const missingKinds = (['skill', 'rule', 'soul'] as const).filter(
    (kind) => !assignments.some((item) => item.kind === kind)
  )

  return {
    enforced: true,
    actor,
    assignmentCount: assignments.length,
    missingKinds: [...missingKinds],
    assignments: assignments.map((item) => ({
      agent: item.agent,
      kind: item.kind,
      repoFullName: item.repoFullName,
    })),
  }
}

function extractNextExecutionPlanStep(content: string): string | null {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^###\s+(.+?)\s*$/)
    if (!heading) continue
    let status = ''
    for (let j = i + 1; j < Math.min(lines.length, i + 10); j += 1) {
      const s = lines[j].match(/^- \*\*Status\*\*:\s*(.+)\s*$/i)
      if (s) {
        status = s[1].trim().toLowerCase()
        break
      }
      if (/^###\s+/.test(lines[j])) break
    }
    if (status !== 'completed') return heading[1].trim()
  }
  return null
}

export function readV2ApiData(brainId: string) {
  const brain = requireBrain(brainId)
  return readV2Models(brainId, brain.path)
}

export function runV2McpCall(brainId: string, method: string, params: Record<string, unknown>): any {
  const brain = requireBrain(brainId)

  if (method === 'workflow.autopilot.state') {
    const autopilot = readAutopilotState(brainId)
    return {
      message: 'workflow.autopilot.state',
      autopilot,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'workflow.autopilot.start') {
    const models = readV2ApiData(brainId)
    const blockingReason =
      models.companyState.pendingDecisions.length > 0
        ? `blocked:pending_decisions:${models.companyState.pendingDecisions.length}`
        : models.companyState.activeEscalations.length > 0
          ? `blocked:active_escalations:${models.companyState.activeEscalations.length}`
          : ''
    const nextState: AutopilotState = {
      active: !blockingReason,
      mode: 'safe',
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      ticks: 0,
      lastResult: blockingReason || 'started',
    }
    writeAutopilotState(brainId, nextState)
    return {
      message: `workflow.autopilot.start:${nextState.lastResult}`,
      autopilot: nextState,
      ...models,
    }
  }

  if (method === 'workflow.autopilot.stop') {
    const current = readAutopilotState(brainId)
    const nextState: AutopilotState = {
      ...current,
      active: false,
      mode: 'manual',
      stoppedAt: new Date().toISOString(),
      lastResult: typeof params.reason === 'string' && params.reason.trim() ? params.reason.trim() : 'stopped_by_operator',
    }
    writeAutopilotState(brainId, nextState)
    return {
      message: `workflow.autopilot.stop:${nextState.lastResult}`,
      autopilot: nextState,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'company.intent.capture') {
    const title = typeof params.title === 'string' ? params.title.trim() : 'Untitled intent'
    const initiativeId = upsertInitiative(brain.path, {
      title,
      stage: 'intent',
      summary: String(params.summary ?? ''),
      actor: typeof params.actor === 'string' ? params.actor : 'founder-ceo',
      note: 'intent captured',
    })
    const event = lifecycleEvent(brainId, method, { ...params, initiativeId })
    return {
      message: `intent_captured:${initiativeId}`,
      event,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'initiative.propose' || method === 'initiative.shape' || method === 'initiative.plan' || method === 'initiative.execute') {
    const requestedActor = typeof params.actor === 'string' && params.actor.trim() ? params.actor.trim() : 'project-operator'
    const policy = method === 'initiative.execute'
      ? buildExecutionPolicy(brain.path, requestedActor)
      : null
    const actor = policy ? policy.actor : requestedActor

    const initiativeId = typeof params.initiativeId === 'string' && params.initiativeId.trim()
      ? params.initiativeId.trim()
      : upsertInitiative(brain.path, {
        title: typeof params.title === 'string' ? params.title.trim() : 'Untitled initiative',
        stage: mapStage(method),
        summary: String(params.summary ?? ''),
        actor,
        note: method,
      })

    const existing = readInitiativeMeta(brain.path, initiativeId)
    const stage = mapStage(method)
    if (method === 'initiative.execute') {
      const models = readV2ApiData(brainId)
      const initiative = models.initiatives.find((item) => item.id === initiativeId)
      if (!initiative) throw new Error(`initiative_not_found:${initiativeId}`)
      if (initiative.stage !== 'squad_planning' && initiative.stage !== 'execution') {
        throw new Error(`execution_requires_planning:${initiativeId}:${initiative.stage}`)
      }
      const hasPendingDecision = models.companyState.pendingDecisions.some((decision) => decision.initiativeId === initiativeId)
      const hasPendingEscalation = models.companyState.activeEscalations.some((discussion) => discussion.initiativeId === initiativeId)
      if (hasPendingDecision || hasPendingEscalation) {
        throw new Error(`execution_blocked:approvals_pending:${initiativeId}`)
      }
    }
    upsertInitiative(brain.path, {
      id: initiativeId,
      title: typeof params.title === 'string' && params.title.trim()
        ? params.title.trim()
        : existing?.title || initiativeId,
      stage,
      summary: typeof params.summary === 'string' && params.summary.trim()
        ? params.summary
        : existing?.summary || '',
      actor,
      note: method,
    })

    if (method === 'initiative.execute') {
      const initiativePath = findRecordPath(brain.path, 'initiatives', initiativeId)
      if (initiativePath && policy) {
        updateFrontmatter(initiativePath, {
          execution_policy_enforced: policy.enforced ? 'true' : 'false',
          execution_actor: policy.actor,
          execution_assignment_count: String(policy.assignmentCount),
          execution_missing_kinds_json: JSON.stringify(policy.missingKinds),
          updated_at: new Date().toISOString(),
        })
        const policySummary = policy.assignments.length > 0
          ? policy.assignments.map((item) => `${item.agent}:${item.kind}@${item.repoFullName}`).join('; ')
          : 'no assignments'
        appendSectionLine(
          initiativePath,
          'Execution Policy',
          `${new Date().toISOString()} · actor=${policy.actor} · enforced=${policy.enforced} · missingKinds=${policy.missingKinds.join(',') || 'none'} · assignments=${policySummary}`
        )
      }
    }

    const event = lifecycleEvent(brainId, method, {
      ...params,
      actor,
      initiativeId,
      initiativeTitle: existing?.title ?? (typeof params.title === 'string' ? params.title : initiativeId),
    })
    return {
      message: `${method}:${initiativeId}`,
      event,
      executionPolicy: policy,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'discussion.open') {
    const initiativeId = typeof params.initiativeId === 'string' ? params.initiativeId : ''
    const initiative = initiativeId ? readInitiativeMeta(brain.path, initiativeId) : null
    const title = typeof params.title === 'string' && params.title.trim()
      ? params.title.trim()
      : initiative?.title
        ? `${initiative.title} discussion`
        : 'Untitled discussion'
    const explicitQuestion = normalizeQuestion(params.message)
      || normalizeQuestion(params.question)
      || `What decision is required for "${title}" before execution continues?`
    const layer = (typeof params.layer === 'string' && (params.layer === 'squad' || params.layer === 'tribe' || params.layer === 'director'))
      ? params.layer
      : 'squad'
    const questions = parseDiscussionQuestions(params, explicitQuestion)
    const participants = discussionPersonas(layer, typeof params.actor === 'string' ? params.actor : 'product-lead')
      .map((id) => {
        const p = persona(id)
        return `${p.name} (${p.id}) · ${p.role} · voice=${p.voice} · concern=${p.concern}`
      })
    const discussion = createRecord(brain.path, 'discussions', title, {
      layer,
      status: 'open',
      paused_by_escalation: 'false',
      escalation_state: 'none',
      initiative_id: initiativeId,
      unresolved_questions: String(questions.length),
      outcome: 'pending',
      actor: typeof params.actor === 'string' ? params.actor : 'product-lead',
      initial_question: explicitQuestion,
      open_questions_json: JSON.stringify(questions),
      outcomes_json: JSON.stringify([]),
      personas_json: JSON.stringify(participants),
    })
    const discussionPath = findRecordPath(brain.path, 'discussions', discussion.id)
    if (discussionPath) {
      seedDiscussionThread(
        discussionPath,
        layer,
        questions,
        typeof params.actor === 'string' ? params.actor : 'product-lead'
      )
    }
    const event = lifecycleEvent(brainId, method, {
      ...params,
      discussionId: discussion.id,
      discussionTitle: title,
      initiativeTitle: initiative?.title ?? undefined,
      initiativeId: initiativeId || undefined,
      question: explicitQuestion,
    })
    return { message: `discussion_opened:${discussion.id}`, event, ...readV2ApiData(brainId) }
  }

  if (method === 'discussion.answer' || method === 'discussion.respond' || method === 'discussion.escalate' || method === 'discussion.resolve') {
    const discussionId = typeof params.discussionId === 'string' ? params.discussionId.trim() : ''
    if (!discussionId) throw new Error('missing_discussionId')
    const discussionPath = findRecordPath(brain.path, 'discussions', discussionId)
    if (!discussionPath) throw new Error(`discussion_not_found:${discussionId}`)

    if (method === 'discussion.answer') {
      const current = parseFrontmatter(fs.readFileSync(discussionPath, 'utf8'))
      const questions = parseStringJsonArray(current.open_questions_json)
      const answeredQuestion = typeof params.question === 'string' ? params.question.trim() : ''
      const filteredQuestions = answeredQuestion
        ? questions.filter((q) => q !== answeredQuestion)
        : questions.slice(1)
      const unresolved = filteredQuestions.length
      updateFrontmatter(discussionPath, {
        unresolved_questions: String(unresolved),
        open_questions_json: JSON.stringify(filteredQuestions),
        status: unresolved === 0 ? 'resolved' : 'open',
        updated_at: new Date().toISOString(),
      })
      appendThreadMessage(
        discussionPath,
        typeof params.actor === 'string' ? params.actor : 'specialist',
        String(params.message ?? 'response posted')
      )
      appendSectionLine(
        discussionPath,
        'Outcome Log',
        `${new Date().toISOString()} · ${typeof params.actor === 'string' ? params.actor : 'specialist'} answered: ${String(params.message ?? 'response posted')}`
      )
    } else if (method === 'discussion.respond') {
      const message = typeof params.message === 'string' ? params.message.trim() : ''
      if (!message) throw new Error('missing_discussion_response')
      const current = parseFrontmatter(fs.readFileSync(discussionPath, 'utf8'))
      const questions = parseStringJsonArray(current.open_questions_json)
      const outcomes = parseStringJsonArray(current.outcomes_json)
      const asQuestion = message.endsWith('?') ? message : ''
      const nextQuestions = asQuestion && !questions.includes(asQuestion) ? [...questions, asQuestion] : questions
      const outcomeTopic = typeof params.topic === 'string' ? params.topic.trim() : ''
      const outcomeText = typeof params.outcome === 'string' ? params.outcome.trim() : ''
      const actorId = typeof params.actor === 'string' ? params.actor : 'project-operator'
      const nextOutcomes = outcomeText
        ? [...outcomes, `${new Date().toISOString()} · ${persona(actorId).name}: ${outcomeTopic || 'Outcome'} -> ${outcomeText}`]
        : outcomes
      updateFrontmatter(discussionPath, {
        open_questions_json: JSON.stringify(nextQuestions),
        outcomes_json: JSON.stringify(nextOutcomes),
        unresolved_questions: String(nextQuestions.length),
        updated_at: new Date().toISOString(),
      })
      appendThreadMessage(
        discussionPath,
        actorId,
        message
      )
      appendSectionLine(
        discussionPath,
        'Outcome Log',
        `${new Date().toISOString()} · ${actorId} responded${outcomeText ? ' with outcome update' : ''}`
      )
    } else if (method === 'discussion.escalate') {
      const current = parseFrontmatter(fs.readFileSync(discussionPath, 'utf8'))
      const questions = parseStringJsonArray(current.open_questions_json)
      const escalationQuestion = normalizeQuestion(params.message) || questions[0] || String(current.initial_question || '').trim() || 'Escalation requires decision'
      const nextQuestions = questions.includes(escalationQuestion) ? questions : [...questions, escalationQuestion]
      const currentLayer = (String(current.layer || 'squad') as 'squad' | 'tribe' | 'director')
      const escalationTarget = nextEscalationTarget(currentLayer)
      const escalationActor =
        typeof params.actor === 'string' && params.actor.trim()
          ? params.actor.trim()
          : (currentLayer === 'director' ? 'founder-ceo' : 'product-lead')
      updateFrontmatter(discussionPath, {
        status: 'open',
        paused_by_escalation: 'true',
        escalation_state: 'pending',
        unresolved_questions: String(nextQuestions.length),
        open_questions_json: JSON.stringify(nextQuestions),
        updated_at: new Date().toISOString(),
      })
      appendThreadMessage(
        discussionPath,
        escalationActor,
        `Escalation raised to ${escalationTarget}: ${escalationQuestion}`
      )
      appendSectionLine(
        discussionPath,
        'Outcome Log',
        `${new Date().toISOString()} · ${escalationActor} paused discussion pending escalation to ${escalationTarget}: ${escalationQuestion}`
      )
      if (escalationTarget === 'ceo') {
        const decisionTitle = `${String(current.title || 'Escalation')} CEO decision`
        const decisionQuestion = ensureYesNoQuestion(escalationQuestion, decisionTitle)
        const decision = createRecord(brain.path, 'decisions', decisionTitle, {
          initiative_id: String(current.initiative_id || ''),
          status: 'pending',
          outcome: 'pending',
          decision_question: decisionQuestion,
          decision_mode: 'yes_no',
          decision_options_json: '[]',
          selected_option: '',
          rationale: `Escalated from director layer discussion ${discussionId}.`,
          recommendation: 'CEO decision required to unblock downstream execution.',
          human_verification: 'Verify impact before merge.',
          actor: 'founder-ceo',
        })
        appendSectionLine(
          discussionPath,
          'Outcome Log',
          `${new Date().toISOString()} · ${escalationActor} escalated to CEO decision ${decision.id}`
        )
      } else {
        const newDiscussionTitle = `${String(current.title || 'Escalation')} (${escalationTarget} escalation)`
        const participants = discussionPersonas(escalationTarget, escalationActor)
          .map((id) => {
            const p = persona(id)
            return `${p.name} (${p.id}) · ${p.role} · voice=${p.voice} · concern=${p.concern}`
          })
        const escalated = createRecord(brain.path, 'discussions', newDiscussionTitle, {
          layer: escalationTarget,
          status: 'open',
          paused_by_escalation: 'false',
          escalation_state: 'none',
          initiative_id: String(current.initiative_id || ''),
          unresolved_questions: '1',
          outcome: 'pending',
          actor: escalationActor,
          initial_question: escalationQuestion,
          open_questions_json: JSON.stringify([escalationQuestion]),
          outcomes_json: JSON.stringify([]),
          personas_json: JSON.stringify(participants),
        })
        const escalatedPath = findRecordPath(brain.path, 'discussions', escalated.id)
        if (escalatedPath) {
          seedDiscussionThread(escalatedPath, escalationTarget, [escalationQuestion], escalationActor)
        }
        appendSectionLine(
          discussionPath,
          'Outcome Log',
          `${new Date().toISOString()} · ${escalationActor} escalated to ${escalationTarget} discussion ${escalated.id}`
        )
      }
    } else {
      const resolution = typeof params.resolution === 'string' ? params.resolution.trim().toLowerCase() : 'confirmed'
      const normalized = resolution === 'denied' ? 'denied' : 'confirmed'
      const current = parseFrontmatter(fs.readFileSync(discussionPath, 'utf8'))
      const questions = parseStringJsonArray(current.open_questions_json)
      const outcomes = parseStringJsonArray(current.outcomes_json)
      const question = String(params.question || current.initial_question || current.question || '').trim()
      ensureExplicitQuestion(question, `discussion_question_missing:${discussionId}`)
      const remainingQuestions = questions.filter((q) => q !== question)
      const actorId = typeof params.actor === 'string' ? params.actor : 'project-operator'
      const nextOutcomes = [
        ...outcomes,
        `${new Date().toISOString()} · ${persona(actorId).name}: escalation ${normalized} for "${question}"`,
      ]
      updateFrontmatter(discussionPath, {
        status: remainingQuestions.length === 0 ? 'resolved' : 'open',
        paused_by_escalation: 'false',
        escalation_state: 'resolved',
        unresolved_questions: String(remainingQuestions.length),
        open_questions_json: JSON.stringify(remainingQuestions),
        outcomes_json: JSON.stringify(nextOutcomes),
        outcome: normalized,
        updated_at: new Date().toISOString(),
      })
      appendThreadMessage(
        discussionPath,
        actorId,
        `Escalation resolved: ${normalized}. Resume discussion on remaining questions.`
      )
      appendSectionLine(
        discussionPath,
        'Outcome Log',
        `${new Date().toISOString()} · ${actorId} ${normalized} escalation question: "${question}"${remainingQuestions.length > 0 ? ` · remaining questions=${remainingQuestions.length}` : ''}`
      )
    }

    const event = lifecycleEvent(brainId, method, {
      ...params,
      discussionId,
      discussionTitle: String(parseFrontmatter(fs.readFileSync(discussionPath, 'utf8')).title || discussionId),
    })
    return { message: method, event, ...readV2ApiData(brainId) }
  }

  if (method === 'decision.record') {
    const initiativeId = typeof params.initiativeId === 'string' ? params.initiativeId : ''
    const initiative = initiativeId ? readInitiativeMeta(brain.path, initiativeId) : null
    const title = typeof params.title === 'string' && params.title.trim()
      ? params.title.trim()
      : initiative?.title
        ? `${initiative.title} decision`
        : 'Director decision'
    const rawQuestion = normalizeQuestion(params.question)
      || `Should "${initiative?.title || title}" proceed now?`
    const options = parseDecisionOptions(params.options)
    const mode: 'yes_no' | 'multi_option' = options.length >= 2 ? 'multi_option' : 'yes_no'
    const explicitQuestion =
      mode === 'yes_no' ? ensureYesNoQuestion(rawQuestion, initiative?.title || title) : rawQuestion
    ensureExplicitQuestion(explicitQuestion, 'missing_decision_question')
    if (mode === 'multi_option' && options.length < 2) {
      throw new Error('invalid_decision_options:need_at_least_two_options')
    }
    const decision = createRecord(brain.path, 'decisions', title, {
      initiative_id: initiativeId,
      status: typeof params.status === 'string' ? params.status : 'pending',
      outcome: 'pending',
      decision_question: explicitQuestion,
      decision_mode: mode,
      decision_options_json: JSON.stringify(options),
      selected_option: '',
      rationale: typeof params.rationale === 'string' ? params.rationale : '',
      recommendation: typeof params.recommendation === 'string' ? params.recommendation : 'Approve if risks are owned and rollback is clear.',
      human_verification: typeof params.human_verification === 'string' ? params.human_verification : 'Run feature verification before merge.',
      actor: typeof params.actor === 'string' ? params.actor : 'founder-ceo',
    })
    const event = lifecycleEvent(brainId, method, {
      ...params,
      decisionId: decision.id,
      initiativeTitle: initiative?.title ?? undefined,
      initiativeId: initiativeId || undefined,
      decisionQuestion: explicitQuestion,
    })
    return { message: `decision_recorded:${decision.id}`, event, ...readV2ApiData(brainId) }
  }

  if (method === 'decision.list_pending') {
    const models = readV2ApiData(brainId)
    return {
      message: 'decision.list_pending',
      pending: models.companyState.pendingDecisions,
      ...models,
    }
  }

  if (method === 'decision.resolve') {
    const decisionId = typeof params.decisionId === 'string' ? params.decisionId.trim() : ''
    const status = typeof params.status === 'string' ? params.status.trim() : 'approved'
    if (!decisionId) throw new Error('missing_decisionId')
    if (status !== 'approved' && status !== 'rejected') throw new Error(`invalid_decision_status:${status}`)
    const decisionPath = findRecordPath(brain.path, 'decisions', decisionId)
    if (!decisionPath) throw new Error(`decision_not_found:${decisionId}`)

    const current = parseFrontmatter(fs.readFileSync(decisionPath, 'utf8'))
    const question = String(current.decision_question || current.question || '').trim()
    ensureExplicitQuestion(question, `decision_question_missing:${decisionId}`)
    const mode = String(current.decision_mode || 'yes_no') === 'multi_option' ? 'multi_option' : 'yes_no'
    const options = (() => {
      try {
        const parsed = JSON.parse(String(current.decision_options_json || '[]'))
        return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : []
      } catch {
        return []
      }
    })()
    const selectedOption = typeof params.selectedOption === 'string' ? params.selectedOption.trim() : ''
    // Keep strict format checks on decision creation, but allow resolving
    // older records that may not follow yes/no phrasing.
    if (mode === 'multi_option' && status === 'approved') {
      if (!selectedOption) throw new Error(`decision_option_required:${decisionId}`)
      if (!options.includes(selectedOption)) throw new Error(`decision_option_invalid:${decisionId}`)
    }
    updateFrontmatter(decisionPath, {
      status,
      outcome: status === 'approved' ? 'confirmed' : 'denied',
      selected_option: mode === 'multi_option' && status === 'approved' ? selectedOption : '',
      updated_at: new Date().toISOString(),
    })
    const verb = status === 'approved' ? 'confirmed' : 'denied'
    const selectionSuffix = mode === 'multi_option' && status === 'approved' ? ` (selected option: ${selectedOption})` : ''
    appendSectionLine(
      decisionPath,
      'Outcome Log',
      `${new Date().toISOString()} · ${typeof params.actor === 'string' ? params.actor : 'founder-ceo'} ${verb} decision question: "${question}"${selectionSuffix}`
    )
    const event = lifecycleEvent(brainId, 'decision.record', {
      ...params,
      decisionId,
      message: `decision_resolved:${status}`,
      decisionQuestion: question,
    })
    return { message: `decision_resolved:${decisionId}:${status}`, event, ...readV2ApiData(brainId) }
  }

  if (method === 'briefing.generate') {
    const models = readV2ApiData(brainId)
    const topInitiatives = models.companyState.initiatives
      .slice(0, 3)
      .map((initiative) => `${initiative.title} (${initiative.stage})`)
      .join('; ')
    const title = `Director briefing ${new Date().toISOString().slice(0, 10)}`
    const briefing = createRecord(brain.path, 'briefings', title, {
      summary: `Pending decisions: ${models.companyState.pendingDecisions.length}; escalations: ${models.companyState.activeEscalations.length}; execution active: ${models.companyState.executionActive}; top initiatives: ${topInitiatives || 'none'}`,
      published: 'false',
    })
    const event = lifecycleEvent(brainId, method, { ...params, briefingId: briefing.id })
    return { message: `briefing_generated:${briefing.id}`, event, ...readV2ApiData(brainId) }
  }

  if (method === 'briefing.publish') {
    const event = lifecycleEvent(brainId, method, params)
    return { message: 'briefing_published', event, ...readV2ApiData(brainId) }
  }

  if (method === 'workflow.tick') {
    const models = readV2ApiData(brainId)
    const open = models.initiatives.find((initiative) => initiative.status !== 'completed')
    if (!open) {
      return {
        message: 'workflow.tick:no_open_initiative',
        transition: null,
        ...models,
      }
    }

    const stages: V2Stage[] = ['intent', 'proposal', 'leadership_discussion', 'director_decision', 'tribe_shaping', 'squad_planning', 'execution']
    const idx = stages.indexOf(open.stage)
    const nextStage = stages[Math.min(stages.length - 1, idx + 1)]

    const hasPendingDecision = models.companyState.pendingDecisions.some((decision) => decision.initiativeId === open.id)
    const hasPendingEscalation = models.companyState.activeEscalations.some((discussion) => discussion.initiativeId === open.id)
    if (hasPendingDecision || hasPendingEscalation) {
      const reason = hasPendingDecision ? 'pending_decision' : 'pending_escalation'
      const event = appendEvent(brainId, {
        actor: 'project-operator',
        layer: 'squad',
        stage: open.stage,
        kind: 'merge_blocked',
        initiativeId: open.id,
        initiativeTitle: open.title,
        message: `workflow.tick blocked for ${open.id}: ${reason}`,
        refs: [],
      })
      return {
        message: `workflow.tick:block:${open.id}:${reason}`,
        transition: null,
        event,
        ...models,
      }
    }

    if (nextStage !== open.stage) {
      upsertInitiative(brain.path, {
        id: open.id,
        title: open.title,
        stage: nextStage,
        summary: open.summary,
      })
    }
    const event = lifecycleEvent(brainId, 'initiative.execute', {
      initiativeId: open.id,
      title: open.title,
      message: `workflow.tick transitioned ${open.id} ${open.stage} -> ${nextStage}`,
    })
    return {
      message: `workflow.tick:${open.id}:${open.stage}->${nextStage}`,
      transition: { initiativeId: open.id, from: open.stage, to: nextStage },
      event,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'workflow.update_plan') {
    const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : ''
    if (!prompt) throw new Error('missing_plan_prompt')

    const executionPlanRel = path.join('brian', 'execution-plan.md')
    const executionPlanPath = path.join(brain.path, executionPlanRel)
    if (!fs.existsSync(executionPlanPath)) {
      fs.mkdirSync(path.dirname(executionPlanPath), { recursive: true })
      fs.writeFileSync(
        executionPlanPath,
        ['# execution plan', '', '> Part of [[index]]', '', '## Phase 1 - Current Work', ''].join('\n'),
        'utf8'
      )
    }

    const current = fs.readFileSync(executionPlanPath, 'utf8')
    const nextObjective = extractNextExecutionPlanStep(current)
    const ts = new Date().toISOString()
    const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim()
    const addition = [
      '',
      '## CEO Plan Rework',
      `### ${ts}`,
      `- Prompt: ${normalizedPrompt}`,
      `- Next objective: ${nextObjective ?? 'No open execution step found.'}`,
      '- Rework focus:',
      '  - Keep explicit decision and escalation questions in all approval gates.',
      '  - Keep initiative flow aligned to workflow contract without stage skipping.',
      '  - Keep merge gated by human verification and conflict-free state.',
      '',
    ].join('\n')
    fs.writeFileSync(executionPlanPath, `${current.trimEnd()}\n${addition}`, 'utf8')

    const event = lifecycleEvent(brainId, method, {
      ...params,
      message: `workflow.update_plan: ${normalizedPrompt}`,
      ref: executionPlanRel,
    })
    return {
      message: `workflow.update_plan:${nextObjective ?? 'none'}`,
      nextObjective,
      updatedFile: executionPlanRel,
      event,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'workflow.mark_merged') {
    const initiativeId = typeof params.initiativeId === 'string' ? params.initiativeId.trim() : ''
    if (!initiativeId) throw new Error('missing_initiativeId')
    const actor = typeof params.actor === 'string' ? params.actor : 'project-operator'
    const attempted = appendEvent(brainId, {
      actor,
      layer: 'squad',
      stage: 'execution',
      kind: 'merge_attempted',
      initiativeId,
      message: `workflow.mark_merged:attempt:${initiativeId}`,
      refs: [],
    })
    const completed = appendEvent(brainId, {
      actor,
      layer: 'squad',
      stage: 'execution',
      kind: 'merge_completed',
      initiativeId,
      message: `workflow.mark_merged:completed:${initiativeId}`,
      refs: [],
    })
    return {
      message: `workflow.mark_merged:${initiativeId}`,
      events: [attempted, completed],
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'workflow.seed_backlog') {
    const theme = typeof params.theme === 'string' && params.theme.trim() ? params.theme.trim() : 'mission control'
    const seedSet = [
      `Incremental: improve ${theme} clarity and reduce blocker ambiguity`,
      `Dream feature: autonomous overnight product backlog refinement for ${theme}`,
      `Refactor: normalize V2 state transitions and persistence contracts for ${theme}`,
    ]
    const created: string[] = []
    for (const title of seedSet) {
      const initiativeId = upsertInitiative(brain.path, { title, stage: 'intent', summary: title })
      created.push(initiativeId)
      lifecycleEvent(brainId, 'company.intent.capture', {
        ...params,
        initiativeId,
        title,
      })
    }
    return {
      message: `workflow.seed_backlog:${created.length}`,
      created,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'workflow.watch_ping') {
    const token = typeof params.token === 'string' && params.token.trim() ? params.token.trim() : nextId('ping')
    const event = appendEvent(brainId, {
      actor: typeof params.actor === 'string' ? params.actor : 'founder-ceo',
      layer: 'system',
      stage: 'execution',
      kind: 'task_started',
      message: `watch_ping:${token}`,
      refs: [],
    })
    return {
      message: `workflow.watch_ping:${token}`,
      token,
      event,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'lab.state.get') {
    const assignments = readLabAssignments(brain.path)
    return {
      message: 'lab.state.get',
      specialists: listSpecialists(brain.path),
      assignments,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'lab.catalog.search') {
    const kindRaw = typeof params.kind === 'string' ? params.kind.trim().toLowerCase() : 'skill'
    const kind: LabKind = kindRaw === 'rule' || kindRaw === 'soul' ? kindRaw : 'skill'
    const query = typeof params.query === 'string' ? params.query : ''
    const limit = typeof params.limit === 'number' ? params.limit : 10
    return {
      message: 'lab.catalog.search',
      kind,
      query: query.trim() || defaultCatalogQuery(kind),
      items: searchGithubCatalog(kind, query, limit),
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'lab.assignment.set') {
    const agent = typeof params.agent === 'string' ? params.agent.trim() : ''
    const kindRaw = typeof params.kind === 'string' ? params.kind.trim().toLowerCase() : ''
    const repoFullName = typeof params.repoFullName === 'string' ? params.repoFullName.trim() : ''
    const repoUrl = typeof params.repoUrl === 'string' ? params.repoUrl.trim() : ''
    const note = typeof params.note === 'string' ? params.note.trim() : ''
    const stars = typeof params.stars === 'number' ? params.stars : 0

    if (!agent) throw new Error('missing_agent')
    if (kindRaw !== 'skill' && kindRaw !== 'rule' && kindRaw !== 'soul') throw new Error(`invalid_kind:${kindRaw}`)
    if (!repoFullName || !repoUrl) throw new Error('missing_repo_metadata')

    const assignments = readLabAssignments(brain.path)
    const kind = kindRaw as LabKind
    const withoutExisting = assignments.filter((item) => !(item.agent === agent && item.kind === kind))
    const assigned: LabAssignment = {
      id: nextId('assignment'),
      agent,
      kind,
      repoFullName,
      repoUrl,
      note,
      stars,
      assignedAt: new Date().toISOString(),
    }
    withoutExisting.unshift(assigned)
    writeLabAssignments(brain.path, withoutExisting)

    const event = lifecycleEvent(brainId, method, {
      ...params,
      message: `assigned_${kind}:${agent}:${repoFullName}`,
      ref: 'brian/org/agent-lab.md',
    })
    return {
      message: `lab.assignment.set:${assigned.id}`,
      assignment: assigned,
      assignments: withoutExisting,
      event,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'lab.assignment.clear') {
    const assignmentId = typeof params.assignmentId === 'string' ? params.assignmentId.trim() : ''
    if (!assignmentId) throw new Error('missing_assignmentId')
    const assignments = readLabAssignments(brain.path)
    const next = assignments.filter((item) => item.id !== assignmentId)
    writeLabAssignments(brain.path, next)

    const event = lifecycleEvent(brainId, method, {
      ...params,
      message: `cleared_assignment:${assignmentId}`,
      ref: 'brian/org/agent-lab.md',
    })
    return {
      message: `lab.assignment.clear:${assignmentId}`,
      assignments: next,
      event,
      ...readV2ApiData(brainId),
    }
  }

  throw new Error(`unsupported_v2_method:${method}`)
}
