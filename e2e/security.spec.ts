import { expect, test, writeNote, closeNote } from './fixtures'

test('every page comes with the security headers', async ({ page }) => {
  const response = await page.goto('/')
  const headers = response!.headers()
  const csp = headers['content-security-policy']
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("script-src 'self'") // no inline or outside scripts
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
  expect(csp).not.toContain('unsafe-eval')
  expect(csp).toContain("object-src 'none'")
  expect(csp).toContain("frame-ancestors 'none'") // cannot be shown inside another site
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('same-origin')
})

test('the policy really is enforced: an injected inline script is refused', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.goto('/')
  const outcome = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener('securitypolicyviolation', (e) => resolve(`blocked by ${e.violatedDirective}`))
        ;(window as unknown as { injected?: boolean }).injected = false
        const script = document.createElement('script')
        script.textContent = 'window.injected = true'
        document.head.appendChild(script)
        setTimeout(() => resolve(`ran: ${(window as unknown as { injected?: boolean }).injected}`), 500)
      }),
  )
  expect(outcome).toContain('blocked by script-src')
  await context.close()
})

test('the app works normally under the policy, with no violations or page errors', async ({ device }) => {
  const { page, problems } = await device()
  await writeNote(page, 'Under the policy', 'text')
  await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Insert' }).click()
  await page.getByRole('group', { name: 'Formatting options' }).getByRole('button', { name: /^Chart/ }).click()
  await expect(page.getByRole('textbox', { name: 'Note text' }).locator('canvas')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Insert' }).click()
  await page.getByRole('group', { name: 'Formatting options' }).getByRole('button', { name: /Emoji/ }).click()
  await expect(page.getByRole('searchbox', { name: 'Search emoji' })).toBeVisible()
  await closeNote(page)
  expect(problems).toEqual([])
})
