/**
 * Chart colours. Each theme has its own steps (not an automatic flip); both sets pass the
 * colour-blindness, lightness and chroma checks against their own background. Series are
 * assigned in this fixed order and never cycled, so a colour always means the same series.
 */
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'] as const

export const MAX_SERIES = LIGHT.length

export interface ChartTheme {
  series: readonly string[]
  surface: string
  ink: string
  muted: string
  grid: string
}

export function chartTheme(dark: boolean): ChartTheme {
  return dark
    ? { series: DARK, surface: '#1c1c22', ink: '#ececf1', muted: '#9a9aa8', grid: 'rgba(255,255,255,0.10)' }
    : { series: LIGHT, surface: '#f6f6f9', ink: '#17171c', muted: '#6b6b78', grid: 'rgba(0,0,0,0.08)' }
}
