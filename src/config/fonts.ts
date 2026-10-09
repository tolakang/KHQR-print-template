/**
 * Fonts offered for the merchant name. All are SIL OFL, served from /fonts/
 * (licences in public/fonts/licenses/) and loaded only when chosen. A user
 * font (.ttf / .otf) can be added per script; it gets the id CUSTOM_FONT[script].
 */
export type FontScript = 'latin' | 'khmer'

export interface FontChoice { id: string; label: string; file: string }

export const NAME_FONTS: Record<FontScript, FontChoice[]> = {
  latin: [
    { id: 'nunito-sans-800', label: 'Nunito Sans ExtraBold (guide)', file: 'fonts/NunitoSans-ExtraBold.ttf' },
    { id: 'inter-800', label: 'Inter ExtraBold', file: 'fonts/Inter_800ExtraBold.ttf' },
    { id: 'montserrat-800', label: 'Montserrat ExtraBold', file: 'fonts/Montserrat_800ExtraBold.ttf' },
    { id: 'poppins-700', label: 'Poppins Bold', file: 'fonts/Poppins_700Bold.ttf' },
    { id: 'roboto-700', label: 'Roboto Bold', file: 'fonts/Roboto_700Bold.ttf' },
  ],
  khmer: [
    { id: 'nokora-600', label: 'Nokora SemiBold (guide)', file: 'fonts/Nokora-SemiBold.ttf' },
    { id: 'kantumruy-pro-700', label: 'Kantumruy Pro Bold', file: 'fonts/KantumruyPro_700Bold.ttf' },
    { id: 'noto-sans-khmer-700', label: 'Noto Sans Khmer Bold', file: 'fonts/NotoSansKhmer_700Bold.ttf' },
    { id: 'battambang-700', label: 'Battambang Bold', file: 'fonts/Battambang_700Bold.ttf' },
    { id: 'hanuman-700', label: 'Hanuman Bold', file: 'fonts/Hanuman_700Bold.ttf' },
    { id: 'moul-400', label: 'Moul (display)', file: 'fonts/Moul_400Regular.ttf' },
  ],
}

export const DEFAULT_NAME_FONT: Record<FontScript, string> = { latin: 'nunito-sans-800', khmer: 'nokora-600' }
export const CUSTOM_FONT: Record<FontScript, string> = { latin: 'custom-latin', khmer: 'custom-khmer' }

/** A character every font for the script must have. */
export const SCRIPT_PROBE: Record<FontScript, number> = { latin: 0x41, khmer: 0x1780 }

export const fontChoice = (script: FontScript, id: string) => NAME_FONTS[script].find((f) => f.id === id)
