import { listMarkdownRecords, parseFrontmatter, readEvents } from './storage'
import type {
  V2Briefing,
  V2CompanyState,
  V2Decision,
  V2Discussion,
  V2Event,
  V2Initiative,
  V2Stage,
} from './types'

function extractTitle(content: string): string {
  const line = content.split('\n').find((l) => l.startsWith('# '))
  return line ? line.replace(/^#\s+/, '').trim() : 'Untitled'
}

function initiativeStatus(stage: V2Stage, events: V2Event[], id: string): 'active' | 'blocked' | 'completed' {
  const mine = events.filter((event) => event.initiativeId === id)
  if (mine.some((event) => event.kind === 'merge_completed')) return 'completed'
  if (mine.some((event) => event.kind === 'merge_blocked' || event.kind === 'escalation_raised')) return 'blocked'
  if (stage === 'execution' && mine.some((event) => event.kind === 'task_started')) return 'active'
  return 'active'
}

export function loadInitiatives(brainPath: string, events: V2Event[]): V2Initiative[] {
  const records = listMarkdownRecords(brainPath, 'brian/initiatives')
  return records.map((record) => {
    const fm = parseFrontmatter(record.content)
    const id = fm.id || record.relPath.replace(/^.*\//, '').replace(/\.md$/, '')
    const stage = (fm.stage as V2Stage) || 'intent'
    const createdAt = fm.created_at || new Date().toISOString()
    const updatedAt = fm.updated_at || createdAt
    return {
      id,
      title: fm.title || extractTitle(record.content),
      summary: fm.summary || '',
      stage,
      status: initiativeStatus(stage, events, id),
      createdAt,
      updatedAt,
      filePath: record.relPath,
    }
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function loadDiscussions(brainPath: string): V2Discussion[] {
  const records = listMarkdownRecords(brainPath, 'brian/discussions')
  return records.map((record) => {
    const fm = parseFrontmatter(record.content)
    return {
      id: fm.id || record.relPath.replace(/^.*\//, '').replace(/\.md$/, ''),
      title: fm.title || extractTitle(record.content),
      layer: (fm.layer as V2Discussion['layer']) || 'squad',
      status: (fm.status as V2Discussion['status']) || 'open',
      initiativeId: fm.initiative_id,
      unresolvedQuestions: Number(fm.unresolved_questions || '0') || 0,
      filePath: record.relPath,
      updatedAt: fm.updated_at || new Date().toISOString(),
    }
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function loadDecisions(brainPath: string): V2Decision[] {
  const records = listMarkdownRecords(brainPath, 'brian/decisions')
  return records.map((record) => {
    const fm = parseFrontmatter(record.content)
    return {
      id: fm.id || record.relPath.replace(/^.*\//, '').replace(/\.md$/, ''),
      title: fm.title || extractTitle(record.content),
      initiativeId: fm.initiative_id,
      status: (fm.status as V2Decision['status']) || 'pending',
      rationale: fm.rationale || '',
      filePath: record.relPath,
      at: fm.at || new Date().toISOString(),
    }
  }).sort((a, b) => b.at.localeCompare(a.at))
}

export function loadBriefings(brainPath: string): V2Briefing[] {
  const records = listMarkdownRecords(brainPath, 'brian/briefings')
  return records.map((record) => {
    const fm = parseFrontmatter(record.content)
    return {
      id: fm.id || record.relPath.replace(/^.*\//, '').replace(/\.md$/, ''),
      title: fm.title || extractTitle(record.content),
      summary: fm.summary || '',
      filePath: record.relPath,
      published: fm.published === 'true',
      at: fm.at || new Date().toISOString(),
    }
  }).sort((a, b) => b.at.localeCompare(a.at))
}

export function buildCompanyState(brainId: string, brainPath: string): V2CompanyState {
  const events = readEvents(brainId)
  const initiatives = loadInitiatives(brainPath, events)
  const discussions = loadDiscussions(brainPath)
  const decisions = loadDecisions(brainPath)

  const pipeline: V2CompanyState['pipeline'] = {
    intent: 0,
    proposal: 0,
    leadership_discussion: 0,
    director_decision: 0,
    tribe_shaping: 0,
    squad_planning: 0,
    execution: 0,
  }

  for (const initiative of initiatives) pipeline[initiative.stage] += 1

  const pendingDecisions = decisions.filter((decision) => decision.status === 'pending')
  const activeEscalations = discussions.filter((d) => d.status === 'escalated' || d.unresolvedQuestions > 0)
  const executionActive = initiatives.filter((initiative) => initiative.stage === 'execution' && initiative.status === 'active').length

  const blockers: Array<{ code: string; message: string }> = []
  if (activeEscalations.length > 0) {
    blockers.push({ code: 'unresolved_escalations', message: `${activeEscalations.length} escalations are unresolved` })
  }
  const mergeBlocked = events.filter((event) => event.kind === 'merge_blocked').at(-1)
  if (mergeBlocked) blockers.push({ code: 'merge_blocked', message: mergeBlocked.message })

  const directorInbox = [
    {
      director: 'Product Director',
      pendingDecisions: pendingDecisions.length,
      activeEscalations: activeEscalations.length,
      confidence: Math.max(0, 100 - activeEscalations.length * 15 - blockers.length * 10),
      status: (activeEscalations.length > 0 ? 'red' : pendingDecisions.length > 0 ? 'yellow' : 'green') as 'red' | 'yellow' | 'green',
    },
  ]

  return {
    brainId,
    at: new Date().toISOString(),
    directorInbox,
    pipeline,
    initiatives,
    pendingDecisions,
    activeEscalations,
    executionActive,
    blockers,
  }
}

export function readV2Models(brainId: string, brainPath: string) {
  const companyState = buildCompanyState(brainId, brainPath)
  const decisions = loadDecisions(brainPath)
  return {
    companyState,
    briefings: loadBriefings(brainPath),
    initiatives: companyState.initiatives,
    discussions: loadDiscussions(brainPath),
    decisions,
  }
}
