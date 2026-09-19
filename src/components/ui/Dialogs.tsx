import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { buttonStyles, Modal } from './Modal'

interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button as destructive and puts focus on Cancel. */
  danger?: boolean
}

interface PromptOptions {
  title: string
  label: string
  initial?: string
  confirmLabel?: string
}

interface Dialogs {
  /** Themed replacement for window.confirm. Resolves true if confirmed. */
  confirm(options: ConfirmOptions): Promise<boolean>
  /** Themed replacement for window.prompt. Resolves null if cancelled. */
  prompt(options: PromptOptions): Promise<string | null>
}

type Active =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }

const DialogsContext = createContext<Dialogs | null>(null)

export function useDialogs(): Dialogs {
  const dialogs = useContext(DialogsContext)
  if (!dialogs) throw new Error('useDialogs must be used inside <DialogProvider>')
  return dialogs
}

function cancel(active: Active | null) {
  if (active?.kind === 'confirm') active.resolve(false)
  else active?.resolve(null)
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState<Active | null>(null)
  const activeRef = useRef<Active | null>(null)

  const setActive = useCallback((next: Active | null) => {
    activeRef.current = next
    setActiveState(next)
  }, [])

  const dialogs = useMemo<Dialogs>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          cancel(activeRef.current) // never leave an earlier question unanswered
          setActive({ kind: 'confirm', options, resolve })
        }),
      prompt: (options) =>
        new Promise<string | null>((resolve) => {
          cancel(activeRef.current)
          setActive({ kind: 'prompt', options, resolve })
        }),
    }),
    [setActive],
  )

  const dismiss = () => {
    cancel(activeRef.current)
    setActive(null)
  }

  return (
    <DialogsContext.Provider value={dialogs}>
      {children}
      <Modal open={active !== null} onClose={dismiss} title={active?.options.title ?? ''}>
        {active?.kind === 'confirm' && (
          <ConfirmBody
            options={active.options}
            onAnswer={(value) => {
              active.resolve(value)
              setActive(null)
            }}
          />
        )}
        {active?.kind === 'prompt' && (
          <PromptBody
            options={active.options}
            onAnswer={(value) => {
              active.resolve(value)
              setActive(null)
            }}
          />
        )}
      </Modal>
    </DialogsContext.Provider>
  )
}

function ConfirmBody({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (value: boolean) => void }) {
  const { danger } = options
  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        {options.message}
      </div>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          autoFocus={danger}
          onClick={() => onAnswer(false)}
          className={buttonStyles.base}
          style={buttonStyles.plain}
        >
          {options.cancelLabel ?? 'Cancel'}
        </button>
        <button
          type="button"
          autoFocus={!danger}
          onClick={() => onAnswer(true)}
          className={buttonStyles.base}
          style={danger ? buttonStyles.danger : buttonStyles.primary}
        >
          {options.confirmLabel ?? 'OK'}
        </button>
      </div>
    </div>
  )
}

function PromptBody({ options, onAnswer }: { options: PromptOptions; onAnswer: (value: string | null) => void }) {
  const [value, setValue] = useState(options.initial ?? '')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (value.trim()) onAnswer(value.trim())
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">
        <span style={{ color: 'var(--muted)' }}>{options.label}</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={200}
          className="rounded-lg px-3 py-2 text-base outline-none focus:ring-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        />
      </label>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => onAnswer(null)} className={buttonStyles.base} style={buttonStyles.plain}>
          Cancel
        </button>
        <button type="submit" disabled={!value.trim()} className={buttonStyles.base} style={buttonStyles.primary}>
          {options.confirmLabel ?? 'Save'}
        </button>
      </div>
    </form>
  )
}
