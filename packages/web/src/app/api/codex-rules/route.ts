import { NextRequest, NextResponse } from 'next/server'
import { readCodexRules, writeCodexRules } from '@/lib/local-data'

export async function GET() {
  try {
    const content = readCodexRules()
    const required = ['default.rules']
    const hasDefault = content.trim().length > 0
    return NextResponse.json({
      content,
      requiredRules: required,
      missing: hasDefault ? [] : required,
      ok: hasDefault,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read rules'
    return new NextResponse(message, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  let body: { content?: string }
  try {
    body = (await request.json()) as { content?: string }
  } catch {
    return new NextResponse('Invalid JSON body', { status: 400 })
  }

  if (typeof body.content !== 'string') return new NextResponse('Missing content', { status: 400 })
  try {
    writeCodexRules(body.content)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write rules'
    return new NextResponse(message, { status: 400 })
  }
}

