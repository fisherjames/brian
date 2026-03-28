export const dynamic = 'force-dynamic'

import { getExecutionSteps, listBrains, scanBrainFiles } from '@/lib/local-data'
import { buildDepartmentColorMap } from '@/components/brain/department-colors'
import BrainsPageClient from './brains-page-client'

interface BrainCardData {
  id: string
  name: string
  description: string
  fileCount: number
  departmentCount: number
  agentCount: number
  rootFolderColors: string[]
  progress: {
    totalSteps: number
    completedSteps: number
    inProgressSteps: number
    blockedSteps: number
    healthScore: number
  }
}

function countAgentNotes(files: Array<{ path: string }>) {
  return files.filter((f) => f.path === 'AGENTS.md' || f.path.startsWith('Agents/') || f.path.startsWith('brian/agents/')).length
}

function getBrainData(): { userBrains: BrainCardData[] } {
  const userBrains = listBrains().map((brain) => {
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
      id: brain.id,
      name: brain.name,
      description: brain.description,
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

  return { userBrains }
}

export default function BrainsPage() {
  const { userBrains } = getBrainData()

  return (
    <div className="bg-mesh grain min-h-screen">
      <nav className="animate-fade-up relative z-50 flex items-center justify-between px-6 py-3 lg:px-12 lg:py-5">
        <div className="flex items-center gap-2 lg:gap-3">
          <img src="/logo.svg" alt="Brian" className="h-8 lg:h-10" />
          <span className="text-[15px] font-semibold tracking-tight lg:text-[18px]">Brian</span>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-4 lg:px-12 lg:py-6">
        <div className="animate-fade-up animate-delay-1 mb-5">
          <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Brains</h1>
          <p className="mt-1 text-[14px] text-text-secondary">Explore project Brian workspaces or create your own.</p>
        </div>

        <BrainsPageClient initialUserBrains={userBrains} />
      </main>
    </div>
  )
}
