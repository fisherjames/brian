import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { parseWikilinks } from './wikilink-parser'
import { parseExecutionPlan, isExecutionPlanFile } from './execution-plan-parser'

// ── Types ────────────────────────────────────────────

export interface LocalBrain {
  id: string
  name: string
  description: string
  path: string
  createdAt: string
}

export interface BrainFile {
  id: string
  path: string
}

export interface BrainLink {
  source_file_id: string
  target_path: string
}

export interface ExecutionStep {
  id: string
  phase_number: number
  step_number: number
  title: string
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked'
  tasks_json: Array<{ done: boolean; text: string }> | null
}

export interface Handoff {
  id: string
  session_number: number
  date: string
  created_at: string | null
  duration_seconds: number | null
  summary: string
  file_path: string
}

// ── Config ───────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.brian')
const CONFIG_FILE = path.join(CONFIG_DIR, 'brains.json')
const CODEX_SKILLS_DIR = path.join(os.homedir(), '.codex', 'skills')

interface BrainsConfig {
  brains: LocalBrain[]
}

export function readBrainsConfig(): BrainsConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { brains: [] }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw) as BrainsConfig
    return { brains: parsed.brains ?? [] }
  } catch {
    return { brains: [] }
  }
}

export function writeBrainsConfig(config: BrainsConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf8')
}

export function registerBrain(brainPath: string): LocalBrain {
  const config = readBrainsConfig()

  // Check if already registered
  const existing = config.brains.find((b) => b.path === brainPath)
  if (existing) return existing

  const brainJsonPath = path.join(brainPath, '.brian', 'brain.json')
  let meta: { id?: string; name?: string; description?: string } = {}
  try {
    if (fs.existsSync(brainJsonPath)) {
      meta = JSON.parse(fs.readFileSync(brainJsonPath, 'utf8'))
    }
  } catch {
    // ignore
  }

  const brain: LocalBrain = {
    id: meta.id ?? crypto.randomUUID(),
    name: meta.name ?? path.basename(brainPath),
    description: meta.description ?? '',
    path: brainPath,
    createdAt: new Date().toISOString(),
  }

  config.brains.push(brain)
  writeBrainsConfig(config)
  return brain
}

// ── Brain listing ────────────────────────────────────

export function listBrains(): LocalBrain[] {
  return readBrainsConfig().brains
}

export function getBrain(brainId: string): LocalBrain | null {
  const config = readBrainsConfig()
  return config.brains.find((b) => b.id === brainId) ?? null
}

// ── File scanning ────────────────────────────────────

function generateFileId(filePath: string): string {
  return crypto.createHash('md5').update(filePath).digest('hex').slice(0, 12)
}

export function scanBrainFiles(brainPath: string): BrainFile[] {
  const files: BrainFile[] = []

  function walk(dir: string, prefix: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      // Skip hidden dirs
      if (entry.name.startsWith('.')) continue
      // Skip node_modules
      if (entry.name === 'node_modules') continue
      // Skip legacy/demo content at repo root to avoid graph bleed
      if (!prefix && (entry.name === 'demo' || entry.name === 'examples')) continue

      const fullPath = path.join(dir, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        walk(fullPath, relativePath)
      } else if (entry.name.endsWith('.md')) {
        files.push({
          id: generateFileId(relativePath),
          path: relativePath,
        })
      }
    }
  }

  walk(brainPath, '')
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

// ── Wikilink parsing ─────────────────────────────────

export function parseBrainLinks(brainPath: string, files: BrainFile[]): BrainLink[] {
  const links: BrainLink[] = []

  for (const file of files) {
    const fullPath = path.join(brainPath, file.path)
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      const wikilinks = parseWikilinks(content)
      for (const wl of wikilinks) {
        links.push({
          source_file_id: file.id,
          target_path: wl.target_path,
        })
      }
    } catch {
      // File might have been deleted
    }
  }

  return links
}

// ── Execution plan ───────────────────────────────────

export function getExecutionSteps(brainPath: string, files: BrainFile[]): ExecutionStep[] {
  const planFiles = files.filter((f) =>
    isExecutionPlanFile(f.path) || f.path === 'brian/commands/team-board.md'
  )
  if (planFiles.length === 0) return []

  const parsedSteps: ExecutionStep[] = []

  for (const execFile of planFiles) {
    const fullPath = path.join(brainPath, execFile.path)
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      const parsed = parseExecutionPlan(content)
      const fileIdPrefix = generateFileId(execFile.path)
      parsedSteps.push(
        ...parsed.map((step, idx) => ({
          id: execFile.path === 'brian/commands/team-board.md'
            ? `team-step-${fileIdPrefix}-${idx}`
            : `step-${fileIdPrefix}-${idx}`,
          phase_number: step.phase,
          step_number: normalizeStepNumber(step.stepNumber, step.phase),
          title: step.title,
          status: step.status as ExecutionStep['status'],
          tasks_json: step.tasks.length > 0 ? step.tasks : null,
        }))
      )
    } catch {
      // ignore invalid plan files
    }
  }

  return parsedSteps.sort((a, b) => {
    if (a.phase_number !== b.phase_number) return a.phase_number - b.phase_number
    return a.step_number - b.step_number
  })
}

function normalizeStepNumber(raw: string, phase: number): number {
  const trimmed = raw.trim()
  const dottedMatch = trimmed.match(/^(\d+)\.(\d+)$/)
  if (dottedMatch) {
    const [, dottedPhase, dottedStep] = dottedMatch
    if (Number(dottedPhase) === phase) return Number(dottedStep)
  }
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : 0
}

// ── Handoffs ─────────────────────────────────────────

export function getHandoffs(brainPath: string, files: BrainFile[]): Handoff[] {
  const handoffFiles = files
    .filter((f) =>
      f.path.startsWith('brian/handoffs/') &&
      f.path !== 'brian/handoffs/handoffs.md' &&
      f.path.endsWith('.md')
    )
    .sort((a, b) => b.path.localeCompare(a.path))

  return handoffFiles.map((f, idx) => {
    const fullPath = path.join(brainPath, f.path)
    let summary = ''
    let sessionNumber = handoffFiles.length - idx
    let date = ''

    try {
      const content = fs.readFileSync(fullPath, 'utf8')

      // Extract session number from filename like handoff-2026-03-19-session10.md
      const sessionMatch = f.path.match(/session[_-]?(\d+)/i)
      if (sessionMatch) sessionNumber = parseInt(sessionMatch[1], 10)

      // Extract date from filename or frontmatter
      const dateMatch = f.path.match(/(\d{4}-\d{2}-\d{2})/)
      if (dateMatch) date = dateMatch[1]

      // Extract summary from content (first paragraph after frontmatter)
      const lines = content.split('\n')
      const summaryLines: string[] = []
      let inFrontmatter = false
      let pastFrontmatter = false

      for (const line of lines) {
        if (line.trim() === '---') {
          if (!inFrontmatter) { inFrontmatter = true; continue }
          pastFrontmatter = true
          continue
        }
        if (!pastFrontmatter && inFrontmatter) continue
        if (!pastFrontmatter) pastFrontmatter = true

        // Skip headings
        if (line.startsWith('#')) continue
        // Take first non-empty paragraph
        if (line.trim() === '' && summaryLines.length > 0) break
        if (line.trim()) summaryLines.push(line.trim())
      }
      summary = summaryLines.join(' ').slice(0, 300)
    } catch {
      // ignore
    }

    const stat = fs.statSync(fullPath, { throwIfNoEntry: false })

    return {
      id: f.id,
      session_number: sessionNumber,
      date: date || (stat ? stat.mtime.toISOString().slice(0, 10) : ''),
      created_at: stat ? stat.mtime.toISOString() : null,
      duration_seconds: null,
      summary,
      file_path: f.path,
    }
  })
}

// ── File content reading ─────────────────────────────

export function readBrainFile(brainPath: string, filePath: string): string {
  // Security: ensure the file is within the brain directory
  const resolved = path.resolve(brainPath, filePath)
  if (!resolved.startsWith(path.resolve(brainPath))) {
    throw new Error('Path traversal detected')
  }

  return fs.readFileSync(resolved, 'utf8')
}

export function writeBrainFile(brainPath: string, filePath: string, content: string): void {
  const root = path.resolve(brainPath)
  const resolved = path.resolve(brainPath, filePath)
  if (!resolved.startsWith(root)) {
    throw new Error('Path traversal detected')
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, content, 'utf8')
}

function resolveCodexSkillPath(skillName: string): string {
  const trimmed = skillName.trim()
  if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('Invalid skill name')
  }
  const resolved = path.resolve(CODEX_SKILLS_DIR, trimmed, 'SKILL.md')
  const root = path.resolve(CODEX_SKILLS_DIR)
  if (!resolved.startsWith(root)) throw new Error('Path traversal detected')
  return resolved
}

export function listCodexSkills(): string[] {
  if (!fs.existsSync(CODEX_SKILLS_DIR)) return []
  const entries = fs.readdirSync(CODEX_SKILLS_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(CODEX_SKILLS_DIR, name, 'SKILL.md')))
    .sort((a, b) => a.localeCompare(b))
}

export function readCodexSkill(skillName: string): string {
  const filePath = resolveCodexSkillPath(skillName)
  return fs.readFileSync(filePath, 'utf8')
}

export function writeCodexSkill(skillName: string, content: string): void {
  const filePath = resolveCodexSkillPath(skillName)
  fs.writeFileSync(filePath, content, 'utf8')
}
