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

const PRIMARY_CONFIG_DIR = path.join(os.homedir(), '.brian')
const LEGACY_CONFIG_DIR = path.join(os.homedir(), '.braintree-os')
const CONFIG_FILES = [
  path.join(LEGACY_CONFIG_DIR, 'brains.json'),
  path.join(PRIMARY_CONFIG_DIR, 'brains.json'),
]

interface BrainsConfig {
  brains: LocalBrain[]
}

export function readBrainsConfig(): BrainsConfig {
  const merged = new Map<string, LocalBrain>()
  for (const configFile of CONFIG_FILES) {
    try {
      if (!fs.existsSync(configFile)) continue
      const raw = fs.readFileSync(configFile, 'utf8')
      const parsed = JSON.parse(raw) as BrainsConfig
      for (const brain of parsed.brains ?? []) {
        merged.set(brain.path || brain.id, brain)
      }
    } catch {
      // ignore broken config
    }
  }
  return { brains: Array.from(merged.values()) }
}

export function writeBrainsConfig(config: BrainsConfig): void {
  fs.mkdirSync(PRIMARY_CONFIG_DIR, { recursive: true })
  fs.writeFileSync(path.join(PRIMARY_CONFIG_DIR, 'brains.json'), JSON.stringify(config, null, 2) + '\n', 'utf8')
  try {
    fs.mkdirSync(LEGACY_CONFIG_DIR, { recursive: true })
    fs.writeFileSync(path.join(LEGACY_CONFIG_DIR, 'brains.json'), JSON.stringify(config, null, 2) + '\n', 'utf8')
  } catch {
    // ignore legacy mirror failure
  }
}

export function registerBrain(brainPath: string): LocalBrain {
  const config = readBrainsConfig()

  // Check if already registered
  const existing = config.brains.find((b) => b.path === brainPath)
  if (existing) return existing

  const brainJsonPath = [
    path.join(brainPath, '.brian', 'brain.json'),
    path.join(brainPath, '.braintree', 'brain.json'),
  ].find((candidate) => fs.existsSync(candidate))
  let meta: { id?: string; name?: string; description?: string } = {}
  try {
    if (brainJsonPath) {
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
    isExecutionPlanFile(f.path) ||
    f.path === 'Commands/Team-Board.md' ||
    f.path === 'brian/commands/team-board.md'
  )
  if (planFiles.length === 0) return []

  const parsedSteps: ExecutionStep[] = []

  for (const execFile of planFiles) {
    const fullPath = path.join(brainPath, execFile.path)
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      const parsed = parseExecutionPlan(content)
      parsedSteps.push(
        ...parsed.map((step, idx) => ({
          id: execFile.path === 'Commands/Team-Board.md' || execFile.path === 'brian/commands/team-board.md' ? `team-step-${idx}` : `step-${idx}`,
          phase_number: step.phase,
          step_number: Number(step.stepNumber),
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

// ── Handoffs ─────────────────────────────────────────

export function getHandoffs(brainPath: string, files: BrainFile[]): Handoff[] {
  const handoffFiles = files
    .filter((f) =>
      ((f.path.startsWith('Handoffs/') && f.path !== 'Handoffs/Handoffs.md') ||
      (f.path.startsWith('brian/handoffs/') && f.path !== 'brian/handoffs/handoffs.md')) &&
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

// ── Demo brain path ──────────────────────────────────

export function getDemoBrainPath(): string {
  // The demo brain is bundled at the package root/demo/
  // When running from the monorepo, it's at ../../demo relative to packages/web
  const candidates = [
    path.join(process.cwd(), 'demo'),
    path.join(process.cwd(), '..', '..', 'demo'),
    path.join(__dirname, '..', '..', '..', '..', 'demo'),
  ]

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, '.brian', 'brain.json')) ||
      fs.existsSync(path.join(candidate, 'brian', 'index.md')) ||
      fs.existsSync(path.join(candidate, '.braintree', 'brain.json')) ||
      fs.existsSync(path.join(candidate, 'VAULT-INDEX.md')) ||
      fs.existsSync(path.join(candidate, 'BRAIN-INDEX.md'))
    ) {
      return candidate
    }
  }

  return candidates[0] // fallback
}

export const DEMO_BRAIN: LocalBrain = {
  id: 'demo',
  name: 'clsh.dev Brain',
  description:
    'Phone-first terminal. Your Mac, in your pocket. Built from zero to full open source using Brian.',
  path: '', // Set at runtime via getDemoBrainPath()
  createdAt: '2026-03-19T00:00:00Z',
}
