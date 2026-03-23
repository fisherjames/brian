#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import * as net from 'node:net'

const CONFIG_DIR = path.join(os.homedir(), '.braintree-os')
const BRAINS_JSON = path.join(CONFIG_DIR, 'brains.json')
const SERVER_JSON = path.join(CONFIG_DIR, 'server.json')

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
    return { brains: Array.isArray(parsed.brains) ? parsed.brains : [] }
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

  return 'Codex-first BrainTree workspace for this project.'
}

function findBrainRoot(startDir: string): string | null {
  let current = path.resolve(startDir)
  while (true) {
    if (
      fs.existsSync(path.join(current, 'BRAIN-INDEX.md')) ||
      fs.existsSync(path.join(current, '.braintree', 'brain.json'))
    ) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function readBrainMeta(brainRoot: string): BrainMeta | null {
  const metaPath = path.join(brainRoot, '.braintree', 'brain.json')
  if (!fs.existsSync(metaPath)) return null

  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as BrainMeta
  } catch {
    return null
  }
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

function createBrainScaffold(brainRoot: string, name: string, description: string): BrainMeta {
  const created = isoNow()
  const id = crypto.randomUUID()
  const scripts = detectScripts(brainRoot)
  const scriptList = scripts.length > 0 ? scripts.map(script => `- \`${script}\``).join('\n') : '- Add your common project commands here'
  const meta: BrainMeta = {
    id,
    name,
    description,
    created,
    version: '1.0.0',
  }

  writeFileIfMissing(
    path.join(brainRoot, '.braintree', 'brain.json'),
    JSON.stringify(meta, null, 2) + '\n'
  )

  writeFileIfMissing(
    path.join(brainRoot, 'BRAIN-INDEX.md'),
    `# ${name}

> ${description}

## Folders
- [[Product]] - goals, scope, users, and roadmap notes
- [[Engineering]] - architecture, codebase structure, and technical decisions
- [[Operations]] - runbooks, workflows, release notes, and maintenance tasks
- [[Agents]] - Codex-facing operating rules and reusable agent notes
- [[Handoffs]] - session continuity notes
- [[Templates]] - reusable templates for future sessions
- [[Assets]] - screenshots, PDFs, diagrams, and reference files

## Root Files
- [[AGENTS]] - Codex instructions for this repository
- [[Execution-Plan]] - build order, status, and next priorities

## Session Log
- [[handoff-000]] - Brain initialized on ${created.slice(0, 10)}
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'AGENTS.md'),
    `# ${name} Agent Guide

> Part of [[BRAIN-INDEX]]

## Session Start
- Read [[BRAIN-INDEX]], [[Execution-Plan]], and the latest entry in [[Handoffs]] before making non-trivial changes.
- Open the relevant folder index before changing code or docs.
- Prefer small, verifiable edits over speculative rewrites.

## Working Rules
- Keep project-specific decisions in the brain files, not only in chat history.
- Update the matching brain note when architecture, priorities, or risks change.
- End meaningful sessions with a new handoff note and execution plan updates.

## Verification
- Run the narrowest realistic check for the files you changed.
- If verification is incomplete, record the gap in the handoff.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'Execution-Plan.md'),
    `# Execution Plan

> Part of [[BRAIN-INDEX]]

## Phase 1 - Brain Setup

### EP-1 Brain scaffold
- **Status**: completed
- **Goal**: Create the BrainTree structure and register this project with the viewer.

## Phase 2 - Current Project Work

### EP-2 Inspect the existing codebase
- **Status**: not_started
- **Goal**: Summarize the real architecture, current priorities, and active risks for this project.

### EP-3 Replace placeholder notes with project-specific notes
- **Status**: not_started
- **Goal**: Refine the product, engineering, and operations notes from the actual repository.

### EP-4 Start the next meaningful task
- **Status**: not_started
- **Goal**: Use the updated brain to drive the next real code change.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, '01_Product', 'Product.md'),
    `# Product

> Part of [[BRAIN-INDEX]]

This area tracks the user-facing purpose of the project, the scope, and the current priorities.

## Key Files
- [[Project-Goals]]
- [[Current-Scope]]
`
  )

  writeFileIfMissing(
    path.join(brainRoot, '01_Product', 'Project-Goals.md'),
    `# Project Goals

> Part of [[Product]]

- Replace this note with the real goals of the existing project.
- Capture who the user is, what problem the project solves, and what "done" looks like.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, '01_Product', 'Current-Scope.md'),
    `# Current Scope

> Part of [[Product]]

- Record the features already implemented.
- Record what is intentionally deferred.
- Record any obvious mismatch between the current codebase and the intended product shape.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, '02_Engineering', 'Engineering.md'),
    `# Engineering

> Part of [[BRAIN-INDEX]]

This area tracks the real code structure, runtime model, and implementation constraints.

## Key Files
- [[Architecture]]
- [[Codebase-Map]]
`
  )

  writeFileIfMissing(
    path.join(brainRoot, '02_Engineering', 'Architecture.md'),
    `# Architecture

> Part of [[Engineering]]

- Replace this with the real runtime architecture of the project.
- Note the main entry points, services, frameworks, and persistence model.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, '02_Engineering', 'Codebase-Map.md'),
    `# Codebase Map

> Part of [[Engineering]]

## Important Commands
${scriptList}

## Important Paths
- Replace this with the real directories and files that matter most.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, '03_Operations', 'Operations.md'),
    `# Operations

> Part of [[BRAIN-INDEX]]

This area tracks how to run the project, verify changes, and keep session continuity intact.

## Key Files
- [[Runbook]]
- [[Workflow]]
`
  )

  writeFileIfMissing(
    path.join(brainRoot, '03_Operations', 'Runbook.md'),
    `# Runbook

> Part of [[Operations]]

- Replace this with the real setup, run, test, and deploy commands for the project.
- Capture any environment prerequisites or local services.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, '03_Operations', 'Workflow.md'),
    `# Workflow

> Part of [[Operations]]

1. Read [[BRAIN-INDEX]], [[AGENTS]], [[Execution-Plan]], and the latest handoff.
2. Inspect the relevant area before editing code.
3. Make a narrow, testable change.
4. Update the brain files and create a new handoff before ending the session.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'Agents', 'Agents.md'),
    `# Agents

> Part of [[BRAIN-INDEX]]

Codex-specific operating notes live here.

## Key Files
- [[Project-Operator]]
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'Agents', 'Project-Operator.md'),
    `# Project Operator

> Part of [[Agents]]

## Purpose
Use this agent note for routine implementation work in Codex.

## Instructions
- Read the current brain state before coding.
- Prefer targeted edits and explicit verification.
- Keep decisions in the repository brain, not only in session memory.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'Assets', 'Assets.md'),
    `# Assets

> Part of [[BRAIN-INDEX]]

Store screenshots, diagrams, PDFs, and other external reference material here.
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'Templates', 'Templates.md'),
    `# Templates

> Part of [[BRAIN-INDEX]]

## Key Files
- [[Handoff-Template]]
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'Templates', 'Handoff-Template.md'),
    `# Handoff Template

> Part of [[Templates]]

## Session

## Summary

## Files Updated

## Verification

## Open Risks

## Recommended Next Step
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'Handoffs', 'Handoffs.md'),
    `# Handoffs

> Part of [[BRAIN-INDEX]]

## Session History
- [[handoff-000]] - Brain initialized
`
  )

  writeFileIfMissing(
    path.join(brainRoot, 'Handoffs', 'handoff-000.md'),
    `# handoff-000

> Part of [[Handoffs]]

## Session
${humanNow()}

## Summary
Initialized a Codex-first BrainTree brain for this existing project.

## Files Updated
- Added the BrainTree scaffold and registration metadata.

## Verification
- Brain files created
- Brain registered in ~/.braintree-os/brains.json

## Open Risks
- Placeholder notes still need to be replaced with project-specific content.

## Recommended Next Step
Inspect the real repository and replace the placeholder notes in [[Product]], [[Engineering]], and [[Operations]].
`
  )

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
    return null
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
    console.log('  Run `brain-tree-os init` inside an existing project to create one.')
    return
  }

  console.log(`  Registered brains (${config.brains.length}):`)
  for (const brain of config.brains) {
    console.log(`    ${brain.name} -> ${brain.path}`)
  }
}

function printResume(brainRoot: string) {
  const handoffDir = path.join(brainRoot, 'Handoffs')
  const latestHandoff = fs.existsSync(handoffDir)
    ? fs.readdirSync(handoffDir)
        .filter(file => /^handoff-.*\.md$/.test(file))
        .sort()
        .at(-1)
    : null

  console.log('')
  console.log('  Resume this brain by reading:')
  console.log(`  - ${path.join(brainRoot, 'BRAIN-INDEX.md')}`)
  console.log(`  - ${path.join(brainRoot, 'AGENTS.md')}`)
  console.log(`  - ${path.join(brainRoot, 'Execution-Plan.md')}`)
  if (latestHandoff) {
    console.log(`  - ${path.join(handoffDir, latestHandoff)}`)
  }
  console.log('')
  console.log('  Then inspect the relevant folder index before editing code.')
  console.log('')
}

function createWrapUp(brainRoot: string): string {
  const handoffDir = path.join(brainRoot, 'Handoffs')
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

> Part of [[Handoffs]]

## Session
${humanNow()}

## Summary

## Files Updated

## Verification

## Open Risks

## Recommended Next Step
`
  )

  const handoffsIndex = path.join(handoffDir, 'Handoffs.md')
  writeFileIfMissing(
    handoffsIndex,
    '# Handoffs\n\n> Part of [[BRAIN-INDEX]]\n\n## Session History\n'
  )

  updateFileIfExists(handoffsIndex, content => {
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
  fs.writeFileSync(
    SERVER_JSON,
    JSON.stringify({ port, pid: process.pid, startedAt: new Date().toISOString() }, null, 2) + '\n'
  )
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
  console.log(`  BrainTree OS v${VERSION}`)
  console.log('')
  console.log('  > Codex-first workflow enabled')
  console.log(`  > Server running at ${url}`)
  console.log('')
  console.log('  +-------------------------------------------------------------+')
  console.log('  |                                                             |')
  console.log('  |  To create a brain for an existing project:                 |')
  console.log('  |                                                             |')
  console.log('  |  1. Open that project in a terminal                         |')
  console.log('  |  2. Run: brain-tree-os init                                 |')
  console.log('  |  3. Open Codex in the project                               |')
  console.log('  |  4. Run: brain-tree-os resume                               |')
  console.log('  |                                                             |')
  console.log('  |  The brain will appear in the viewer automatically.         |')
  console.log('  +-------------------------------------------------------------+')
  console.log('')
  console.log('  Press Ctrl+C to stop the server.')
  console.log('')
}

function showHelp() {
  console.log(`
  brain-tree-os v${VERSION} - Codex-first brain viewer and workflow

  Usage:
    brain-tree-os                    Start the viewer
    brain-tree-os init              Create a BrainTree scaffold in the current project
    brain-tree-os resume            Show the files to read before working
    brain-tree-os wrap-up           Create the next handoff template
    brain-tree-os status            Show the current brain or all registered brains
    brain-tree-os help              Show this help

  Viewer options:
    --port <number>                 Custom port (default: 3000)
    --no-open                       Don't auto-open browser

  Init options:
    --name <text>                   Override the brain name
    --description <text>            Override the brain description
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
      console.log(`  Brain already exists at ${existingBrain}`)
      console.log('  Run `brain-tree-os resume` to continue working with it.')
      return
    }

    const brainRoot = process.cwd()
    const name = resolveProjectName(brainRoot, parseOption(args, '--name'))
    const description = resolveProjectDescription(brainRoot, parseOption(args, '--description'))
    const meta = createBrainScaffold(brainRoot, name, description)

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
      console.log('  Start `brain-tree-os` to open the viewer.')
    }
    console.log('  Next: run `brain-tree-os resume`, then open Codex in this project.')
    return
  }

  if (command === 'resume') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brain-tree-os init` inside an existing project to create one.')
      return
    }

    printResume(brainRoot)
    return
  }

  if (command === 'wrap-up') {
    const brainRoot = findBrainRoot(process.cwd())
    if (!brainRoot) {
      console.log('  No brain found in this directory tree.')
      console.log('  Run `brain-tree-os init` first.')
      return
    }

    const handoffPath = createWrapUp(brainRoot)
    console.log(`  Created handoff template: ${handoffPath}`)
    console.log('  Fill it in, then update Execution-Plan.md before ending the session.')
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
