import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'

// Self-hosted fonts (Latin, regular + bold, and italic for the text faces), so they are
// cached with the app and work offline in every browser.
import '@fontsource/caveat/latin-400.css'
import '@fontsource/caveat/latin-700.css'
import '@fontsource/inter/latin-400-italic.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/lora/latin-400-italic.css'
import '@fontsource/lora/latin-400.css'
import '@fontsource/lora/latin-700.css'

export const noteExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true },
  }),
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  Highlight.configure({ multicolor: true }),
  Subscript,
  Superscript,
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: 'Start writing…' }),
]

/** `value` is the CSS font-family stack; null means "the app's default font". */
export const FONTS: { label: string; value: string | null }[] = [
  { label: 'Default', value: null },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Lora', value: 'Lora, serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Caveat', value: 'Caveat, cursive' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
]

export const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px']

// Mid-tone colours stay readable on both the light and the dark background.
export const TEXT_COLORS: { label: string; value: string | null }[] = [
  { label: 'Default', value: null },
  { label: 'Gray', value: '#868e96' },
  { label: 'Red', value: '#e03131' },
  { label: 'Orange', value: '#f76707' },
  { label: 'Yellow', value: '#e8a200' },
  { label: 'Green', value: '#2f9e44' },
  { label: 'Teal', value: '#0c8599' },
  { label: 'Blue', value: '#1c7ed6' },
  { label: 'Violet', value: '#7048e8' },
  { label: 'Pink', value: '#d6336c' },
]

// Translucent highlights let the text colour (light or dark) show through.
export const HIGHLIGHTS: { label: string; value: string | null }[] = [
  { label: 'None', value: null },
  { label: 'Yellow', value: 'rgba(250, 204, 21, 0.45)' },
  { label: 'Green', value: 'rgba(74, 222, 128, 0.4)' },
  { label: 'Blue', value: 'rgba(96, 165, 250, 0.4)' },
  { label: 'Pink', value: 'rgba(244, 114, 182, 0.4)' },
  { label: 'Orange', value: 'rgba(251, 146, 60, 0.45)' },
  { label: 'Purple', value: 'rgba(167, 139, 250, 0.4)' },
]
