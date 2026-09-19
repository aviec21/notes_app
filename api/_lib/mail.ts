import { CODE_TTL_MINUTES } from '../../shared/config.js'

/** Sends the sign-in code through Resend's HTTP API. Throws if delivery fails. */
export async function sendCodeEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')

  // Without a verified domain, Resend only delivers to the account owner's own address,
  // which is exactly what a single-user app needs.
  const from = process.env.MAIL_FROM ?? 'Notes <onboarding@resend.dev>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Your Notes sign-in code: ${code}`,
      text: `Your Notes sign-in code is ${code}.\n\nIt expires in ${CODE_TTL_MINUTES} minutes and works once. If you didn't ask for it, ignore this email.`,
    }),
  })
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`)
}
