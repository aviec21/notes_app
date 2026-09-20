import { useMemo, type ReactNode, type Ref } from 'react'
import {
  binItems,
  effectiveFolderId,
  folderNoteCounts,
  liveFolders,
  tagNoteCounts,
  type LibraryData,
  type View,
} from '../lib/library'
import { folderColorVar } from '../lib/folderColors'
import { repo } from '../sync/runtime'
import SearchBox from './SearchBox'
import SyncStatus from './SyncStatus'
import { useDialogs } from './ui/Dialogs'
import { FolderIcon, HelpIcon, KeyboardIcon, NoteIcon, PinIcon, PlusIcon, SettingsIcon, TagIcon, TrashIcon } from './ui/Icons'

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
  pinned,
  actions,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  count?: number
  pinned?: boolean
  actions?: ReactNode
}) {
  return (
    <div
      className="group flex items-center rounded-lg"
      style={active ? { background: 'var(--surface)', boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}
    >
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {pinned && (
          <span style={{ color: 'var(--accent)' }} aria-label="Pinned">
            <PinIcon size={13} />
          </span>
        )}
        {count !== undefined && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {count}
          </span>
        )}
      </button>
      {actions}
    </div>
  )
}

const heading = 'px-3 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase'

interface Props {
  data: LibraryData
  view: View
  query: string
  searchRef: Ref<HTMLInputElement>
  onNavigate: (view: View) => void
  onQuery: (query: string) => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onOpenGuide: () => void
}

/** Desktop side panel: search, folders, tags and the recycle bin. Scrolls on its own. */
export default function Sidebar({ data, view, query, searchRef, onNavigate, onQuery, onOpenSettings, onOpenShortcuts, onOpenGuide }: Props) {
  const dialogs = useDialogs()
  const searching = query.trim().length > 0

  const { folders, tags, folderCounts, tagCounts, looseCount, binCount } = useMemo(() => {
    const live = liveFolders(data)
    const liveIds = new Set(live.map((f) => f.id))
    const collator = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
    return {
      folders: [...live].sort((a, b) => collator(a.name, b.name)),
      tags: [...data.tags].sort((a, b) => collator(a.name, b.name)),
      folderCounts: folderNoteCounts(data),
      tagCounts: tagNoteCounts(data),
      looseCount: data.notes.filter((n) => n.deletedAt === null && effectiveFolderId(n, liveIds) === null).length,
      binCount: binItems(data).length, // the same top-level items the bin screen lists
    }
  }, [data])

  async function newFolder() {
    const name = await dialogs.prompt({ title: 'New folder', label: 'Folder name', confirmLabel: 'Create' })
    if (name) await repo.createFolder(name)
  }

  async function renameTag(id: string, current: string) {
    const name = await dialogs.prompt({ title: 'Rename tag', label: 'Tag name', initial: current })
    if (name) await repo.renameTag(id, name.replace(/^#/, ''))
  }

  async function deleteTag(id: string, name: string) {
    const ok = await dialogs.confirm({
      title: 'Delete tag?',
      message: `The tag #${name} will be removed from all notes. The notes themselves are not deleted.`,
      confirmLabel: 'Delete tag',
      danger: true,
    })
    if (!ok) return
    await repo.deleteTag(id)
    if (view.kind === 'tag' && view.id === id) onNavigate({ kind: 'root' })
  }

  const isView = (kind: View['kind'], id?: string) =>
    !searching && view.kind === kind && (id === undefined || ('id' in view && view.id === id))

  const smallButton = 'rounded p-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100'

  return (
    <nav aria-label="Library" className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <span className="text-lg font-semibold">Notes</span>
        <SyncStatus />
      </div>
      <SearchBox value={query} onChange={onQuery} inputRef={searchRef} showHint />

      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        <NavItem
          active={isView('root')}
          onClick={() => onNavigate({ kind: 'root' })}
          icon={<NoteIcon />}
          label="Notes"
          count={looseCount}
        />

        <div className="flex items-center justify-between pr-1">
          <h2 className={heading} style={{ color: 'var(--muted)' }}>
            Folders
          </h2>
          <button type="button" onClick={() => void newFolder()} aria-label="New folder" title="New folder (Shift+N)" className="rounded p-1.5">
            <PlusIcon />
          </button>
        </div>
        {folders.length === 0 && (
          <p className="px-3 py-1 text-xs" style={{ color: 'var(--muted)' }}>
            No folders yet
          </p>
        )}
        {folders.map((folder) => (
          <NavItem
            key={folder.id}
            active={isView('folder', folder.id)}
            onClick={() => onNavigate({ kind: 'folder', id: folder.id })}
            icon={<FolderIcon color={folderColorVar(folder.color)} />}
            label={folder.name}
            count={folderCounts.get(folder.id) ?? 0}
            pinned={folder.pinned}
          />
        ))}

        <h2 className={heading} style={{ color: 'var(--muted)' }}>
          Tags
        </h2>
        {tags.length === 0 && (
          <p className="px-3 py-1 text-xs" style={{ color: 'var(--muted)' }}>
            Tags you create appear here
          </p>
        )}
        {tags.map((tag) => (
          <NavItem
            key={tag.id}
            active={isView('tag', tag.id)}
            onClick={() => onNavigate({ kind: 'tag', id: tag.id })}
            icon={<TagIcon />}
            label={tag.name}
            count={tagCounts.get(tag.id) ?? 0}
            actions={
              <>
                <button type="button" onClick={() => void renameTag(tag.id, tag.name)} aria-label={`Rename tag ${tag.name}`} title="Rename" className={`${smallButton} text-xs`}>
                  Edit
                </button>
                <button type="button" onClick={() => void deleteTag(tag.id, tag.name)} aria-label={`Delete tag ${tag.name}`} title="Delete" className={`${smallButton} mr-1`} style={{ color: 'var(--danger)' }}>
                  <TrashIcon />
                </button>
              </>
            }
          />
        ))}
      </div>

      <div className="flex flex-col gap-1 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <NavItem
          active={isView('bin')}
          onClick={() => onNavigate({ kind: 'bin' })}
          icon={<TrashIcon />}
          label="Recycle bin"
          count={binCount}
        />
        <button type="button" onClick={onOpenSettings} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm">
          <SettingsIcon /> Settings
        </button>
        <button type="button" onClick={onOpenShortcuts} title="Keyboard shortcuts (?)" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm">
          <KeyboardIcon /> Keyboard shortcuts
        </button>
        <button type="button" onClick={onOpenGuide} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm">
          <HelpIcon /> How to use
        </button>
      </div>
    </nav>
  )
}
