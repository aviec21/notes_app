import { useEditorState, type Editor } from '@tiptap/react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { FONT_SIZES, FONTS, HIGHLIGHTS, TEXT_COLORS } from './extensions'

type Menu = 'style' | 'font' | 'size' | 'color' | 'highlight'

const svg = (children: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
const ICONS = {
  undo: svg(<path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4" />),
  redo: svg(<path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h4" />),
  bullets: svg(<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />),
  numbers: svg(<path d="M10 6h11M10 12h11M10 18h11M4 4v4M3 18h3l-3 3h3M3.5 12.5 5 11v3" />),
  checklist: svg(<path d="m3 6 2 2 3-3M3 16l2 2 3-3M11 7h10M11 17h10" />),
  clear: svg(<path d="M4 7V5h11v2M9.5 5l-2 14M5 19h6M15 14l6 6M21 14l-6 6" />),
}

function Button({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      // Keep the focus (and the text selection) in the note while tapping the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md px-2 text-sm disabled:opacity-40"
      style={active ? { background: 'var(--accent)', color: 'var(--bg)' } : undefined}
    >
      {children}
    </button>
  )
}

const Divider = () => <span className="mx-1 h-6 w-px shrink-0" style={{ background: 'var(--border)' }} aria-hidden="true" />

function Option({ selected, onPick, children, style }: { selected: boolean; onPick: () => void; children: ReactNode; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      aria-pressed={selected}
      className="rounded-md px-3 py-2 text-left text-sm"
      style={{ border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, ...style }}
    >
      {children}
    </button>
  )
}

function Swatch({ color, label, selected, onPick }: { color: string | null; label: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs"
      style={{
        background: color ?? 'transparent',
        border: '1px solid var(--border)',
        boxShadow: selected ? '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)' : undefined,
      }}
    >
      {color === null ? '∅' : ''}
    </button>
  )
}

/**
 * Formatting controls for the note. `placement` says where the bar sits so its menus
 * open towards the page: below it on desktop, above it on a phone (bar at the bottom).
 */
export default function Toolbar({ editor, placement }: { editor: Editor; placement: 'top' | 'bottom' }) {
  const [menu, setMenu] = useState<Menu | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      subscript: e.isActive('subscript'),
      superscript: e.isActive('superscript'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      tasks: e.isActive('taskList'),
      heading: ([1, 2, 3] as const).find((level) => e.isActive('heading', { level })) ?? 0,
      font: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? null,
      size: (e.getAttributes('textStyle').fontSize as string | undefined) ?? null,
      color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      highlight: (e.getAttributes('highlight').color as string | undefined) ?? null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  // Close an open menu on a tap elsewhere, or on Escape (before Escape leaves the note).
  useEffect(() => {
    if (!menu) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setMenu(null)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

  const chain = () => editor.chain().focus()
  const toggleMenu = (name: Menu) => setMenu((current) => (current === name ? null : name))
  const pick = (run: () => void) => {
    run()
    setMenu(null)
  }

  const fontLabel = FONTS.find((f) => f.value === s.font)?.label ?? 'Font'
  const styleLabel = s.heading ? `Heading ${s.heading}` : 'Normal'

  const menuButton = (name: Menu, label: string, content: ReactNode, width = '') => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => toggleMenu(name)}
      aria-label={label}
      aria-expanded={menu === name}
      aria-haspopup="true"
      title={label}
      className={`flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-sm ${width}`}
      style={menu === name ? { background: 'var(--surface)' } : undefined}
    >
      {content}
      <span aria-hidden="true" className="text-xs" style={{ color: 'var(--muted)' }}>
        ▾
      </span>
    </button>
  )

  let panel: ReactNode = null
  if (menu === 'style') {
    panel = (
      <div className="flex flex-col gap-1.5">
        <Option selected={!s.heading} onPick={() => pick(() => chain().setParagraph().run())}>Normal text</Option>
        {([1, 2, 3] as const).map((level) => (
          <Option key={level} selected={s.heading === level} onPick={() => pick(() => chain().setHeading({ level }).run())} style={{ fontSize: `${1.5 - level * 0.15}rem`, fontWeight: 700 }}>
            Heading {level}
          </Option>
        ))}
      </div>
    )
  } else if (menu === 'font') {
    panel = (
      <div className="grid grid-cols-2 gap-1.5">
        {FONTS.map((font) => (
          <Option
            key={font.label}
            selected={s.font === font.value}
            onPick={() => pick(() => (font.value ? chain().setFontFamily(font.value).run() : chain().unsetFontFamily().run()))}
            style={font.value ? { fontFamily: font.value } : undefined}
          >
            {font.label}
          </Option>
        ))}
      </div>
    )
  } else if (menu === 'size') {
    panel = (
      <div className="flex flex-wrap gap-1.5">
        <Option selected={s.size === null} onPick={() => pick(() => chain().unsetFontSize().run())}>Default</Option>
        {FONT_SIZES.map((size) => (
          <Option key={size} selected={s.size === size} onPick={() => pick(() => chain().setFontSize(size).run())}>
            {parseInt(size)}
          </Option>
        ))}
      </div>
    )
  } else if (menu === 'color') {
    panel = (
      <div className="flex flex-wrap gap-2">
        {TEXT_COLORS.map((c) => (
          <Swatch
            key={c.label}
            color={c.value}
            label={`Text colour: ${c.label}`}
            selected={s.color === c.value}
            onPick={() => pick(() => (c.value ? chain().setColor(c.value).run() : chain().unsetColor().run()))}
          />
        ))}
      </div>
    )
  } else if (menu === 'highlight') {
    panel = (
      <div className="flex flex-wrap gap-2">
        {HIGHLIGHTS.map((h) => (
          <Swatch
            key={h.label}
            color={h.value}
            label={`Highlight: ${h.label}`}
            selected={s.highlight === h.value}
            onPick={() => pick(() => (h.value ? chain().setHighlight({ color: h.value }).run() : chain().unsetHighlight().run()))}
          />
        ))}
      </div>
    )
  }

  return (
    <div ref={wrapper} className="relative">
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 overflow-x-auto px-1 py-1 [scrollbar-width:thin]">
        <Button label="Undo" shortcut="Ctrl+Z" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
          {ICONS.undo}
        </Button>
        <Button label="Redo" shortcut="Ctrl+Y" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
          {ICONS.redo}
        </Button>
        <Divider />
        {menuButton('style', 'Text style', <span className="w-20 truncate text-left">{styleLabel}</span>)}
        {menuButton('font', 'Font', <span className="w-24 truncate text-left" style={s.font ? { fontFamily: s.font } : undefined}>{fontLabel}</span>)}
        {menuButton('size', 'Font size', <span className="w-6 text-left">{s.size ? parseInt(s.size) : '–'}</span>)}
        <Divider />
        <Button label="Bold" shortcut="Ctrl+B" active={s.bold} onClick={() => chain().toggleBold().run()}>
          <b>B</b>
        </Button>
        <Button label="Italic" shortcut="Ctrl+I" active={s.italic} onClick={() => chain().toggleItalic().run()}>
          <i className="font-serif">I</i>
        </Button>
        <Button label="Underline" shortcut="Ctrl+U" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
          <u>U</u>
        </Button>
        <Button label="Strikethrough" shortcut="Ctrl+Shift+S" active={s.strike} onClick={() => chain().toggleStrike().run()}>
          <s>S</s>
        </Button>
        <Button label="Subscript" shortcut="Ctrl+," active={s.subscript} onClick={() => chain().toggleSubscript().run()}>
          <span>
            x<sub>2</sub>
          </span>
        </Button>
        <Button label="Superscript" shortcut="Ctrl+." active={s.superscript} onClick={() => chain().toggleSuperscript().run()}>
          <span>
            x<sup>2</sup>
          </span>
        </Button>
        <Divider />
        {menuButton(
          'color',
          'Text colour',
          <span className="flex flex-col items-center leading-none">
            <span className="font-semibold">A</span>
            <span className="mt-0.5 h-1 w-4 rounded" style={{ background: s.color ?? 'var(--text)' }} />
          </span>,
        )}
        {menuButton(
          'highlight',
          'Highlight',
          <span className="rounded px-1 font-semibold" style={{ background: s.highlight ?? HIGHLIGHTS[1].value! }}>
            H
          </span>,
        )}
        <Divider />
        <Button label="Bulleted list" shortcut="Ctrl+Shift+8" active={s.bullets} onClick={() => chain().toggleBulletList().run()}>
          {ICONS.bullets}
        </Button>
        <Button label="Numbered list" shortcut="Ctrl+Shift+7" active={s.numbers} onClick={() => chain().toggleOrderedList().run()}>
          {ICONS.numbers}
        </Button>
        <Button label="Checklist" shortcut="Ctrl+Shift+9" active={s.tasks} onClick={() => chain().toggleTaskList().run()}>
          {ICONS.checklist}
        </Button>
        <Divider />
        <Button label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
          {ICONS.clear}
        </Button>
      </div>

      {panel && (
        <div
          role="menu"
          aria-label="Formatting options"
          className={`absolute left-1 z-30 max-h-72 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-3 shadow-xl ${placement === 'top' ? 'top-full mt-1' : 'bottom-full mb-1'}`}
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          {panel}
        </div>
      )}
    </div>
  )
}
