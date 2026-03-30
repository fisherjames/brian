import { test, expect } from '@playwright/test'

test('UI actions emit expected MCP calls and persist initiative artifacts', async ({ page, request }) => {
  const brains = await request.get('/api/brains')
  expect(brains.ok()).toBeTruthy()
  const brainsJson = await brains.json() as { userBrains?: Array<{ id: string; name: string; path?: string }> }
  const brian = (brainsJson.userBrains ?? []).find((item) => item.path?.includes('/GitHub/brian'))
    ?? (brainsJson.userBrains ?? []).find((item) => item.name.toLowerCase().includes('brian'))
  expect(brian).toBeTruthy()

  const calls: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framesent', (event) => {
      try {
        const payload = JSON.parse(String(event.payload)) as { type?: string; method?: string; channel?: string }
        if (payload.type === 'mcp.call' && payload.channel === 'team' && typeof payload.method === 'string') {
          calls.push(payload.method)
        }
      } catch {
        // ignore non-json frames
      }
    })
  })

  const title = `E2E initiative ${Date.now()}`
  await page.goto(`/brains/${brian!.id}?tab=mission`, { waitUntil: 'domcontentloaded' })

  await page.getByPlaceholder('New initiative title').fill(title)
  const createInitiative = page.getByRole('button', { name: 'Create Initiative' })
  await expect(createInitiative).toBeEnabled({ timeout: 30_000 })
  await createInitiative.click()

  await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => calls.includes('company.intent.capture')).toBeTruthy()
  await expect.poll(() => calls.includes('initiative.propose')).toBeTruthy()
  await expect.poll(() => calls.includes('decision.record')).toBeTruthy()

  const acceptButton = page.getByRole('button', { name: 'Accept' }).first()
  await expect(acceptButton).toBeVisible({ timeout: 20_000 })
  await acceptButton.click()
  await expect.poll(() => calls.includes('decision.resolve')).toBeTruthy()
  await expect.poll(() => calls.includes('initiative.shape')).toBeTruthy()

  await page.getByRole('button', { name: 'Mission Control' }).click()
  const startLoop = page.getByRole('button', { name: 'Start Discussion Loop' })
  await expect(startLoop).toBeEnabled({ timeout: 30_000 })
  if (await startLoop.isEnabled()) {
    await startLoop.click()
    await expect.poll(() => calls.includes('team.observer_start')).toBeTruthy()
  }

  const generateHandoff = page.getByRole('button', { name: 'Generate Handoff' })
  await expect(generateHandoff).toBeEnabled({ timeout: 30_000 })
  await generateHandoff.click()
  await expect.poll(() => calls.includes('team.generate_handoff')).toBeTruthy()

  const initiatives = await request.get(`/api/brains/${brian!.id}/initiatives`)
  expect(initiatives.ok()).toBeTruthy()
  const initiativesJson = await initiatives.json() as { initiatives?: Array<{ title: string }> }
  expect((initiativesJson.initiatives ?? []).some((item) => item.title === title)).toBeTruthy()

  await expect(page.getByText('No handoffs yet.')).toHaveCount(0, { timeout: 20_000 })
})
