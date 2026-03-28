import { NextResponse } from 'next/server'
import { getExecutionSteps, listBrains, scanBrainFiles } from '@/lib/local-data'
import { buildDepartmentColorMap } from '@/components/brain/department-colors'

function countAgentNotes(files: Array<{ path: string }>) {
  return files.filter((f) => f.path === 'AGENTS.md' || f.path.startsWith('Agents/') || f.path.startsWith('brian/agents/')).length
}

export async function GET() {
  const userBrains = listBrains()

  // Enrich user brains
  const enriched = userBrains.map((brain) => {
    const files = scanBrainFiles(brain.path)
    const steps = getExecutionSteps(brain.path, files)
    const totalSteps = steps.length
    const completedSteps = steps.filter((s) => s.status === 'completed').length
    const inProgressSteps = steps.filter((s) => s.status === 'in_progress').length
    const blockedSteps = steps.filter((s) => s.status === 'blocked').length
    const completion = totalSteps > 0 ? completedSteps / totalSteps : 0
    const healthScore = Math.max(0, Math.min(100, Math.round(completion * 100 - blockedSteps * 12)))
    const folders = new Set(files.filter((f) => f.path.includes('/')).map((f) => f.path.split('/')[0]))
    const cMap = buildDepartmentColorMap(files)
    return {
      ...brain,
      fileCount: files.length,
      departmentCount: folders.size,
      agentCount: countAgentNotes(files),
      rootFolderColors: Array.from(folders).sort().map((f) => cMap.get(f) ?? '#64748B'),
      progress: {
        totalSteps,
        completedSteps,
        inProgressSteps,
        blockedSteps,
        healthScore,
      },
    }
  })

  return NextResponse.json({ userBrains: enriched })
}
