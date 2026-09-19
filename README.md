# Notes

A personal notes PWA: offline-first, syncs across devices, installable from Chrome.

**Stack:** React + TypeScript + Vite + Tailwind (PWA) · Vercel Functions (`/api`) · Neon Postgres · PIN sign-in.

## PIN

The PIN is stored as a salted hash in Neon (table `auth_pin`). It starts as `123456`;
change it in the app (Change PIN). After 5 wrong attempts sign-in locks for a minute,
doubling with each further failure. Changing the PIN signs out every other device.

**Forgot the PIN?** In the Neon SQL editor run `DELETE FROM auth_pin;` — the next request
recreates it with the default `123456`.

## Develop

```
npm install
npm run dev      # frontend only; /api is served by Vercel in production
npm run build    # type-check + production build
npm run lint
```

## Status

Phase 1 (setup): scaffold, PWA shell, theme tokens, `/api/health`.
