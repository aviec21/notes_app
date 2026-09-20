# Notes

A personal notes PWA: offline-first, syncs across devices, installable from Chrome.

**Stack:** React + TypeScript + Vite + Tailwind (PWA) · Vercel Functions (`/api`) · Neon Postgres · PIN sign-in.

## Tests

```
npm test               # fast unit and component tests (Vitest, simulated browser)
npm run typecheck:e2e  # type-check the browser tests
npm run test:e2e       # real browsers: Chrome, Firefox, Safari's engine, Android Chrome
```

The browser tests (`e2e/`) build the app and serve it with the same security headers as
production, then drive it in real browsers against a stand-in server (`e2e/fake-server.ts`)
that runs the app's actual sync rules. Several browser windows act as separate devices, so
offline editing, conflicts and cross-device sync are tested for real. They also measure
layout in pixels, scan every screen for accessibility problems (light and dark), and check
speed with thousands of notes. First time only: `npx playwright install chromium firefox webkit`.

Known limits of the test tools (not of the app), noted in the tests: Safari's engine cannot
read uploaded picture bytes or intercept requests once the offline helper runs, and Firefox's
"offline" switch blocks even pages served from the app's own cache.

## PIN

The PIN is stored as a salted hash in Neon (table `auth_pin`). It starts as `123456`;
change it in the app (Change PIN). After 5 wrong attempts sign-in locks for a minute,
doubling with each further failure. Changing the PIN signs out every other device.

**Recovery code (the backup password).** In Settings, "Create a recovery code" (asks for the
current PIN) shows a 16-character code once, e.g. `K7QM-2XPD-9HRT-4WNB` (~79 bits, no look-alike
characters). Only a salted scrypt hash is stored. On the sign-in screen, "Forgot your PIN?" takes
the code plus a new PIN, signs you in, signs out other devices, and issues a fresh code (each
code works once). Wrong guesses share the PIN lock-out. Migration 4 adds the columns.

**Lost both?** In the Neon SQL editor run `DELETE FROM auth_pin;` — the next request
recreates it with the default `123456` (and no recovery code; make a new one).

## Develop

```
npm install
npm run dev      # frontend only; /api is served by Vercel in production
npm run build    # type-check + production build
npm run lint
```

## Status

Phase 1 (setup): scaffold, PWA shell, theme tokens, `/api/health`.
