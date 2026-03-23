#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import * as net from 'node:net'
import * as readline from 'node:readline/promises'

const PRIMARY_CONFIG_DIR = path.join(os.homedir(), '.brian')
const LEGACY_CONFIG_DIR = path.join(os.homedir(), '.braintree-os')
const CONFIG_DIRS = [PRIMARY_CONFIG_DIR, LEGACY_CONFIG_DIR]
const BRAINS_JSON = path.join(PRIMARY_CONFIG_DIR, 'brains.json')
const LEGACY_BRAINS_JSON = path.join(LEGACY_CONFIG_DIR, 'brains.json')
const SERVER_JSON = path.join(PRIMARY_CONFIG_DIR, 'server.json')
const LEGACY_SERVER_JSON = path.join(LEGACY_CONFIG_DIR, 'server.json')

const VERSION = '0.2.0'

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

type InitPreset = 'core' | 'codex-team'

type InitOptions = {
  name: string
  description: string
  preset: InitPreset
  linkExistingDocs: boolean
  addPackageScripts: boolean
}

function ensureConfigDir() {
  fs.mkdirSync(PRIMARY_CONFIG_DIR, { recursive: true })
  if (!fs.existsSync(BRAINS_JSON)) {
    fs.writeFileSync(BRAINS_JSON, JSON.stringify({ brains: [] }, null, 2) + '\n')
  }
}

function readBrainsConfig(): BrainsConfig {
  ensureConfigDir()
  const merged = new Map<string, BrainEntry>()

  for (const configPath of [LEGACY_BRAINS_JSON, BRAINS_JSON]) {
    try {
      if (!fs.existsSync(configPath)) continue
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      const brains = Array.isArray(parsed.brains) ? parsed.brains : []
      for (const brain of brains) {
        const key = brain.path || brain.id
        if (key) merged.set(key, brain)
      }
    } catch {
      // ignore broken config file
    }
  }

  return { brains: Array.from(merged.values()) }
}

function writeBrainsConfig(config: BrainsConfig) {
  ensureConfigDir()
  fs.writeFileSync(BRAINS_JSON, JSON.stringify(config, null, 2) + '\n')
  try {
    fs.mkdirSync(LEGACY_CONFIG_DIR, { recursive: true })
    fs.writeFileSync(LEGACY_BRAINS_JSON, JSON.stringify(config, null, 2) + '\n')
  } catch {
    // ignore legacy mirror failures
  }
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

function isoNow(): string {
  return new Date().toISOString()
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

function findBrainRoot(startDir: string): string | null {
  let current = path.resolve(startDir)
  while (true) {
    if (
      fs.existsSync(path.join(current, 'BRAIN-INDEX.md')) ||
      fs.existsSync(path.join(current, 'brian', 'index.md')) ||
      fs.existsSync(path.join(current, '.braintree', 'brain.json')) ||
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
  const metaPath = [
    path.join(brainRoot, '.brian', 'brain.json'),
    path.join(brainRoot, '.braintree', 'brain.json'),
  ].find(candidate => fs.existsSync(candidate))
  if (!metaPath) return null

  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as BrainMeta
  } catch {
    return null
  }
}

function brainDocsRoot(brainRoot: string): string {
  const brianRoot = path.join(brainRoot, 'brian')
  if (fs.existsSync(path.join(brianRoot, 'index.md'))) return brianRoot
  return brainRoot
}

function brainMetaDir(brainRoot: string): string {
  if (fs.existsSync(path.join(brainRoot, '.brian')) || fs.existsSync(path.join(brainRoot, 'brian', 'index.md'))) {
    return path.join(brainRoot, '.brian')
  }
  return path.join(brainRoot, '.braintree')
}

function resolveExistingPath(brainRoot: string, candidates: string[], fallback?: string): string {
  for (const candidate of candidates) {
    const absolute = path.join(brainRoot, candidate)
    if (fs.existsSync(absolute)) return absolute
  }
  return path.join(brainRoot, fallback ?? candidates[0])
}

function rootIndexPath(brainRoot: string): string {
  return resolveExistingPath(brainRoot, ['brian/index.md', 'BRAIN-INDEX.md'], 'brian/index.md')
}

function executionPlanNotePath(brainRoot: string): string {
  return resolveExistingPath(
    brainRoot,
    ['brian/execution-plan.md', 'Execution-Plan.md', 'Execution-Plan/Execution-Plan.md', 'Execution_Plan/Execution_Plan.md'],
    'brian/execution-plan.md'
  )
}

function handoffsDirPath(brainRoot: string): string {
  return resolveExistingPath(brainRoot, ['brian/handoffs', 'Handoffs'], 'brian/handoffs')
}

function commandsDirPath(brainRoot: string): string {
  return resolveExistingPath(brainRoot, ['brian/commands', 'Commands'], 'brian/commands')
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
  const directCandidates = [
    path.join(brainRoot, 'brian', 'execution-plan.md'),
    path.join(brainRoot, 'Execution-Plan.md'),
    path.join(brainRoot, 'Execution-Plan', 'Execution-Plan.md'),
    path.join(brainRoot, 'Execution_Plan', 'Execution_Plan.md'),
  ]

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

function commandPromptSummary(brainRoot: string) {
  console.log(`  Brain root: ${brainRoot}`)
  console.log('  Codex slash commands you can use inside the chat:')
  console.log('  - /init      Generate or refresh AGENTS.md instructions')
  console.log('  - /plan      Switch the current chat into planning mode')
  console.log('  - /resume    Resume an old Codex conversation transcript')
  console.log('  - /status    Show Codex session configuration and token usage')
  console.log('')
  console.log('  Brian workflow commands live in the shell:')
  console.log('  - brian init')
  console.log('  - brian resume')
  console.log('  - brian wrap-up')
  console.log('  - brian status')
  console.log('  - brian notes <scope>')
  console.log('  - brian plan <step>')
  console.log('  - brian sprint')
  console.log('  - brian sync')
  console.log('  - brian feature <name>')
  console.log('  - legacy alias still works: brain-tree-os ...')
  console.log('')
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
    'BRAIN-INDEX.md',
    'AGENTS.md',
    'brian/execution-plan.md',
    'Execution-Plan.md',
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
    path.join('brian', 'commands', 'notes-loop.md'),
    path.join('brian', 'commands', 'team-board.md'),
    path.join('brian', 'commands', 'end-loop.md'),
    path.join('brian', 'agents', 'agents.md'),
    path.join('brian', 'agents', 'project-operator.md'),
    path.join('brian', 'assets', 'assets.md'),
    path.join('brian', 'templates', 'templates.md'),
    path.join('brian', 'templates', 'handoff-template.md'),
    path.join('brian', 'handoffs', 'handoffs.md'),
    path.join('brian', 'handoffs', 'handoff-000.md'),
    path.join('01_Product', 'Product.md'),
    path.join('01_Product', 'Project-Goals.md'),
    path.join('01_Product', 'Current-Scope.md'),
    path.join('02_Engineering', 'Engineering.md'),
    path.join('02_Engineering', 'Architecture.md'),
    path.join('02_Engineering', 'Codebase-Map.md'),
    path.join('03_Operations', 'Operations.md'),
    path.join('03_Operations', 'Runbook.md'),
    path.join('03_Operations', 'Workflow.md'),
    path.join('Agents', 'Agents.md'),
    path.join('Agents', 'Project-Operator.md'),
    path.join('Assets', 'Assets.md'),
    path.join('Templates', 'Templates.md'),
    path.join('Templates', 'Handoff-Template.md'),
    path.join('Handoffs', 'Handoffs.md'),
    path.join('Handoffs', 'handoff-000.md'),
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

  const canAddPackageScripts = hasPackageJson(brainRoot)
  const shouldPrompt = !hasFlag(args, '--yes') && Boolean(process.stdin.isTTY && process.stdout.isTTY)

  if (!shouldPrompt) {
    return {
      name: defaultName,
      description: defaultDescription,
      preset: defaultPreset,
      linkExistingDocs: explicitLinkExistingDocs ?? defaultPreset === 'codex-team',
      addPackageScripts: canAddPackageScripts && (explicitAddPackageScripts ?? defaultPreset === 'codex-team'),
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

    console.log('')

    return { name, description, preset, linkExistingDocs, addPackageScripts }
  } finally {
    rl.close()
  }
}

function importableMarkdownFiles(brainRoot: string): string[] {
  const excludedDirs = new Set([
    '.brian',
    '.braintree',
    'brian',
    '01_Product',
    '02_Engineering',
    '03_Operations',
    '04_Operations',
    'Agents',
    'Assets',
    'Templates',
    'Handoffs',
    'Commands',
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
    'brain:resume': 'brian resume',
    'brain:status': 'brian status',
    'brain:sync': 'brian sync',
    'brain:wrap': 'brian wrap-up',
    'brain:notes': 'brian notes',
    'brain:plan': 'brian plan',
    'brain:feature': 'brian feature',
  }

  if (preset === 'codex-team') {
    additions['brain:start'] = 'brian resume && codex'
    additions['brain:end'] = 'brian wrap-up && codex "Fill the newest handoff in brian/handoffs/, update the relevant brian notes, and update brian/execution-plan.md if progress changed."'
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
- [[handoffs]] - session continuity notes
- [[templates]] - reusable templates for future sessions
- [[assets]] - screenshots, PDFs, diagrams, and reference files

## Root Files
- \`AGENTS.md\` - Codex instructions for this repository
- [[execution-plan]] - build order, status, and next priorities

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

## Working Rules
- Keep project-specific decisions in the brain files, not only in chat history.
- Update the matching brain note when architecture, priorities, or risks change.
- Use \`brian notes "<scope>"\` after changing a top-level or workflow note so downstream notes do not drift.
- End meaningful sessions with a new handoff note and execution plan updates.

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
`)

  writeFileIfMissing(path.join(docsRoot, 'operations', 'existing-docs.md'), `# existing docs

> Part of [[operations]]

Imported markdown docs from the repository should be linked here when you run init with doc linking enabled.
`)

  writeFileIfMissing(path.join(docsRoot, 'operations', 'runbook.md'), `# runbook

> Part of [[operations]]

- Replace this with the real setup, run, test, and deploy commands for the project.
- Capture any environment prerequisites or local services.
${options.addPackageScripts ? '\n## Helper Commands\n- `pnpm brain:viewer`\n- `pnpm brain:resume`\n- `pnpm brain:status`\n- `pnpm brain:sync`\n- `pnpm brain:wrap`\n- `pnpm brain:notes -- "<scope>"`\n' : ''}
`)

  writeFileIfMissing(path.join(docsRoot, 'operations', 'workflow.md'), `# workflow

> Part of [[operations]]

${hasCommands
  ? `1. Read [[index]], \`AGENTS.md\`, [[execution-plan]], and the latest handoff.
2. Use [[commands]] for the canonical session workflow loops.
3. Open the relevant area note before editing code or docs.
4. Use \`brian notes "<scope>"\` after changing a top-level or workflow note.
5. Create a new handoff before ending a meaningful session.`
  : `1. Read [[index]], \`AGENTS.md\`, [[execution-plan]], and the latest handoff.
2. Inspect the relevant area before editing code.
3. Make a narrow, testable change.
4. Update the brain files and create a new handoff before ending the session.`}
`)

  if (hasCommands) {
    writeFileIfMissing(path.join(docsRoot, 'commands', 'commands.md'), `# commands

> Part of [[index]]

This folder defines the repeatable Codex workflow layer for the repository.

## Key Files
- [[start-loop]]
- [[plan-loop]]
- [[notes-loop]]
- [[team-board]]
- [[end-loop]]
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'start-loop.md'), `# start loop

> Part of [[commands]]

## Canonical Start
\`\`\`bash
brian resume
codex
${options.addPackageScripts ? 'pnpm brain:start' : ''}
\`\`\`

## Sequence
1. Read the core brain files shown by \`brian resume\`.
2. Open the relevant note index and role note before non-trivial work.
3. Keep the work scoped and update the brain when decisions change.
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'plan-loop.md'), `# plan loop

> Part of [[commands]]

## Canonical Planning
\`\`\`bash
brian plan EP-2
${options.addPackageScripts ? 'pnpm brain:plan -- EP-2' : ''}
\`\`\`

## Sequence
1. Use \`brian plan\` to create a linked planning note from [[execution-plan]].
2. Use Codex \`/plan\` inside the chat to refine that step into an implementation sequence.
3. Record decisions and verification before editing code.
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'notes-loop.md'), `# notes loop

> Part of [[commands]]

## Canonical Reconciliation
\`\`\`bash
brian notes "product"
${options.addPackageScripts ? 'pnpm brain:notes -- "Product"' : ''}
\`\`\`

## Sequence
1. Run \`brian notes "<scope>"\` after changing a top-level or workflow note.
2. Let Codex reconcile only the downstream notes that are now stale.
3. Run \`brian sync\` after the update if you want an explicit graph check.
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'team-board.md'), `# team board

> Part of [[index]]

This note is a viewer-facing placeholder for projects that later add repo-local orchestration or parallel work tracking.

## Phase 99 - Team Board

### Step 99.1: No active team workflow configured
- **Status**: not_started
- Add repo-local orchestration only if the project genuinely needs it.
`)

    writeFileIfMissing(path.join(docsRoot, 'commands', 'end-loop.md'), `# end loop

> Part of [[commands]]

## Canonical Wrap-Up
\`\`\`bash
brian wrap-up
${options.addPackageScripts ? 'pnpm brain:end' : ''}
\`\`\`

## Sequence
1. Create the next handoff note.
2. Fill it with what changed, verification, risks, and the next step.
3. Update [[execution-plan]] if progress changed.
4. If you use the generated \`pnpm brain:end\` helper, remember it opens a fresh Codex launch rather than writing into a live existing session.
`)
  }

  writeFileIfMissing(path.join(docsRoot, 'agents', 'agents.md'), `# agents

> Part of [[index]]

Codex-specific operating notes live here.

## Key Files
- [[project-operator]]
${hasCommands ? '- [[founder-ceo]]\n- [[product-lead]]\n- [[growth-marketing]]\n- [[frontend-engineer]]\n- [[backend-engineer]]\n- [[mobile-engineer]]\n- [[devops-release]]\n' : ''}`)

  writeFileIfMissing(path.join(docsRoot, 'agents', 'project-operator.md'), `# project operator

> Part of [[agents]]

## Purpose
Use this agent note for routine implementation work in Codex.

## Instructions
- Read the current brain state before coding.
- Prefer targeted edits and explicit verification.
- Keep decisions in the repository brain, not only in session memory.
`)

  if (hasCommands) {
    const roleNotes: Array<[string, string, string]> = [
      ['founder-ceo.md', 'founder / ceo', 'Use this note when shaping direction, priorities, positioning, or business tradeoffs. Keep the output high-level, explicit about tradeoffs, and tied back to the actual product constraints.'],
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
  if (options.linkExistingDocs) linkExistingDocs(brainRoot)

  return meta
}

function formatViewerUrl(brainId: string): string | null {
  for (const serverPath of [SERVER_JSON, LEGACY_SERVER_JSON]) {
    if (!fs.existsSync(serverPath)) continue
    try {
      const server = JSON.parse(fs.readFileSync(serverPath, 'utf8'))
      if (server && server.port) {
        return `http://localhost:${server.port}/brains/${brainId}`
      }
    } catch {
      // ignore broken server config
    }
  }
  return null
}

function printStatus(brainRoot?: string) {
  if (brainRoot) {
    const meta = readBrainMeta(brainRoot)
    if (meta) {
      console.log(`  Brain: ${meta.name}`)
      console.log(`  Path: ${brainRoot}`)
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
  const commandsPath = resolveExistingPath(brainRoot, ['brian/commands/commands.md', 'Commands/Commands.md'])
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
  const commandsPath = resolveExistingPath(brainRoot, ['brian/commands/commands.md', 'Commands/Commands.md'])
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

## Open Risks

## Recommended Next Step
`
  )

  const lowerIndex = path.join(handoffDir, 'handoffs.md')
  const handoffsIndexPath = fs.existsSync(lowerIndex) || handoffDir.includes(`${path.sep}brian${path.sep}`)
    ? lowerIndex
    : path.join(handoffDir, 'Handoffs.md')
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
  fs.mkdirSync(PRIMARY_CONFIG_DIR, { recursive: true })
  fs.writeFileSync(SERVER_JSON, payload)
  try {
    fs.mkdirSync(LEGACY_CONFIG_DIR, { recursive: true })
    fs.writeFileSync(LEGACY_SERVER_JSON, payload)
  } catch {
    // ignore legacy mirror failures
  }
}

function cleanupServerConfig() {
  try {
    if (fs.existsSync(SERVER_JSON)) fs.unlinkSync(SERVER_JSON)
    if (fs.existsSync(LEGACY_SERVER_JSON)) fs.unlinkSync(LEGACY_SERVER_JSON)
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
  console.log('  |  3. Run: brian resume                                       |')
  console.log('  |  4. Open Codex in the project                               |')
  console.log('  |  5. Optional in Codex: /plan or /status                     |')
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
    brian resume                    Show the files to read before working
    brian wrap-up                   Create the next handoff template
    brian status                    Show the current brain or all registered brains
    brian notes <scope>             Reconcile downstream notes after top-level edits
    brian migrate                   Move a legacy BrainTree layout into brian/.brian
    brian plan [step]               Create a step plan note for an execution-plan step
    brian sprint                    Create a sprint note from ready and in-progress work
    brian sync                      Scan the brain for broken links and disconnected files
    brian feature <name>            Create a feature spec note inside the brain
    brian codex                     Show the Codex slash-command mapping for Brian
    brian help                      Show this help

  Legacy alias:
    brain-tree-os ...               Still supported for compatibility

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

  if (command === 'help' || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    showHelp()
    return
  }

  if (command === 'start') {
    await startViewer(args)
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
    if (initOptions.linkExistingDocs) {
      console.log('  Existing docs: linked into brian/operations/existing-docs.md where possible')
    }
    console.log('  Next: run `brian resume`, then open Codex in this project.')
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

    const handoffPath = createWrapUp(brainRoot)
    console.log(`  Created handoff template: ${handoffPath}`)
    console.log('  Fill it in, then update brian/execution-plan.md before ending the session.')
    return
  }

  if (command === 'migrate') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    const moved = migrateLegacyLayout(brainRoot)
    if (moved.length === 0) {
      console.log('  No legacy BrainTree paths needed migration.')
    } else {
      console.log('  Migrated paths:')
      for (const item of moved) console.log(`  - ${item}`)
    }
    console.log('  Next: run `brian resume` and `brian sync` to verify the new layout.')
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

    const exitCode = await runInherited('codex', ['exec', '--full-auto', '--ephemeral', buildNotesPrompt(brainRoot, scope)], brainRoot)
    if (exitCode !== 0) {
      process.exit(exitCode)
    }
    console.log('  Reconciliation finished. Run `brian sync` if you want an explicit graph check.')
    return
  }

  if (command === 'plan') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    const executionPlan = readExecutionPlanSteps(brainRoot)
    if (!executionPlan || executionPlan.steps.length === 0) {
      console.log('  No parseable execution plan found.')
      console.log('  Keep using Codex `/plan`, but add brian/execution-plan.md if you want Brian step planning.')
      return
    }

    const stepArg = args[0]
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
      { dir: '03_Operations', index: 'Operations.md', name: 'Operations' },
      { dir: '04_Operations', index: 'Operations.md', name: 'Operations' },
      { dir: 'Operations', index: 'Operations.md', name: 'Operations' },
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
      { dir: '03_Operations', index: 'Operations.md', name: 'Operations' },
      { dir: '04_Operations', index: 'Operations.md', name: 'Operations' },
      { dir: 'Operations', index: 'Operations.md', name: 'Operations' },
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

  if (command === 'feature') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    const featureName = args.join(' ').trim()
    if (!featureName) {
      console.log('  Usage: brian feature <name>')
      return
    }

    const product = resolveFolderContext(brainRoot, [
      { dir: path.join('brian', 'product'), index: 'product.md', name: 'product' },
      { dir: '01_Product', index: 'Product.md', name: 'Product' },
      { dir: '00_Vision', index: 'Vision.md', name: 'Vision' },
      { dir: 'Product', index: 'Product.md', name: 'Product' },
      { dir: 'Vision', index: 'Vision.md', name: 'Vision' },
    ])

    if (!product) {
      console.log('  No Product or Vision index found to attach the feature spec.')
      return
    }

    const fileName = `feature-${slugify(featureName)}.md`
    const featurePath = ensureLinkedNote(
      product.dir,
      product.indexPath,
      product.indexName,
      fileName,
      `feature ${featureName}`,
      `## Status\nPlanning\n\n## Summary\nDescribe the user-facing behavior for ${featureName}.\n\n## Motivation\nWhy this feature matters.\n\n## Requirements\n- [ ] Add the concrete requirements here\n- [ ] Link the relevant notes and code paths\n\n## Suggested Codex Prompt\nUse \`/plan\` in Codex with:\n\n\`/plan Create an implementation plan for the feature "${featureName}". Read brian/index.md, AGENTS.md, brian/execution-plan.md, and this feature spec first.\`\n\n## Open Questions\n- Clarify constraints, tradeoffs, and rollout details.\n`
    )

    console.log(`  Created feature spec: ${featurePath}`)
    console.log('  Next in Codex: run `/plan` to turn the spec into execution tasks.')
    return
  }

  if (command === 'sync') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brian init` first.')
      return
    }

    const files = findMarkdownFiles(brainRoot)
    const relativeFiles = files.map(file => path.relative(brainRoot, file))
    const byBaseName = new Map(relativeFiles.map(file => [path.basename(file, '.md'), file]))
    const brokenLinks: Array<{ file: string; target: string }> = []
    const missingParents: string[] = []

    for (const file of files) {
      const relative = path.relative(brainRoot, file)
      const content = fs.readFileSync(file, 'utf8')

      if (relative !== 'BRAIN-INDEX.md' && relative !== path.join('brian', 'index.md') && !content.includes('> Part of [[')) {
        missingParents.push(relative)
      }

      const matches = [...content.matchAll(/\[\[([^\]]+)\]\]/g)]
      for (const match of matches) {
        const target = match[1].trim()
        if (!byBaseName.has(target) && !relativeFiles.some(candidate => candidate.replace(/\.md$/, '') === target)) {
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
    console.log('  Next in Codex: ask it to fix the issues found here, then run `brian sync` again.')
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
