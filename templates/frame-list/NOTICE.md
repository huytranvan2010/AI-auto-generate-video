# Attribution — frame-list

**Original template** authored for this repo (AI Coding). Not vendored from
nexu-io/html-video.

## Design

A dark, glossy "impact / comparison list":

- Near-black canvas (#08080f) with a warm orange→red radial glow (top-left), a
  cool violet counter-glow, and a faint masked grid — built with layered CSS
  `radial-gradient`s (no images).
- A big title with a gradient accent word (orange→red) + a muted subtitle.
- A stack of rounded item cards, each: a coloured icon chip (emoji icon), a
  title + description, and a coloured right-hand tag. Colour is driven per item
  by `level` (`danger` red / `warn` amber / `good` green / `info` blue), with a
  glowing left accent bar.

Pure CSS `@keyframes` (header fades down, cards stagger up). Be Vietnam Pro
(Vietnamese-native). 16:9 = `index.html`, 9:16 = `compositions/portrait.html`.
- TechLetsGo: a space is inserted between `title` and `accent` when the caller omits it (previously rendered glued, e.g. "ởkhách").
- TechLetsGo: renamed from `frame-aicoding-list` to `frame-list` (neutral id); design unchanged.
