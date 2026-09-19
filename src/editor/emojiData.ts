import compact from 'emojibase-data/en/compact.json'

export interface CompactEmoji {
  unicode: string
  label: string
  group?: number
  order?: number
  tags?: string[]
}

/**
 * The emoji list, in its own module so it is fetched only when the picker is first opened
 * (and then cached with the app for offline use).
 */
export const EMOJI = compact as CompactEmoji[]
