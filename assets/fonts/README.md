# Local typography: Noto Serif + Noto Sans

## Font roles

- Noto Serif 600: hero heading and the short selection section title only.
- Noto Sans 400/500/600/700: body copy, forms, buttons, prices, explanations, contractor names and result states.

Hero size: 48–60 px on desktop, 32–38 px on mobile. Body: 16–18 px, line height 1.6. Supporting text remains at least 14 px. Prices use tabular numerals in the same font as the tenge sign.

## Local assets and licenses

NotoSerif-600.ttf: 38,868 bytes. Source: https://github.com/google/fonts/tree/main/ofl/notoserif. License: OFL-NotoSerif.txt.
NotoSans-400/500/600/700.ttf: about 39 KB per weight. Source: https://github.com/google/fonts/tree/main/ofl/notosans. License: OFL-NotoSans.txt.

Both families use SIL Open Font License 1.1. Font subsets were downloaded from Google Fonts and stored locally. No external font request is made by the website. Regenerate subsets if new writing systems are introduced. Serif 600 and Sans 400/600 are preloaded; font-display: swap keeps text visible while loading.

## Verification

The cmap tables of all five files contain ӘәҒғҚқҢңӨөҰұҮүҺһІі, digits and ₸. Chrome checks cover Kazakh, Russian and English at 320, 390, 1280 and 1366 px: all fonts loaded, intended font roles applied, no horizontal overflow or clipped text, correct responsive heading size, form begins within the desktop viewport, demo returns 3 cards.
