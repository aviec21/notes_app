import AxeBuilder from '@axe-core/playwright'
import type { Browser, Page } from '@playwright/test'
import type { FakeServer } from './fake-server'
import { expect, signIn, test } from './fixtures'

async function signedOutPage(browser: Browser, server: FakeServer, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({ colorScheme, serviceWorkers: 'block' })
  await server.attach(context)
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible()
  return { context, page }
}

async function openSettings(page: Page, phone: boolean) {
  if (phone) {
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('menuitem', { name: /Settings/ }).click()
  } else {
    await page.getByRole('navigation', { name: 'Library' }).getByRole('button', { name: /Settings/ }).click()
  }
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
}

async function fillReset(page: Page, code: string, pin: string, confirm = pin) {
  await page.getByRole('button', { name: 'Forgot your PIN?' }).click()
  await page.getByLabel('Recovery code').fill(code)
  await page.getByLabel('New PIN', { exact: true }).fill(pin)
  await page.getByLabel('Confirm new PIN').fill(confirm)
  await page.getByRole('button', { name: 'Reset PIN and sign in' }).click()
}

for (const theme of ['light', 'dark'] as const) {
  test(`forgot-PIN screens have no accessibility problems (${theme})`, async ({ browser, server }) => {
    const { context, page } = await signedOutPage(browser, server, theme)
    await page.getByRole('button', { name: 'Forgot your PIN?' }).click()
    await expect(page.getByLabel('Recovery code')).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0].html.slice(0, 100)}`)).toEqual([])
    await context.close()
  })
}

test('a saved recovery code resets a forgotten PIN, and is replaced by a fresh one', async ({ browser, server }) => {
  server.pin = '482913'
  const { context, page } = await signedOutPage(browser, server)

  await fillReset(page, 'abcd efgh jkmn pqrs', '246810') // typed sloppily: lower case, spaces
  await expect(page.getByText('Your PIN has been reset')).toBeVisible()
  const fresh = (await page.getByLabel('Your recovery code').textContent())!.trim()
  expect(fresh).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)
  expect(fresh).not.toBe('ABCD-EFGH-JKMN-PQRS')

  // The new code has to be confirmed as saved before moving on.
  const carryOn = page.getByRole('button', { name: 'Continue to my notes' })
  await expect(carryOn).toBeDisabled()
  await page.getByLabel('I have saved this code somewhere safe').check()
  await carryOn.click()
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeVisible()
  expect(server.pin).toBe('246810')

  // Sign out and back in with the new PIN; the old code no longer works (single use).
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }))
  await page.reload()
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible()
  await fillReset(page, 'ABCD-EFGH-JKMN-PQRS', '135790')
  await expect(page.getByRole('alert')).toContainText('not right')
  expect(server.pin).toBe('246810')
  await context.close()
})

test('the reset form says what is wrong before sending anything', async ({ browser, server }) => {
  const { context, page } = await signedOutPage(browser, server)
  await page.getByRole('button', { name: 'Forgot your PIN?' }).click()

  await page.getByLabel('Recovery code').fill('nope')
  await page.getByLabel('New PIN', { exact: true }).fill('246810')
  await page.getByLabel('Confirm new PIN').fill('246810')
  await page.getByRole('button', { name: 'Reset PIN and sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('does not look like a recovery code')

  await page.getByLabel('Recovery code').fill('ABCD-EFGH-JKMN-PQRS')
  await page.getByLabel('Confirm new PIN').fill('999999')
  await page.getByRole('button', { name: 'Reset PIN and sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('do not match')

  expect(server.log.filter((l) => l.includes('/api/auth/reset'))).toEqual([])
  await page.getByRole('button', { name: 'Back to sign in' }).click()
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible()
  await context.close()
})

test('with no recovery code yet, a banner offers to create one in Settings', async ({ browser, server }, testInfo) => {
  server.recoveryCode = null
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await server.attach(context)
  const page = await context.newPage()
  await signIn(page)
  const phone = testInfo.project.name === 'android'

  await expect(page.getByText('You have no recovery code yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Create recovery code' }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('button', { name: 'Create a recovery code' }).click()

  // The current PIN is asked for first.
  await dialog.getByLabel('Current PIN for recovery code').fill('000000')
  await dialog.getByRole('button', { name: 'Create code' }).click()
  await expect(dialog.getByRole('alert')).toContainText('not your current PIN')

  await dialog.getByLabel('Current PIN for recovery code').fill('123456')
  await dialog.getByRole('button', { name: 'Create code' }).click()
  const code = (await dialog.getByLabel('Your recovery code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)
  expect(server.recoveryCode).toBe(code)

  await dialog.getByLabel('I have saved this code somewhere safe').check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  // The banner is gone now that a code exists.
  await expect(page.getByText('You have no recovery code yet.')).toHaveCount(0)

  // Settings then offers to replace it instead.
  await openSettings(page, phone)
  await expect(page.getByRole('button', { name: 'Create a new recovery code' })).toBeVisible()
  await context.close()
})
