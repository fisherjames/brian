import { NextRequest, NextResponse } from 'next/server'
import { listCodexSkills, readCodexSkill, writeCodexSkill } from '@/lib/local-data'

export async function GET(request: NextRequest) {
  const skillName = request.nextUrl.searchParams.get('name')?.trim() ?? ''
  if (!skillName) {
    return NextResponse.json({ skills: listCodexSkills() })
  }
  try {
    const content = readCodexSkill(skillName)
    return new NextResponse(content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read skill'
    return new NextResponse(message, { status: 404 })
  }
}

export async function PATCH(request: NextRequest) {
  let body: { name?: string; content?: string }
  try {
    body = (await request.json()) as { name?: string; content?: string }
  } catch {
    return new NextResponse('Invalid JSON body', { status: 400 })
  }
  const skillName = typeof body.name === 'string' ? body.name.trim() : ''
  if (!skillName) return new NextResponse('Missing skill name', { status: 400 })
  if (typeof body.content !== 'string') return new NextResponse('Missing content', { status: 400 })

  try {
    writeCodexSkill(skillName, body.content)
    return NextResponse.json({ ok: true, name: skillName })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write skill'
    return new NextResponse(message, { status: 400 })
  }
}
