import { expect, test, writeNote } from './fixtures'

test('signs in, writes a note, and finds it again after a reload', async ({ device }) => {
  const { page, problems } = await device()

  await writeNote(page, 'Hello world', 'first words')
  await page.waitForTimeout(700) // autosave
  await page.reload()

  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeVisible()
  await expect(page.getByText('Hello world').first()).toBeVisible()
  expect(problems).toEqual([])
})
