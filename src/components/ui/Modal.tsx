import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * A themed modal built on the native <dialog>: it traps focus, closes on Escape or a click
 * on the backdrop, and works the same in every current browser.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // a click on the dimmed backdrop
      }}
      aria-labelledby={titleId}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-2xl p-0 shadow-2xl backdrop:bg-black/50`}
      style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <h2 id={titleId} className="px-5 pt-5 text-lg font-semibold">
            {title}
          </h2>
          <div className="overflow-y-auto px-5 pt-3 pb-5">{children}</div>
        </div>
      )}
    </dialog>
  )
}

/** Shared button styles so every dialog looks the same. */
export const buttonStyles = {
  base: 'rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60',
  primary: { background: 'var(--accent)', color: 'var(--bg)' },
  danger: { background: 'var(--danger)', color: '#fff' },
  plain: { border: '1px solid var(--border)' },
}
