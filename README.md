# Notes

A personal notes PWA: offline-first, syncs across devices, installable from Chrome.

**Stack:** React + TypeScript + Vite + Tailwind (PWA) · Vercel Functions (`/api`) · Neon Postgres · emailed one-time-code sign-in (Resend).

## Develop

```
npm install
npm run dev      # frontend only; /api is served by Vercel in production
npm run build    # type-check + production build
npm run lint
```

## Status

Phase 1 (setup): scaffold, PWA shell, theme tokens, `/api/health`.
