# Font files for the customer preview

The font picker renders each name IN ITS OWN FACE and shows a live preview of the
customer's text. The real typefaces are commercial, so they are not in this repo:
until a file is present, the preview falls back to a free near-equivalent (see
`styles` in `src/lib/print-fonts.ts`), which still shows script vs slab vs
handwritten — just not the exact letterforms.

Drop the real files here with EXACTLY these names and the preview becomes exact,
with no code change (each stack already lists the real family first):

| file | font |
|---|---|
| `SamanthaUprightPROW05.woff2` | Samantha Upright PRO W05 |
| `StyleScript.woff2` | Style Script (free — can also be served from Google) |
| `LavanderiaSturdy.woff2` | Lavanderia Sturdy |
| `AthenaOfTheOcean.woff2` | Athena of the Ocean |
| `Amarillo.woff2` | Amarillo |
| `Sunshine.woff2` | Sunshine |
| `WhiteDream.woff2` | White Dream |
| `Gabriola.woff2` | Gabriola |
| `Clarendon.woff2` | Clarendon |
| `BabyValentina.woff2` | Baby Valentina |

`.woff2` loads fastest and is what every current browser takes. If you only have
`.ttf`/`.otf`, convert first — do not rename the extension.

Then add one `@font-face` per file (already wired in `src/app/globals.css` under
"print fonts" — uncomment as files arrive), e.g.

```css
@font-face {
  font-family: "Clarendon";
  src: url("/fonts/Clarendon.woff2") format("woff2");
  font-display: swap;
}
```

**Licensing is on us, not on the code.** Most of these are commercial faces and a
normal desktop licence does not cover web embedding. Either buy the webfont
licence for each, or leave the file out — the fallback keeps the picker usable
and the order still records the real font name for production.
