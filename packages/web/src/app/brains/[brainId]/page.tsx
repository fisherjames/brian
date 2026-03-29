import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBrain, scanBrainFiles, parseBrainLinks, getExecutionSteps, getHandoffs } from '@/lib/local-data'
import { BrainLayout } from '@/components/brain/brain-layout'

async function getBrainData(brainId: string) {
  const brain = getBrain(brainId)
  if (!brain) return null

  const brainPath = brain.path
  const files = scanBrainFiles(brainPath)
  const links = parseBrainLinks(brainPath, files)
  const executionSteps = getExecutionSteps(brainPath, files)
  const handoffs = getHandoffs(brainPath, files)

  return {
    brain: { id: brainId, name: brain.name, description: brain.description },
    files,
    links,
    executionSteps,
    handoffs,
  }
}

export default async function BrainPage({
  params,
}: {
  params: Promise<{ brainId: string }>
}) {
  const { brainId } = await params
  const data = await getBrainData(brainId)

  if (!data) notFound()

  const { brain, files, links, executionSteps, handoffs } = data

  return (
    <div className="bg-mesh grain flex h-full flex-col overflow-hidden">
      <nav className="relative z-50 flex shrink-0 items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 lg:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <img src="/logo.svg" alt="Brian" className="h-6 sm:h-7" />
          </Link>
          <span className="text-text-muted">/</span>
          <Link href="/brains" className="hidden text-[13px] text-text-secondary transition-colors hover:text-text sm:inline">Brains</Link>
          <span className="hidden text-text-muted sm:inline">/</span>
          <span className="truncate text-[13px] font-medium">{brain.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/brains/${brainId}?tab=mission`} className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-text/5">
            Open CEO Mission
          </Link>
        </div>
      </nav>

      <BrainLayout
        brainId={brainId}
        files={files}
        links={links}
        executionSteps={executionSteps}
        handoffs={handoffs}
        brainName={brain.name}
        brainDescription={brain.description ?? ''}
      />
    </div>
  )
}
