import { card, closeNote, expect, openNote, syncNow, test, waitSynced, warmUpEditor, writeNote } from './fixtures'

test('a note written on one device shows up on the other', async ({ device, server }) => {
  const a = await device()
  const b = await device()

  await writeNote(a.page, 'Shared idea', 'from device A')
  await closeNote(a.page)
  await waitSynced(a.page)

  await syncNow(b.page)
  await expect(card(b.page, 'Shared idea')).toBeVisible()
  expect((await server.notes()).map((n) => n.title)).toEqual(['Shared idea'])
})

test('working with no connection: changes wait on the device and arrive when it returns', async ({ device, server }) => {
  const a = await device()
  await warmUpEditor(a.page)
  await a.context.setOffline(true)

  await writeNote(a.page, 'Written offline', 'on the train')
  await closeNote(a.page)
  await syncNow(a.page)

  await expect(a.page.getByRole('status').filter({ hasText: /Offline/ }).first()).toContainText('waiting')
  expect((await server.notes()).map((n) => n.title)).not.toContain('Written offline') // not on the server yet
  await expect(card(a.page, 'Written offline')).toBeVisible() // but it is safe and visible here

  await a.context.setOffline(false)
  await syncNow(a.page)
  await waitSynced(a.page)
  expect((await server.notes()).map((n) => n.title)).toContain('Written offline')
})

test('edits made offline on two devices are both kept as a conflict copy', async ({ device, server }) => {
  await server.addNote('Plan', 'start')
  const a = await device()
  const b = await device()
  await expect(card(a.page, 'Plan')).toBeVisible()
  await expect(card(b.page, 'Plan')).toBeVisible()
  for (const d of [a, b]) {
    await openNote(d.page, 'Plan') // loads the editor while online
    await closeNote(d.page)
  }

  await a.context.setOffline(true)
  await b.context.setOffline(true)

  await openNote(a.page, 'Plan')
  await a.page.keyboard.type(' plus edit from A')
  await closeNote(a.page)

  await openNote(b.page, 'Plan')
  await b.page.keyboard.type(' plus edit from B')
  await closeNote(b.page)

  await a.context.setOffline(false)
  await syncNow(a.page)
  await waitSynced(a.page) // A reaches the server first
  await b.context.setOffline(false)
  await syncNow(b.page)
  await waitSynced(b.page)
  await syncNow(a.page)
  await waitSynced(a.page)

  // Both texts survive, on both devices.
  for (const d of [a, b]) {
    await expect(card(d.page, 'Plan (conflict copy)')).toBeVisible()
    await expect(card(d.page, 'Plan (conflict copy)')).toContainText('edit from B')
    await expect(d.page.locator('[data-card]', { hasText: /^Plan(?! \()/ }).first()).toContainText('edit from A')
  }
  const titles = (await server.notes()).map((n) => n.title).sort()
  expect(titles).toEqual(['Plan', 'Plan (conflict copy)'])
})

test('a server error is reported, retried, and nothing is lost', async ({ device, server }) => {
  const a = await device()
  server.failNext = 4
  await writeNote(a.page, 'Survives errors', 'body')
  await closeNote(a.page)
  await syncNow(a.page)
  await expect(a.page.getByRole('status').filter({ hasText: /Sync problem/ }).first()).toBeVisible()
  expect(await server.notes()).toHaveLength(0)
  await expect(card(a.page, 'Survives errors')).toBeVisible()

  server.failNext = 0
  await syncNow(a.page)
  await waitSynced(a.page)
  expect((await server.notes()).map((n) => n.title)).toEqual(['Survives errors'])
})

test('deleting on one device moves it to the bin on the other, and restoring brings it back', async ({ device }, testInfo) => {
  const phone = testInfo.project.name === 'android'
  const a = await device()
  const b = await device()
  await writeNote(a.page, 'Temporary', 'x')
  await closeNote(a.page)
  await waitSynced(a.page)
  await syncNow(b.page)
  await expect(card(b.page, 'Temporary')).toBeVisible()

  const select = async (page: typeof a.page, title: string) => {
    if (phone) await page.getByRole('button', { name: 'Select' }).click()
    await page.getByRole('checkbox', { name: `Select ${title}` }).check()
  }

  // Delete on A.
  await select(a.page, 'Temporary')
  await a.page.getByRole('button', { name: 'Delete', exact: true }).click()
  await a.page.getByRole('dialog').getByRole('button', { name: 'Move to bin' }).click()
  await waitSynced(a.page)

  // It disappears from B's notes and shows up in B's recycle bin.
  await syncNow(b.page)
  await expect(card(b.page, 'Temporary')).toHaveCount(0)
  await b.page.getByRole('button', { name: /Recycle bin/ }).click()
  await expect(card(b.page, 'Temporary')).toBeVisible()
  await expect(card(b.page, 'Temporary')).toContainText('days left')

  // Restore on B; A gets it back.
  await select(b.page, 'Temporary')
  await b.page.getByRole('button', { name: 'Restore' }).click()
  await waitSynced(b.page)
  await syncNow(a.page)
  await expect(card(a.page, 'Temporary')).toBeVisible()
})

test('if the editor cannot be downloaded the app stays usable, with a message', async ({ device }) => {
  const a = await device()
  // Simulate the editor's code failing to arrive (a dropped connection on first use).
  await a.context.route(/NoteEditor-.*\.js/, (route) => route.abort())
  const isPhone = await a.page.evaluate(() => matchMedia('(max-width: 767px)').matches)
  if (isPhone) await a.page.getByRole('button', { name: 'New note' }).click()
  else await a.page.getByRole('button', { name: /^Note$/ }).click()

  const alert = a.page.getByRole('alert').filter({ hasText: 'The editor could not be opened' })
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('Your notes are safe on this device')

  await alert.getByRole('button', { name: 'Back to notes' }).click()
  await expect(a.page.getByRole('searchbox', { name: 'Search notes' })).toBeVisible() // the app is still there
})

test.describe('offline app (service worker)', () => {
  test('the installed app opens and works with no connection at all', async ({ device, browserName }, testInfo) => {
    test.skip(browserName === 'webkit', "Safari's test engine cannot intercept requests once the offline helper runs")
    test.skip(
      browserName === 'firefox',
      "Firefox's test-tool offline switch blocks pages even when served from the app's own cache (real Firefox does not); verified in Chrome instead",
    )
    const a = await device({ serviceWorker: true })
    await writeNote(a.page, 'Before going offline', 'body')
    await closeNote(a.page)
    await waitSynced(a.page)

    // Wait until the offline helper is in control, then cut the connection and reload.
    await a.page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await a.page.reload()
    await a.page.evaluate(() => navigator.serviceWorker.ready)
    await a.context.setOffline(true)
    await a.page.reload()

    await expect(card(a.page, 'Before going offline')).toBeVisible() // the app shell and the notes are still there
    await writeNote(a.page, 'Made in airplane mode', 'still works')
    await closeNote(a.page)
    await expect(card(a.page, 'Made in airplane mode')).toBeVisible()
    testInfo.annotations.push({ type: 'note', description: 'reloaded offline and kept working' })
  })
})
