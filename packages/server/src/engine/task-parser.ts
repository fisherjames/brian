import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface ParsedTask {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  line: number
}

export function parseExecutionPlan(brainRoot: string): ParsedTask[] {
  const planPath = path.join(brainRoot, 'brian', 'execution-plan.md')
  if (!fs.existsSync(planPath)) return []

  const content = fs.readFileSync(planPath, 'utf8')
  const lines = content.split('\n')
  const tasks: ParsedTask[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const todoMatch = line.match(/^- \[ \] (.+)$/)
    const doneMatch = line.match(/^- \[x\] (.+)$/)

    if (todoMatch) {
      tasks.push({
        id: crypto.createHash('sha256').update(todoMatch[1]).digest('hex').slice(0, 8),
        title: todoMatch[1],
        status: 'todo',
        line: i + 1,
      })
    } else if (doneMatch) {
      tasks.push({
        id: crypto.createHash('sha256').update(doneMatch[1]).digest('hex').slice(0, 8),
        title: doneMatch[1],
        status: 'done',
        line: i + 1,
      })
    }
  }

  return tasks
}

export function getNextTask(brainRoot: string): ParsedTask | null {
  const tasks = parseExecutionPlan(brainRoot)
  return tasks.find((t) => t.status === 'todo') ?? null
}

export function markTaskStatus(
  brainRoot: string,
  taskId: string,
  status: 'in_progress' | 'done',
) {
  const planPath = path.join(brainRoot, 'brian', 'execution-plan.md')
  if (!fs.existsSync(planPath)) return

  const content = fs.readFileSync(planPath, 'utf8')
  const tasks = parseExecutionPlan(brainRoot)
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return

  const lines = content.split('\n')
  const lineIdx = task.line - 1

  if (status === 'in_progress') {
    lines[lineIdx] = lines[lineIdx].replace('- [ ]', '- [~]')
  } else if (status === 'done') {
    lines[lineIdx] = lines[lineIdx].replace('- [ ]', '- [x]').replace('- [~]', '- [x]')
  }

  fs.writeFileSync(planPath, lines.join('\n'), 'utf8')
}
