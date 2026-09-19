import { useOnline, usePendingCount, useSyncSnapshot } from '../hooks'

/** A short, honest line about where your notes are: on this device, and/or on the server. */
export default function SyncStatus() {
  const { state, lastSyncedAt } = useSyncSnapshot()
  const pending = usePendingCount()
  const online = useOnline()

  const waiting = pending === 1 ? '1 change waiting' : `${pending} changes waiting`
  const label =
    !online || state === 'offline'
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

  const title = lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : undefined

  return (
    <span role="status" title={title} className="text-xs" style={{ color: 'var(--muted)' }}>
      {label}
    </span>
  )
}
