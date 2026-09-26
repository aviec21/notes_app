import { useOnline, usePendingCount, useSyncSnapshot } from '../hooks'

/** How things stand, as a colour: green = everything is on the server, yellow = working on it, red = a problem. */
export type SyncTone = 'synced' | 'working' | 'problem' | 'idle'

const TONE_COLOR: Record<SyncTone, string> = {
  synced: 'var(--status-ok)',
  working: 'var(--status-busy)',
  problem: 'var(--status-error)',
  idle: 'var(--muted)', // offline with nothing waiting: nothing is wrong, nothing is pending
}

/** A short, honest line about where your notes are: on this device, and/or on the server. */
export default function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { state, lastSyncedAt, refused } = useSyncSnapshot()
  const pending = usePendingCount()
  const online = useOnline()

  const offline = !online || state === 'offline'
  const waiting = pending === 1 ? '1 change waiting' : `${pending} changes waiting`
  const label = offline
    ? pending > 0
      ? `Offline · ${waiting}`
      : 'Offline · saved on this device'
    : state === 'syncing'
      ? 'Syncing…'
      : state === 'error'
        ? 'Sync problem · will retry'
        : pending > 0
          ? waiting
          : 'Synced'

  const tone: SyncTone =
    !offline && state === 'error'
      ? 'problem'
      : refused > 0
        ? 'problem'
        : !offline && state === 'syncing'
          ? 'working'
          : pending > 0
            ? 'working'
            : offline
              ? 'idle'
              : 'synced'

  const title = lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : undefined
  const notice =
    refused > 0 ? ` · ${refused === 1 ? '1 change was' : `${refused} changes were`} refused by the server` : ''

  const dot = (
    <span
      aria-hidden="true"
      data-sync-dot={tone}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tone === 'working' && !offline ? 'sync-dot-pulse' : ''}`}
      style={{ background: TONE_COLOR[tone] }}
    />
  )

  if (compact) {
    // Just the dot (the collapsed sidebar); the words are still there for screen readers.
    return (
      <span role="status" title={`${label}${title ? ` — ${title}` : ''}`} className="flex items-center justify-center p-1">
        {dot}
        <span className="sr-only">{label}</span>
      </span>
    )
  }

  return (
    <span role="status" title={title} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
      {dot}
      <span>
        {label}
        {notice && (
          <span style={{ color: 'var(--danger)' }} title="These changes are still on this device but could not be synced (for example, something was too large).">
            {notice}
          </span>
        )}
      </span>
    </span>
  )
}
