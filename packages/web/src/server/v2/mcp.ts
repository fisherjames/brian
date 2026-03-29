import * as fs from 'node:fs'
import * as path from 'node:path'
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
  'discussion.escalate',
  'discussion.resolve',
  'decision.record',
  'decision.resolve',
  'decision.list_pending',
  'briefing.generate',
  'briefing.publish',
  'workflow.tick',
  'workflow.seed_backlog',
  'workflow.autopilot.state',
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
  if (method.startsWith('discussion')) return 'leadership_discussion'
  if (method.startsWith('decision')) return 'director_decision'
  return 'execution'
}

function summarizeParams(params: Record<string, unknown>): string {
  if (typeof params.title === 'string' && params.title.trim()) return params.title.trim()
  if (typeof params.message === 'string' && params.message.trim()) return params.message.trim()
  if (typeof params.initiativeId === 'string' && params.initiativeId.trim()) return `initiative=${params.initiativeId.trim()}`
  return 'update'
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
        : method === 'discussion.escalate' ? 'escalation_raised'
          : method === 'discussion.resolve' ? 'task_completed'
            : method === 'decision.record' ? 'decision_recorded'
              : method === 'initiative.plan' ? 'task_planned'
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
    discussionId: typeof params.discussionId === 'string' ? params.discussionId : undefined,
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
      kind === 'discussions' ? '- product-lead\n- backend-engineer\n- frontend-engineer' : `- ${data.actor || 'founder-ceo'}`,
      '',
      kind === 'discussions' ? '## Questions' : '## Decision Notes',
      '- Pending author updates.',
      '',
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

export function readV2ApiData(brainId: string) {
  const brain = requireBrain(brainId)
  return readV2Models(brainId, brain.path)
}

export function runV2McpCall(brainId: string, method: string, params: Record<string, unknown>): any {
  const brain = requireBrain(brainId)

  if (method === 'workflow.autopilot.state') {
    return {
      message: 'workflow.autopilot.state',
      autopilot: { active: false, mode: 'manual' },
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
    const initiativeId = typeof params.initiativeId === 'string' && params.initiativeId.trim()
      ? params.initiativeId.trim()
      : upsertInitiative(brain.path, {
        title: typeof params.title === 'string' ? params.title.trim() : 'Untitled initiative',
        stage: mapStage(method),
        summary: String(params.summary ?? ''),
        actor: typeof params.actor === 'string' ? params.actor : 'project-operator',
        note: method,
      })

    const stage = mapStage(method)
    upsertInitiative(brain.path, {
      id: initiativeId,
      title: typeof params.title === 'string' ? params.title.trim() : initiativeId,
      stage,
      summary: String(params.summary ?? ''),
      actor: typeof params.actor === 'string' ? params.actor : 'project-operator',
      note: method,
    })

    const event = lifecycleEvent(brainId, method, { ...params, initiativeId })
    return {
      message: `${method}:${initiativeId}`,
      event,
      ...readV2ApiData(brainId),
    }
  }

  if (method === 'discussion.open') {
    const title = typeof params.title === 'string' ? params.title.trim() : 'Untitled discussion'
    const discussion = createRecord(brain.path, 'discussions', title, {
      layer: typeof params.layer === 'string' ? params.layer : 'squad',
      status: 'open',
      initiative_id: typeof params.initiativeId === 'string' ? params.initiativeId : '',
      unresolved_questions: '1',
      actor: typeof params.actor === 'string' ? params.actor : 'product-lead',
    })
    const event = lifecycleEvent(brainId, method, { ...params, discussionId: discussion.id })
    return { message: `discussion_opened:${discussion.id}`, event, ...readV2ApiData(brainId) }
  }

  if (method === 'discussion.answer' || method === 'discussion.escalate' || method === 'discussion.resolve') {
    const discussionId = typeof params.discussionId === 'string' ? params.discussionId.trim() : ''
    if (!discussionId) throw new Error('missing_discussionId')
    const discussionPath = findRecordPath(brain.path, 'discussions', discussionId)
    if (!discussionPath) throw new Error(`discussion_not_found:${discussionId}`)

    if (method === 'discussion.answer') {
      const current = parseFrontmatter(fs.readFileSync(discussionPath, 'utf8'))
      const unresolved = Math.max(0, Number(current.unresolved_questions ?? '1') - 1)
      updateFrontmatter(discussionPath, {
        unresolved_questions: String(unresolved),
        status: unresolved === 0 ? 'resolved' : 'open',
        updated_at: new Date().toISOString(),
      })
      appendSectionLine(
        discussionPath,
        'Outcome Log',
        `${new Date().toISOString()} · ${typeof params.actor === 'string' ? params.actor : 'specialist'} answered: ${String(params.message ?? 'response posted')}`
      )
    } else if (method === 'discussion.escalate') {
      updateFrontmatter(discussionPath, {
        status: 'escalated',
        updated_at: new Date().toISOString(),
      })
      appendSectionLine(
        discussionPath,
        'Outcome Log',
        `${new Date().toISOString()} · ${typeof params.actor === 'string' ? params.actor : 'product-lead'} escalated: ${String(params.message ?? 'needs higher-level decision')}`
      )
    } else {
      updateFrontmatter(discussionPath, {
        status: 'resolved',
        unresolved_questions: '0',
        updated_at: new Date().toISOString(),
      })
      appendSectionLine(
        discussionPath,
        'Outcome Log',
        `${new Date().toISOString()} · ${typeof params.actor === 'string' ? params.actor : 'project-operator'} resolved`
      )
    }

    const event = lifecycleEvent(brainId, method, { ...params, discussionId })
    return { message: method, event, ...readV2ApiData(brainId) }
  }

  if (method === 'decision.record') {
    const title = typeof params.title === 'string' ? params.title.trim() : 'Director decision'
    const decision = createRecord(brain.path, 'decisions', title, {
      initiative_id: typeof params.initiativeId === 'string' ? params.initiativeId : '',
      status: typeof params.status === 'string' ? params.status : 'pending',
      rationale: typeof params.rationale === 'string' ? params.rationale : '',
      actor: typeof params.actor === 'string' ? params.actor : 'founder-ceo',
    })
    const event = lifecycleEvent(brainId, method, { ...params, decisionId: decision.id })
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

    updateFrontmatter(decisionPath, {
      status,
      updated_at: new Date().toISOString(),
    })
    appendSectionLine(
      decisionPath,
      'Outcome Log',
      `${new Date().toISOString()} · ${typeof params.actor === 'string' ? params.actor : 'founder-ceo'} marked ${status}`
    )
    const event = lifecycleEvent(brainId, 'decision.record', {
      ...params,
      decisionId,
      message: `decision_resolved:${status}`,
    })
    return { message: `decision_resolved:${decisionId}:${status}`, event, ...readV2ApiData(brainId) }
  }

  if (method === 'briefing.generate') {
    const models = readV2ApiData(brainId)
    const title = `Director briefing ${new Date().toISOString().slice(0, 10)}`
    const briefing = createRecord(brain.path, 'briefings', title, {
      summary: `Pending decisions: ${models.companyState.pendingDecisions.length}; escalations: ${models.companyState.activeEscalations.length}; execution active: ${models.companyState.executionActive}`,
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

  throw new Error(`unsupported_v2_method:${method}`)
}
