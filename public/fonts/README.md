# Fonts the customer can choose

The font picker shows each name **in its own face** and renders the customer's own
text live, so they can compare before ordering. The ORDER records the real font
name — production is unaffected by anything here.

## What the customer sees, and why

The ten faces we cut with are commercial: a desktop licence (the one you need to
cut with them) does **not** include the right to embed them in a website, and some
sellers forbid web embedding outright. So the preview renders each choice in the
closest free typeface instead. The customer sees the *style* faithfully; the
operator cuts with the real font.

| font we cut with | shown in the preview as |
|---|---|
| Samantha Upright PRO W05 | Great Vibes |
| **Style Script** | Style Script — this one IS the real font (free, open licence) |
| Lavanderia Sturdy | Yellowtail |
| Athena of the Ocean | Alex Brush |
| Amarillo | Allura |
| Sunshine | Courgette |
| White Dream | Parisienne |
| Gabriola | Cormorant Garamond |
| Clarendon | Besley (an actual Clarendon revival) |
| Baby Valentina | Kaushan Script |

The list lives in `src/lib/print-fonts.ts` and is mirrored in the admin backend
(`skyalxpaberin-admin`), which validates the customer's choice against the same
names; all three copies are pinned by tests.

## Making one preview exact (optional)

If you buy the web licence for a face, or you would rather not use a stand-in for
it, drop the file here with exactly the name in the `file` field of that font in
`src/lib/print-fonts.ts` (e.g. `Clarendon.woff2`) and uncomment its `@font-face`
rule in `src/app/globals.css` — the real family is already first in that font's
CSS stack, so it wins automatically with no other change.

`.woff2` loads fastest. If you only have `.ttf`/`.otf`, convert first — do not
just rename it. Prefer webfont-licensed files only: these are the same faces that
appear on a public website.
