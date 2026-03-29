import { NextResponse } from 'next/server'
import { getBrain } from '@/lib/local-data'
import { readV2ApiData } from '@/server/v2/mcp'

export async function GET(_req: Request, { params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params
  const brain = getBrain(brainId)
  if (!brain) return NextResponse.json({ error: 'brain_not_found' }, { status: 404 })
  const data = readV2ApiData(brainId)
  return NextResponse.json({ decisions: data.decisions })
}

