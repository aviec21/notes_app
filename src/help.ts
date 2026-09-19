/** The in-app guide. `keywords` are extra words people might search for. */
export interface HelpTopic {
  id: string
  section: string
  title: string
  body: string
  keywords?: string
}

export const HELP_TOPICS: HelpTopic[] = [
  // --- Notes --------------------------------------------------------------------------
  {
    id: 'new-note',
    section: 'Notes',
    title: 'Create a note',
    body: 'Tap the + button (phone) or “+ Note” in the toolbar (desktop), or press N. Inside a folder, the note is created in that folder; on a tag page, it gets that tag. A note left completely empty is discarded when you leave it.',
    keywords: 'add new write file',
  },
  {
    id: 'autosave',
    section: 'Notes',
    title: 'Saving',
    body: 'Everything saves automatically on this device as you type, even offline. There is no save button; Ctrl+S just saves immediately.',
    keywords: 'save lost autosave',
  },
  {
    id: 'rename',
    section: 'Notes',
    title: 'Rename a note or folder',
    body: 'Select exactly one note or folder and choose Rename (or press F2 on desktop). You can also edit a note’s title directly at the top of the note, and rename an open folder with the Rename button in its toolbar.',
    keywords: 'title name change',
  },
  {
    id: 'pin',
    section: 'Notes',
    title: 'Pin notes and folders',
    body: 'Select items and choose Pin (or press P), or use the Pin button inside a note. Pinned items appear in the Pinned section at the top of Notes. Choose Unpin to remove them.',
    keywords: 'favourite favorite top star',
  },
  {
    id: 'select',
    section: 'Notes',
    title: 'Select several items at once',
    body: 'Desktop: tick the checkbox on each item, Ctrl+click items, or press Ctrl+A to select everything shown. Phone: touch and hold a note or folder, or tap Select, then tap more items. A bar appears with Rename, Move, Tag, Pin and Delete.',
    keywords: 'multiple bulk checkbox long press hold multi',
  },
  {
    id: 'layout',
    section: 'Notes',
    title: 'List or grid view',
    body: 'Use the list / grid switch in the toolbar (or press G). Your choice is remembered on this device.',
    keywords: 'cards tiles layout view mode',
  },
  {
    id: 'editor-mode',
    section: 'Notes',
    title: 'Editor mode (desktop)',
    body: 'Turn on editor mode with the split-panel button in the toolbar (or press E). Clicking a note then opens it in a panel on the right while the list stays visible, so you can jump between notes quickly. Press Esc inside the note or use Close to hide the panel. Phones always open notes full screen.',
    keywords: 'split panel side preview right pane',
  },

  // --- Organising ---------------------------------------------------------------------
  {
    id: 'folders',
    section: 'Organising',
    title: 'Folders',
    body: 'Create a folder with “+ Folder” in the toolbar or the + next to Folders in the sidebar (Shift+N). Open a folder to see its notes. The main Notes view shows your folders plus the notes that are not in any folder.',
    keywords: 'directory group create new folder',
  },
  {
    id: 'move',
    section: 'Organising',
    title: 'Move notes into a folder',
    body: 'Select notes and choose Move (or press M), then pick a folder, “No folder”, or create a new one. Inside a note you can also change its folder from the Folder menu at the top.',
    keywords: 'transfer put file into',
  },
  {
    id: 'tags',
    section: 'Organising',
    title: 'Tags',
    body: 'Inside a note, type in “+ Add tag” and press Enter. To tag several notes, select them and choose Tag (or press T). A note can have many tags, and tags work across folders. Open a tag from the sidebar (desktop) or the chip row under search (phone) to see its notes, and rename or delete the tag there. Deleting a tag never deletes notes.',
    keywords: 'label hashtag category',
  },
  {
    id: 'search',
    section: 'Organising',
    title: 'Search',
    body: 'Type in the search box (press / or Ctrl+K on desktop). It looks through every note’s title and text, tag names and folder names, in every folder. Capital letters don’t matter and part of a word is enough: “mee” finds “Meeting”. Search works offline. Items in the recycle bin are not searched.',
    keywords: 'find look filter keyword',
  },

  // --- Recycle bin --------------------------------------------------------------------
  {
    id: 'delete',
    section: 'Recycle bin',
    title: 'Delete notes and folders',
    body: 'Select items and choose Delete (or press Delete), or use Delete inside a note or folder. Items go to the recycle bin, not away for good. Deleting a folder also moves the notes inside it, and they come back together.',
    keywords: 'remove trash bin',
  },
  {
    id: 'restore',
    section: 'Recycle bin',
    title: 'Restore from the recycle bin',
    body: 'Open the recycle bin, select items and choose Restore (or press R). A restored folder brings back the notes deleted with it. A note whose folder is still deleted comes back outside any folder.',
    keywords: 'undo undelete recover bring back',
  },
  {
    id: 'empty-bin',
    section: 'Recycle bin',
    title: 'Delete forever and empty the bin',
    body: 'In the recycle bin, select items and choose “Delete forever”, or use “Empty bin” to clear everything. This cannot be undone. Items are also deleted automatically 30 days after they were moved to the bin; each one shows how many days it has left.',
    keywords: 'permanent purge 30 days clear',
  },

  // --- Formatting ---------------------------------------------------------------------
  {
    id: 'text-style',
    section: 'Formatting',
    title: 'Bold, italic, underline, strikethrough',
    body: 'Select text and use B, I, U or S in the formatting bar, or press Ctrl+B, Ctrl+I, Ctrl+U or Ctrl+Shift+S.',
    keywords: 'format emphasis strike',
  },
  {
    id: 'sub-super',
    section: 'Formatting',
    title: 'Subscript and superscript',
    body: 'Select text and use x₂ or x² in the formatting bar (Ctrl+, and Ctrl+.). Good for H₂O or x².',
    keywords: 'sub super script small raised lowered',
  },
  {
    id: 'fonts',
    section: 'Formatting',
    title: 'Font and size',
    body: 'Select text and open the Font or Size menu in the formatting bar. Default returns to the app’s normal font or size. Inter, Lora, JetBrains Mono and Caveat are built in, so they also work offline.',
    keywords: 'typeface font family size bigger smaller',
  },
  {
    id: 'colors',
    section: 'Formatting',
    title: 'Text colour and highlight',
    body: 'Select text and open the A (text colour) or H (highlight) menu. The colours are chosen to stay readable in both light and dark theme; ∅ removes the colour.',
    keywords: 'color colour highlight marker background',
  },
  {
    id: 'headings',
    section: 'Formatting',
    title: 'Headings',
    body: 'Open the text style menu (it shows “Normal”) and pick Heading 1, 2 or 3 for the current paragraph.',
    keywords: 'title heading h1 h2 h3 section',
  },
  {
    id: 'lists',
    section: 'Formatting',
    title: 'Bulleted and numbered lists',
    body: 'Use the list buttons in the formatting bar (Ctrl+Shift+8 / Ctrl+Shift+7), or start a line with “- ” or “1. ”. To turn existing lines into bullets, select them and tap the bullet button. Tab indents an item, Shift+Tab moves it back.',
    keywords: 'bullet points numbers list selected text',
  },
  {
    id: 'checklist',
    section: 'Formatting',
    title: 'Checklists',
    body: 'Use the checklist button (Ctrl+Shift+9), or start a line with “[ ] ”. Tick a box to cross the item out.',
    keywords: 'checkbox todo task tick',
  },
  {
    id: 'clear-format',
    section: 'Formatting',
    title: 'Undo, redo and clear formatting',
    body: 'Use the arrows at the start of the formatting bar (Ctrl+Z / Ctrl+Y). The last button removes all formatting from the selected text.',
    keywords: 'undo redo reset plain',
  },

  // --- Sync & devices -----------------------------------------------------------------
  {
    id: 'offline',
    section: 'Sync & devices',
    title: 'Working offline',
    body: 'Everything works without internet: create, edit, search, move and delete. Changes wait on this device (“Offline · N changes waiting”) and sync automatically when you are back online.',
    keywords: 'no internet connection airplane flight',
  },
  {
    id: 'sync-status',
    section: 'Sync & devices',
    title: 'What the sync status means',
    body: '“Synced”: everything is on the server. “N changes waiting”: saved here, not sent yet. “Syncing…”: sending now. “Sync problem · will retry”: the server could not be reached properly; nothing is lost and it retries on its own.',
    keywords: 'synced syncing waiting status indicator',
  },
  {
    id: 'conflicts',
    section: 'Sync & devices',
    title: 'Conflict copies',
    body: 'If the same note’s text is changed on two devices while they are apart, both versions are kept: the one that synced first stays, the other appears as “Title (conflict copy)”. Copy what you need and delete the copy.',
    keywords: 'duplicate copy two versions',
  },
  {
    id: 'install',
    section: 'Sync & devices',
    title: 'Install the app on your phone',
    body: 'Open the site in Chrome on Android, tap ⋮ and choose “Install app” (or “Add to Home screen”). It then opens full screen from your home screen and works offline.',
    keywords: 'pwa home screen download android',
  },

  // --- Settings -----------------------------------------------------------------------
  {
    id: 'theme',
    section: 'Settings',
    title: 'Light and dark theme',
    body: 'Open Settings and choose System, Light or Dark. System follows your device’s setting.',
    keywords: 'dark mode night appearance',
  },
  {
    id: 'pin-change',
    section: 'Settings',
    title: 'Change your PIN',
    body: 'Open Settings, enter your current PIN and the new one twice (6–12 digits). Your other devices are signed out and need the new PIN.',
    keywords: 'password security login code',
  },
  {
    id: 'pin-forgot',
    section: 'Settings',
    title: 'Forgot your PIN',
    body: 'In the Neon SQL editor run: DELETE FROM auth_pin;  The PIN then resets to 123456; change it straight away.',
    keywords: 'reset recover locked out',
  },
  {
    id: 'sidebar',
    section: 'Settings',
    title: 'Resize the sidebar (desktop)',
    body: 'Drag the thin line on the right edge of the sidebar. Double-click it to reset. With the line focused, the arrow keys also resize it.',
    keywords: 'width panel wider narrower',
  },
  {
    id: 'shortcuts',
    section: 'Settings',
    title: 'Keyboard shortcuts',
    body: 'Press ? on desktop, or open “Keyboard shortcuts” next to Settings, for the full list.',
    keywords: 'keys hotkeys',
  },
]

/** Case-insensitive, partial-word search; every word typed must appear somewhere. */
export function searchHelp<T>(items: T[], query: string, text: (item: T) => string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return items
  return items.filter((item) => {
    const haystack = text(item).toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}
