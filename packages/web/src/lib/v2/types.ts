export const V2_STAGES = [
  'intent',
  'proposal',
  'leadership_discussion',
  'director_decision',
  'tribe_shaping',
  'squad_planning',
  'execution',
] as const

export type V2Stage = (typeof V2_STAGES)[number]

export const V2_EVENT_TYPES = [
  'initiative_created',
  'discussion_opened',
  'question_unresolved',
  'escalation_raised',
  'decision_recorded',
  'task_planned',
  'task_started',
  'task_completed',
  'verification_recorded',
  'merge_attempted',
  'merge_blocked',
  'merge_completed',
  'legacy_command_used',
  'briefing_generated',
  'briefing_published',
] as const

export type V2EventType = (typeof V2_EVENT_TYPES)[number]

export type V2ActorLayer = 'squad' | 'tribe' | 'director' | 'system'

export type V2Event = {
  id: string
  at: string
  actor: string
  layer: V2ActorLayer
  stage: V2Stage
  kind: V2EventType
  message: string
  initiativeId?: string
  initiativeTitle?: string
  discussionId?: string
  discussionTitle?: string
  decisionQuestion?: string
  refs: string[]
}

export type V2Initiative = {
  id: string
  title: string
  stage: V2Stage
  status: 'active' | 'blocked' | 'completed'
  summary: string
  createdAt: string
  updatedAt: string
  filePath: string
}

export type V2Discussion = {
  id: string
  title: string
  layer: 'squad' | 'tribe' | 'director'
  status: 'open' | 'resolved' | 'escalated'
  initiativeId?: string
  unresolvedQuestions: number
  question: string
  outcome: 'pending' | 'confirmed' | 'denied'
  thread: string[]
  latestResponse: string
  openQuestions: string[]
  outcomes: string[]
  participants: string[]
  escalationState: 'none' | 'pending' | 'resolved'
  pausedByEscalation: boolean
  filePath: string
  updatedAt: string
}

export type V2Decision = {
  id: string
  title: string
  initiativeId?: string
  status: 'pending' | 'approved' | 'rejected'
  question: string
  mode: 'yes_no' | 'multi_option'
  options: string[]
  selectedOption?: string
  outcome: 'pending' | 'confirmed' | 'denied'
  rationale: string
  filePath: string
  at: string
}

export type V2Briefing = {
  id: string
  title: string
  summary: string
  filePath: string
  published: boolean
  at: string
}

export type V2CompanyState = {
  brainId: string
  at: string
  directorInbox: Array<{
    director: string
    status: 'green' | 'yellow' | 'red'
    confidence: number
    pendingDecisions: number
    activeEscalations: number
  }>
  pipeline: Record<V2Stage, number>
  initiatives: V2Initiative[]
  pendingDecisions: V2Decision[]
  activeEscalations: V2Discussion[]
  executionActive: number
  blockers: Array<{ code: string; message: string; class: 'hard_blocker' }>
  advisories: Array<{ code: string; message: string; class: 'advisory' }>
}
