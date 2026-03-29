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

function normalizeYesNoQuestion(question: string, title: string): string {
  const raw = question.trim()
  if (!raw) return `Should we proceed with "${title}" now?`
  if (raw.endsWith('?') && /^(should|is|are|can|could|do|does|did|will|would|has|have)\b/i.test(raw)) return raw
  const normalized = raw.replace(/[.!]+$/g, '').trim()
  if (/^(should|is|are|can|could|do|does|did|will|would|has|have)\b/i.test(normalized)) return `${normalized}?`
  return `Should we proceed with "${normalized}" now?`
}

function extractSectionBulletLines(content: string, heading: string): string[] {
  const lines = content.split('\n')
  const marker = `## ${heading}`
  const start = lines.findIndex((line) => line.trim() === marker)
  if (start < 0) return []
  const out: string[] = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^##\s+/.test(line.trim())) break
    const bullet = line.match(/^\s*-\s+(.+)\s*$/)
    if (bullet) out.push(bullet[1].trim())
  }
  return out
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
    const question = String(fm.initial_question || fm.question || '').trim()
    const thread = extractSectionBulletLines(record.content, 'Thread')
    const openQuestions = (() => {
      try {
        const parsed = JSON.parse(String(fm.open_questions_json || '[]'))
        return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : []
      } catch {
        return []
      }
    })()
    const outcomes = (() => {
      try {
        const parsed = JSON.parse(String(fm.outcomes_json || '[]'))
        return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : []
      } catch {
        return []
      }
    })()
    const participants = (() => {
      try {
        const parsed = JSON.parse(String(fm.personas_json || '[]'))
        return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : []
      } catch {
        return []
      }
    })()
    return {
      id: fm.id || record.relPath.replace(/^.*\//, '').replace(/\.md$/, ''),
      title: fm.title || extractTitle(record.content),
      layer: (fm.layer as V2Discussion['layer']) || 'squad',
      status: (fm.status as V2Discussion['status']) || 'open',
      initiativeId: fm.initiative_id,
      unresolvedQuestions: Number(fm.unresolved_questions || '0') || 0,
      question,
      outcome: (String(fm.outcome || 'pending') as V2Discussion['outcome']),
      thread,
      latestResponse: thread.at(-1) ?? '',
      openQuestions,
      outcomes,
      participants,
      escalationState: (String(fm.escalation_state || 'none') as V2Discussion['escalationState']),
      pausedByEscalation: String(fm.paused_by_escalation || 'false') === 'true',
      filePath: record.relPath,
      updatedAt: fm.updated_at || new Date().toISOString(),
    }
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function loadDecisions(brainPath: string): V2Decision[] {
  const records = listMarkdownRecords(brainPath, 'brian/decisions')
  return records.map((record) => {
    const fm = parseFrontmatter(record.content)
    const title = fm.title || extractTitle(record.content)
    const mode: V2Decision['mode'] = String(fm.decision_mode || 'yes_no') === 'multi_option' ? 'multi_option' : 'yes_no'
    const rawQuestion = String(fm.decision_question || fm.question || '').trim()
    const question = mode === 'yes_no' ? normalizeYesNoQuestion(rawQuestion, title) : rawQuestion
    const options = (() => {
      try {
        const parsed = JSON.parse(String(fm.decision_options_json || '[]'))
        return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : []
      } catch {
        return []
      }
    })()
    return {
      id: fm.id || record.relPath.replace(/^.*\//, '').replace(/\.md$/, ''),
      title,
      initiativeId: fm.initiative_id,
      status: (fm.status as V2Decision['status']) || 'pending',
      question,
      mode,
      options,
      selectedOption: fm.selected_option || undefined,
      outcome: (String(fm.outcome || 'pending') as V2Decision['outcome']),
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
  const activeEscalations = discussions.filter((d) => d.escalationState === 'pending' || d.status === 'escalated')
  const executionActive = initiatives.filter((initiative) => initiative.stage === 'execution' && initiative.status === 'active').length

  const blockers: Array<{ code: string; message: string; class: 'hard_blocker' }> = []
  const advisories: Array<{ code: string; message: string; class: 'advisory' }> = []
  if (activeEscalations.length > 0) {
    blockers.push({ code: 'unresolved_escalations', class: 'hard_blocker', message: `${activeEscalations.length} escalations are unresolved` })
  }
  const decisionsMissingQuestion = pendingDecisions.filter((decision) => !decision.question).length
  if (decisionsMissingQuestion > 0) {
    blockers.push({
      code: 'decision_question_missing',
      class: 'hard_blocker',
      message: `${decisionsMissingQuestion} pending decision records are missing explicit questions`,
    })
  }
  const escalationsMissingQuestion = activeEscalations.filter((discussion) => !discussion.question).length
  if (escalationsMissingQuestion > 0) {
    blockers.push({
      code: 'escalation_question_missing',
      class: 'hard_blocker',
      message: `${escalationsMissingQuestion} active escalation records are missing explicit questions`,
    })
  }
  const mergeBlocked = events.filter((event) => event.kind === 'merge_blocked').at(-1)
  if (mergeBlocked) blockers.push({ code: 'merge_blocked', class: 'hard_blocker', message: mergeBlocked.message })
  if (pendingDecisions.length > 0) {
    advisories.push({
      code: 'pending_decisions',
      class: 'advisory',
      message: `${pendingDecisions.length} decisions need executive resolution.`,
    })
  }
  if (executionActive > 0) {
    advisories.push({
      code: 'execution_active',
      class: 'advisory',
      message: `${executionActive} initiative(s) currently executing.`,
    })
  }

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
    advisories,
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
