# Changelog

What changed in each version, in plain language. Newest first. Every version is also a git
tag (`v1.1.0` …), so any of them can be looked at or restored:

```
git checkout v1.0.0        # look at an older version
git log v1.0.0..v1.1.0     # the commits between two versions
```

## v1.1.1 — 2026-09-27 · Renamed to Memos

The app is now called **Memos**: the name under the icon on a phone's home screen
(`vite.config.ts`, `index.html`), the browser tab, the headers, the sign-in screen and the
recovery-code file (`memos-recovery-code.txt`). Lists still say "Notes" (they list notes), and
the internal on-device database keeps its old name, `notes-app`, on purpose: renaming it would
make the app open with no notes. An already-installed phone app may show the old name until it
refreshes (Android) or is re-added (iPhone).

## v1.1.0 — 2026-09-27 · Usability pass

Commit `d036b12` (plus this changelog). It bundles many small improvements; this list says
which files each one lives in, since they share files and were committed together.

**Faster to open**
- A device that was already signed in now opens straight onto its notes; the server check
  runs in the background, and the sign-in screen appears only if the session has ended.
  (`src/auth.ts`)
- The note editor (the largest download) is fetched quietly in the background once the list
  is up, so the first note opens without waiting. (`src/components/NotesApp.tsx`)

**Notes list**
- **⋯ menu** on every note and folder: Open, Rename, Move, Tags, Colour, Pin, Copy, Export,
  Delete; Restore / Delete forever in the bin. (`src/components/ui/PopoverMenu.tsx`,
  `ItemCard.tsx`, `Library.tsx`)
- **Card size**: small, average or big, remembered per device. (`src/lib/cardSize.ts`)
- **Tag colours**, shown as a dot on chips, in the sidebar, the phone chip row and the note
  header. Same palette as folder colours; no server change needed. (`src/db/repo.ts`,
  `PickerDialogs.tsx`)
- On a computer the list is kept to half the width in list view. (`Library.tsx`)

**Inside a note**
- Words searched for stay highlighted when the note is opened, with a find bar
  ("1 of 3", next / previous). Ctrl+F or the magnifier button opens it too. The highlight is
  display-only and never saved. (`src/editor/searchHighlight.ts`, `FindBar.tsx`)
- Ticking a checklist box no longer focuses the editor. That was throwing the screen to the
  end of the list and raising the phone keyboard. (`src/editor/nodes/ChecklistItem.ts`)
- The cursor line and the end of a selection are kept clear of the keyboard, the toolbar and
  the header; dragging a selection with the mouse to the top or bottom edge scrolls the note.
  (`src/editor/viewport.ts`)

**Sidebar and layout (computer)**
- Sidebar collapses to a strip of icons (`[` key); Folders and Tags fold with arrows.
  (`Sidebar.tsx`)
- Draggable divider between the list and the open note; Settings › Note width for
  full-screen notes. (`src/sidebarWidth.ts`, `src/lib/noteWidth.ts`)
- Clicking the empty part of the list closes the open note, saving it first. (`NotesApp.tsx`)

**Sync**
- The sync status has a coloured dot: green synced, yellow syncing or waiting (pulses while
  working), red problem, grey offline with nothing waiting. (`SyncStatus.tsx`)

**Behind the scenes**
- `src/prefs.ts`: one small store for per-device choices, so every screen stays in step.
- New unit tests and real-browser tests (`e2e/usability.spec.ts`, `e2e/checklist.spec.ts`);
  the in-app "How to use" guide covers all of the above.
- Known: the Firefox "folder colours (dark theme)" browser test fails in this environment
  (Firefox does not switch to dark); it fails the same way on v1.0.0.

## v1.0.0 — 2026-09-20 · Feature-complete before the usability pass

Commit `e7cc02b`. Everything built in phases 1–8 and the follow-ups:

- **Phase 1–2** — Vite + React PWA scaffold, theme, health check; sign-in (first Google, then
  emailed codes, finally a **PIN** with lock-out).
- **Phase 3** — on-device storage that works offline, with sync to the server, conflict copies
  and a sync status.
- **Phase 4** — folders, tags, pin, recycle bin (30 days), sidebar, multi-select, list / grid,
  keyboard shortcuts, themed dialogs.
- **Phase 5** — rich-text editor (fonts, sizes, colours, lists, checklists), editor-mode side
  panel, touch-and-hold select, searchable help and shortcuts.
- **Phase 6–7** — tables, pictures, charts, emoji; Markdown export; copy as formatted /
  Markdown / plain text.
- **Later** — fixed-size cards, export of selected notes, stable selection bar, phone
  selection menu.
- **Phase 8** — real-browser test suite, paged long lists, security headers, accessibility
  fixes, storage protection, error boundaries.
- **Then** — PIN recovery code, search-result highlighting in the list, folder colours.
