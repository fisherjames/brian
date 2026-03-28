import { NextRequest, NextResponse } from 'next/server'
import { getBrain, scanBrainFiles, parseBrainLinks, getExecutionSteps, getHandoffs } from '@/lib/local-data'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ brainId: string }> }
) {
  const { brainId } = await params

  const brain = getBrain(brainId)
  if (!brain) {
    return NextResponse.json({ error: 'Brain not found' }, { status: 404 })
  }

  const brainPath = brain.path
  const files = scanBrainFiles(brainPath)
  const links = parseBrainLinks(brainPath, files)
  const executionSteps = getExecutionSteps(brainPath, files)
  const handoffs = getHandoffs(brainPath, files)

  return NextResponse.json({
    brain: { id: brainId, name: brain.name, description: brain.description },
    files,
    links,
    executionSteps,
    handoffs,
  })
}
