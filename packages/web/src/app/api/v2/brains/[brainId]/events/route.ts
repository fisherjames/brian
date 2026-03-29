import { NextResponse } from 'next/server'
import { getBrain } from '@/lib/local-data'
import { readEvents } from '@/lib/v2/storage'

export async function GET(_req: Request, { params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params
  const brain = getBrain(brainId)
  if (!brain) return NextResponse.json({ error: 'brain_not_found' }, { status: 404 })
  const events = readEvents(brainId)
  return NextResponse.json({
    brainId,
    events: events.slice(-300),
  })
}
