import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getBrain, scanBrainFiles } from '@/lib/local-data'
import { isExecutionPlanFile } from '@/lib/execution-plan-parser'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ brainId: string }> }
) {
  const { brainId } = await params
  const body = await request.json()
  const { stepId, status, taskIndex, taskDone, appendTaskText } = body as {
    stepId: string
    status?: string
    taskIndex?: number
    taskDone?: boolean
    appendTaskText?: string
  }

  if (!stepId) {
    return NextResponse.json({ error: 'Missing stepId' }, { status: 400 })
  }

  const wantsStatusUpdate = typeof status === 'string' && status.trim().length > 0
  const wantsTaskToggle = Number.isInteger(taskIndex) && typeof taskDone === 'boolean'
  const wantsTaskAppend = typeof appendTaskText === 'string' && appendTaskText.trim().length > 0

  if (!wantsStatusUpdate && !wantsTaskToggle && !wantsTaskAppend) {
    return NextResponse.json({ error: 'No valid update payload provided' }, { status: 400 })
  }

  const brain = getBrain(brainId)
  if (!brain) {
    return NextResponse.json({ error: 'Brain not found' }, { status: 404 })
  }
  const brainPath = brain.path

  const isTeamStep = stepId.startsWith('team-step-')

  // Find the target plan file
  const files = scanBrainFiles(brainPath)
  const execFile = isTeamStep
    ? files.find((f) => f.path === 'brian/commands/team-board.md')
    : files.find((f) => isExecutionPlanFile(f.path))
  if (!execFile) {
    return NextResponse.json({ error: isTeamStep ? 'No team board found' : 'No execution plan found' }, { status: 404 })
  }

  const fullPath = path.join(brainPath, execFile.path)
  try {
    let content = fs.readFileSync(fullPath, 'utf8')

    // Parse step index from stepId suffix (format: "step-...-N")
    const stepIndexMatch = stepId.match(/-(\d+)$/)
    const stepIndex = stepIndexMatch ? parseInt(stepIndexMatch[1], 10) : NaN
    if (isNaN(stepIndex)) {
      return NextResponse.json({ error: 'Invalid stepId' }, { status: 400 })
    }

    const statusMap: Record<string, string> = {
      completed: 'COMPLETED',
      in_progress: 'IN PROGRESS',
      not_started: 'NOT STARTED',
      blocked: 'BLOCKED',
    }

    const newStatusText = wantsStatusUpdate ? (statusMap[status ?? ''] ?? (status ?? '').toUpperCase()) : null

    const lines = content.split('\n')
    let stepCount = -1
    let updated = false

    function findTaskLineIndices(startLine: number): number[] {
      const indices: number[] = []
      for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i]
        if (/^###\s+/.test(line)) break
        if (/^\s*-\s+\[( |x)\]\s+/i.test(line)) {
          indices.push(i)
        }
      }
      return indices
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!isTeamStep && wantsStatusUpdate && line.trim().startsWith('|') && !line.trim().match(/^\|[\s\-|]+\|$/) && !/step/i.test(line)) {
        const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
        if (cells.length >= 2 && /^\d/.test(cells[0])) {
          stepCount++
          if (stepCount === stepIndex) {
            const statusCellIdx = cells.length - 1
            cells[statusCellIdx] = (newStatusText as string).toLowerCase().replace(/\s+/g, '_')
            lines[i] = '| ' + cells.join(' | ') + ' |'
            updated = true
            break
          }
        }
      }

      const statusMatch = line.match(/^(\s*-\s+\*\*Status\*\*:\s*)(.+)/i)
      if (statusMatch) {
        stepCount++
        if (stepCount === stepIndex) {
          if (wantsStatusUpdate && newStatusText) {
            lines[i] = statusMatch[1] + newStatusText
            updated = true
          }

          if (wantsTaskToggle) {
            const taskLines = findTaskLineIndices(i)
            const taskLineIdx = taskLines[taskIndex as number]
            if (taskLineIdx !== undefined) {
              lines[taskLineIdx] = lines[taskLineIdx].replace(
                /^(\s*-\s+\[)( |x)(\]\s+)/i,
                `$1${taskDone ? 'x' : ' '}$3`
              )
              updated = true
            }
          }

          if (wantsTaskAppend) {
            const nextSectionIdx = lines.slice(i + 1).findIndex((l) => /^###\s+/.test(l))
            const insertAt = nextSectionIdx === -1 ? lines.length : i + 1 + nextSectionIdx
            const taskText = appendTaskText?.trim()
            lines.splice(insertAt, 0, `- [ ] ${taskText}`)
            updated = true
          }

          break
        }
      }
    }

    if (!updated) {
      return NextResponse.json({ error: 'Target step/task not found' }, { status: 404 })
    }

    content = lines.join('\n')
    fs.writeFileSync(fullPath, content, 'utf8')

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update step'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
