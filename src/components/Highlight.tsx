const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Shows `text` with every occurrence of `query` marked, ignoring capitals (search is
 * case-insensitive and matches part of a word). With no query it is just the text.
 */
export default function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim()
  if (!needle) return <>{text}</>
  // Splitting on a capturing pattern puts every match at an odd position.
  const parts = text.split(new RegExp(`(${escapeRegex(needle)})`, 'gi'))
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="search-hit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}
