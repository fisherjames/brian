import { NextRequest, NextResponse } from 'next/server'
import { getBrain, readBrainFile, writeBrainFile } from '@/lib/local-data'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brainId: string }> }
) {
  const { brainId } = await params
  const filePath = request.nextUrl.searchParams.get('path')
  const optional = request.nextUrl.searchParams.get('optional') === '1'

  if (!filePath) {
    return new NextResponse('Missing path parameter', { status: 400 })
  }

  const brain = getBrain(brainId)
  if (!brain) {
    return new NextResponse('Brain not found', { status: 404 })
  }
  const brainPath = brain.path

  try {
    const content = readBrainFile(brainPath, filePath)
    return new NextResponse(content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    if (optional) {
      return new NextResponse('', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    const message = err instanceof Error ? err.message : 'Failed to read file'
    return new NextResponse(message, { status: 404 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ brainId: string }> }
) {
  const { brainId } = await params
  const brain = getBrain(brainId)
  if (!brain) return new NextResponse('Brain not found', { status: 404 })

  let body: { path?: string; content?: string }
  try {
    body = (await request.json()) as { path?: string; content?: string }
  } catch {
    return new NextResponse('Invalid JSON body', { status: 400 })
  }

  const filePath = typeof body.path === 'string' ? body.path.trim() : ''
  if (!filePath) return new NextResponse('Missing path', { status: 400 })
  if (typeof body.content !== 'string') return new NextResponse('Missing content', { status: 400 })

  try {
    writeBrainFile(brain.path, filePath, body.content)
    return NextResponse.json({ ok: true, path: filePath })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write file'
    return new NextResponse(message, { status: 400 })
  }
}
