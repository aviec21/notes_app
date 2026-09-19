import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { imageUrl } from '../../images'

export interface ImageAttributes {
  imageId: string
  alt: string
  /** Width as a percentage of the note's width. */
  width: 25 | 50 | 100
}

function ImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const { imageId, alt, width } = node.attrs as ImageAttributes
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setMissing(false)
    void imageUrl(imageId).then((found) => {
      if (cancelled) return
      if (found) setUrl(found)
      else setMissing(true)
    })
    return () => {
      cancelled = true
    }
  }, [imageId])

  return (
    <NodeViewWrapper
      as="figure"
      className="my-3"
      style={{ width: `${width}%`, outline: selected ? '2px solid var(--accent)' : undefined, borderRadius: 8 }}
      data-drag-handle
    >
      {url ? (
        <img src={url} alt={alt} className="h-auto w-full rounded-lg" draggable={false} />
      ) : (
        <div
          className="flex min-h-24 items-center justify-center rounded-lg p-4 text-center text-sm"
          style={{ background: 'var(--surface)', border: '1px dashed var(--border)', color: 'var(--muted)' }}
        >
          {missing ? 'Picture not downloaded yet — it appears once you are back online.' : 'Loading picture…'}
        </div>
      )}
      {/* Keeps the caption-free figure accessible for keyboard users choosing a size. */}
      <figcaption className="sr-only">{alt || 'Picture'}</figcaption>
      {selected && (
        <div className="mt-1 flex gap-1" contentEditable={false}>
          {([25, 50, 100] as const).map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => updateAttributes({ width: option })}
              aria-pressed={width === option}
              className="rounded px-2 py-1 text-xs"
              style={width === option ? { background: 'var(--accent)', color: 'var(--bg)' } : { border: '1px solid var(--border)' }}
            >
              {option}%
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  )
}

/**
 * A picture stored with the app (never a link to somebody else's site): the note keeps only
 * the picture's id, and the bytes live on this device and in your own database.
 */
export const NoteImage = Node.create({
  name: 'noteImage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      imageId: { default: '' },
      alt: { default: '' },
      width: {
        default: 100,
        parseHTML: (el) => Number(el.getAttribute('data-width')) || 100,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[data-image-id]', getAttrs: (el) => ({ imageId: (el as HTMLElement).getAttribute('data-image-id') }) }]
  },

  renderHTML({ HTMLAttributes }) {
    const { imageId, alt, width } = HTMLAttributes as unknown as ImageAttributes
    return ['img', mergeAttributes({ 'data-image-id': imageId, alt, 'data-width': String(width) })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
})
