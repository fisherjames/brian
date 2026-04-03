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

  const title = `E2E approve initiative ${Date.now()}`
  const rejectedTitle = `E2E reject initiative ${Date.now()}`
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

  await page.getByPlaceholder('New initiative title').fill(rejectedTitle)
  await createInitiative.click()
  await expect(page.getByText(rejectedTitle).first()).toBeVisible({ timeout: 20_000 })

  const rejectedCard = page
    .locator('div.rounded.border.border-border\\/70.bg-\\[\\#FCFCFA\\].p-2.text-\\[12px\\]')
    .filter({ hasText: `Approve director proposal: ${rejectedTitle}` })
    .first()
  await expect(rejectedCard).toBeVisible({ timeout: 20_000 })
  page.once('dialog', (dialog) => dialog.accept('Need tighter rollback scope before approval.'))
  await rejectedCard.getByRole('button', { name: 'Reject' }).click()
  await expect.poll(() => calls.filter((method) => method === 'decision.resolve').length >= 2).toBeTruthy()

  const initiatives = await request.get(`/api/brains/${brian!.id}/initiatives`)
  expect(initiatives.ok()).toBeTruthy()
  const initiativesJson = await initiatives.json() as { initiatives?: Array<{ id: string; title: string; stage: string }> }
  const approveInitiative = (initiativesJson.initiatives ?? []).find((item) => item.title === title)
  const rejectInitiative = (initiativesJson.initiatives ?? []).find((item) => item.title === rejectedTitle)
  expect(approveInitiative).toBeTruthy()
  expect(rejectInitiative).toBeTruthy()
  expect(rejectInitiative?.stage).toBe('leadership_discussion')

  const discussions = await request.get(`/api/brains/${brian!.id}/discussions`)
  expect(discussions.ok()).toBeTruthy()
  const discussionsJson = await discussions.json() as {
    discussions?: Array<{ initiativeId?: string; layer?: string; status?: string }>
  }
  const reopenedDirectorDiscussion = (discussionsJson.discussions ?? []).find(
    (item) =>
      item.initiativeId === rejectInitiative?.id
      && item.layer === 'director'
      && item.status === 'open'
  )
  expect(reopenedDirectorDiscussion).toBeTruthy()
})
