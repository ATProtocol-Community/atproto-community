# atmosphere.community — Design Spec

Addendum to the main project spec. This documents the chosen visual direction ("Horizon") for implementation in Astro.

---

## Design direction: Horizon

Warm, people-forward, approachable. The design puts authors and community members front and center on every content card, leans into cloud/sky imagery as the atmospheric motif, and uses a clean card-based layout that works well on mobile.

### Reference mockup

See the refined Horizon mockup with cloud shapes generated alongside this document. The mockup shows the full homepage layout: nav, hero with cloud accents, blog post list, events grid, community pills, get-involved cards, and footer.

---

## Typography

**Primary (body, UI, navigation):** Plus Jakarta Sans
- Weights used: 400 (body), 500 (nav links, secondary labels), 600 (card titles, buttons, stats), 700 (logo, hero stat numbers)
- Available on Google Fonts: `family=Plus+Jakarta+Sans:wght@400;500;600;700`

**Display (page headings, section titles):** Crimson Pro
- A serif with character. Used for the hero h1 and section h2 headings.
- Weights used: 500, 600
- Available on Google Fonts: `family=Crimson+Pro:opsz,wght@6..72,500;6..72,600`

**Sizing scale:**
- Hero h1: 32–36px on desktop, 26–28px on mobile
- Section h2: 20–22px on desktop, 18px on mobile
- Post card title (h3): 15–16px on desktop, 13px on mobile
- Body text: 14–15px
- Meta/labels: 12px
- Tags, small labels: 10–11px

---

## Color palette

### Primary blues

| Token | Hex | Usage |
|-------|-----|-------|
| `--blue-900` | `#0c2d4a` | Darkest text on light backgrounds |
| `--blue-800` | `#1a3d5c` | Primary headings |
| `--blue-700` | `#2563a8` | Primary brand color, links, CTA backgrounds, logo |
| `--blue-600` | `#378add` | Secondary links, active states |
| `--blue-500` | `#4a90d9` | Accent blue, author avatars |
| `--blue-400` | `#5ba3e0` | Light accent, `@` symbol in logo |
| `--blue-300` | `#7ab8e8` | Hero gradient mid-tone |
| `--blue-200` | `#b5d4f4` | Cloud fills, subtle backgrounds |
| `--blue-100` | `#d8e8f5` | Borders, dividers |
| `--blue-50` | `#eef3fb` | Tag backgrounds, very light fills |

### Neutrals

| Token | Hex | Usage |
|-------|-----|-------|
| `--neutral-900` | `#1a2a3a` | Primary text (headings in content area) |
| `--neutral-800` | `#2a3a4a` | Body text |
| `--neutral-600` | `#5a7a8a` | Secondary body text |
| `--neutral-500` | `#7a8a9a` | Muted text, descriptions |
| `--neutral-400` | `#9aaaba` | Meta text, timestamps |
| `--neutral-200` | `#e8edf5` | Card borders, dividers |
| `--neutral-100` | `#f0f4f8` | Page background alternate |
| `--neutral-50` | `#fafbfe` | Page background |

### Accent colors (for community/category differentiation)

| Name | Hex | Usage |
|------|-----|-------|
| Teal | `#1d9e75` / `#5dcaa5` | IndieSky content, EU community dot |
| Purple | `#7f77dd` / `#afa9ec` | Community Fund content |
| Coral | `#d85a30` | NYC community dot, warm accent |
| Green | `#3b6d11` | Location badge text on `#f0f5ee` background |

### Semantic

| Name | Background | Text |
|------|-----------|------|
| Location badge | `#f0f5ee` | `#3b6d11` |
| Online badge | `#eef3fb` | `#2563a8` |
| Content tag | `#eef3fb` | `#2563a8` |

---

## Layout

### Page background
`#fafbfe` — a very slight blue-tinted off-white. Cards sit on `#ffffff` with `1px solid #e8edf5` borders.

### Content width
Max content width: 720px on the blog/about pages, 960px on the homepage. Centered with auto margins. 24px padding on mobile.

### Card system
All cards share:
- Background: `#ffffff`
- Border: `1px solid #e8edf5`
- Border radius: 12px
- Padding: 14–16px

### Grid breakpoints
- Mobile (< 640px): single column, full-width cards
- Tablet (640–960px): 2-column grid for events and highlights
- Desktop (> 960px): full layout, wider hero stats row

---

## Component specifications

### Navigation bar
- Background: `#ffffff`, bottom border `1px solid #e8edf5`
- Logo: small cloud icon (CSS-drawn, `#b5d4f4`) + `@atmosphere` in Plus Jakarta Sans 700, `@` in `#5ba3e0`, `atmosphere` in `#2563a8`
- Nav links: Plus Jakarta Sans 500, 12–13px, `#7a8a9a`, no underlines
- Sticky on scroll (optional for v1)

### Hero section
- Background: solid `#2563a8`
- Cloud shapes: CSS-only, built from overlapping elements with `border-radius: 50%` and pill shapes (`border-radius: [height]px`), filled with `rgba(255,255,255,0.10)`. 3–4 clouds at different sizes and positions, layered behind content. They create an organic sky feeling without requiring image assets.
- Headline: Crimson Pro 600, 28–36px, white
- Subhead: Plus Jakarta Sans 400, 13–14px, `rgba(255,255,255,0.75)`
- CTA button: white background, `#2563a8` text, 8px border-radius, 600 weight
- Secondary link: `rgba(255,255,255,0.85)`, no decoration
- Stats row: 3 stat blocks (number in 700 weight white, label in 9px uppercase `rgba(255,255,255,0.6)`)
- Stats are real numbers: subscriber count, regional groups count, ATProto network user count

### Blog post cards (list layout)
- Horizontal layout: author avatar (36x36, 10px border-radius, solid color or profile image) on the left, content on the right
- Title: Plus Jakarta Sans 600, 14–15px, `#1a2a3a`
- Excerpt: 12px, `#7a8a9a`, 2 lines max (line-clamp)
- Meta row: category tag pill (`#eef3fb` background, `#2563a8` text, 6px radius) + author name + date in `#9aaaba`
- Each card links to the full post on Offprint (`blog.atmosphere.community`)
- Author avatars: for v1, generate colored squares from author handle. Later, pull profile avatar from ATProto identity.

### Event cards (2-column grid)
- Date label: Plus Jakarta Sans 600, 11px, `#2563a8`
- Event name: 13px, 600 weight, `#1a2a3a`
- Description: 11px, `#7a8a9a`
- Location badge: pill shape, 9px, either green (`#f0f5ee` / `#3b6d11`) for in-person or blue (`#eef3fb` / `#2563a8`) for online

### Community pills
- Pill shape: `border-radius: 20px`, white background, `1px solid #e8edf5`
- Left element: 24px colored circle with 2–3 letter abbreviation in white, 700 weight, 9px
- Text: community name in 600 weight 12px + location in 9px `#9aaaba`
- Laid out in a horizontal row, wrapping on mobile

### Avatar stack (social proof)
- Row of 5–6 overlapping circular avatars (28px, 50% radius, 2px white border, -6px margin-left overlap)
- Followed by text: "Join 1,000+ people in the Atmosphere" in 12px `#7a8a9a`
- Placed below the events section

### Get involved / highlights (2-column grid)
- Standard card with h4 title (13px, 600), description (11px, `#7a8a9a`), and a link in `#2563a8` 500 weight
- 4 cards: Discourse forum, Community Fund, ATmosphereConf, GitHub

### Footer
- Background: `#ffffff`, top border `1px solid #e8edf5`
- Left: `atmosphere.community · Built on AT Protocol` in 11px `#9aaaba`
- Right: Subscribe button (small, `#2563a8` background, white text, 6px radius)

---

## Cloud motif details

Clouds are the recurring visual motif. They appear in three places:

1. **Hero background:** 3–4 decorative clouds at varying sizes and positions, built with CSS pseudo-elements. Each cloud is a horizontal pill (wide `border-radius`) with 1–2 circles (`border-radius: 50%`) overlapping on top to create the bumpy cumulus silhouette. Fill: `rgba(255,255,255,0.10)` — very subtle, layered.

2. **Logo mark:** A tiny cloud shape (18x10px) next to the text logo, using the same CSS construction at small scale. Fill: `#b5d4f4`.

3. **Optional: section dividers or page backgrounds.** Very faint cloud shapes could be placed as decorative elements between sections or on the About page, but keep them subtle — the hero is the primary canvas for this motif.

### CSS cloud construction pattern

Each cloud is built from a base pill shape + 1–2 `::before`/`::after` pseudo-element circles:

```css
.cloud {
  position: absolute;
  width: 140px;
  height: 48px;
  border-radius: 48px;          /* pill shape = base of cloud */
  background: rgba(255,255,255,0.10);
}
.cloud::before {
  content: '';
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;           /* big bump */
  background: rgba(255,255,255,0.10);
  top: -30px;                   /* rises above the pill */
  left: 30px;
}
.cloud::after {
  content: '';
  position: absolute;
  width: 44px;
  height: 44px;
  border-radius: 50%;           /* smaller bump */
  background: rgba(255,255,255,0.10);
  top: -22px;
  left: 70px;
}
```

Vary the sizes, positions, and number of bumps to create 3–4 distinct cloud shapes. Keep them positioned with `position: absolute` inside the hero's `overflow: hidden` container.

For an SVG approach (if preferred over CSS), the same shapes can be drawn as compound paths with arc commands, which gives more control over the silhouette and allows for easier reuse as decorative elements elsewhere.

---

## Accessibility

- All text meets WCAG AA contrast ratios against its background (the blue-on-white and white-on-blue combinations in this palette pass)
- Interactive elements (buttons, links, cards) have visible focus states
- Card links use semantic `<a>` wrapping the entire card, with `aria-label` including the post title
- Hero stats use semantic markup (not just visual formatting)
- Cloud decorations are `aria-hidden="true"`
- Images (author avatars) include `alt` text with the author's name
- Nav uses `<nav>` landmark with accessible link labels
- Event dates use `<time>` elements with `datetime` attributes

---

## Dark mode (future consideration)

The palette is designed light-first, but the color tokens are structured to support a dark mode later:
- Page background would shift to `#0d1b2a` or similar deep blue
- Cards would use `#1a2d3e` backgrounds with `rgba(255,255,255,0.08)` borders
- Text colors invert (white/light gray on dark)
- Hero could keep its blue background or go slightly darker
- Cloud fills would shift to `rgba(255,255,255,0.06)`
- Blog post avatar colors stay the same (they're mid-tone and work on both)

Implementing via CSS custom properties + `prefers-color-scheme` media query.
