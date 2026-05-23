# atmosphere.community

The community hub for the [AT Protocol](https://atproto.com/) ecosystem. Aggregates blog posts from [Offprint](https://blog.atmosphere.community), upcoming events from [Smoke Signal](https://smokesignal.events) and community accounts, and links to regional AT Protocol communities and apps.

Built with [Astro](https://astro.build/) and deployed to GitHub Pages.

## Getting started

```sh
npm install
npm run dev
```

The dev server starts at `localhost:4321`. The site fetches live data from ATProto at build time (blog posts, events), so you'll need internet access for a full build.

### Commands

| Command           | Action                                     |
| :---------------- | :----------------------------------------- |
| `npm install`     | Install dependencies                       |
| `npm run dev`     | Start local dev server at `localhost:4321` |
| `npm run build`   | Build production site to `./dist/`         |
| `npm run preview` | Preview the build locally before deploying |

### Deployment

The site deploys to GitHub Pages automatically via the workflow in `.github/workflows/deploy.yml`. It runs on:

- Push to `main`
- Every 6 hours (cron) to pick up new blog posts and events
- Manual trigger via `workflow_dispatch`

## Project structure

```
src/
├── components/        # Astro components (Header, Footer, Hero, cards)
├── data/
│   ├── apps.yml       # App directory listings
│   └── communities.yml # Community group listings
├── layouts/
│   └── Base.astro     # Base HTML layout
├── lib/
│   ├── atproto.ts     # ATProto helpers (profile resolution)
│   ├── blog.ts        # Blog post fetcher (standard.site documents)
│   └── events.ts      # Event fetcher (community.lexicon.calendar.event)
├── pages/
│   ├── index.astro    # Homepage
│   ├── about.astro    # About page
│   ├── apps.astro     # App directory
│   ├── communities.astro # Community listings
│   └── events.astro   # Events listing
└── styles/
    └── global.css     # Design system (tokens, reset, utilities)
```

## Adding content

### Add a new community

Edit `src/data/communities.yml` and add an entry:

```yaml
- name: ATProto My City
  handle: mycity.atproto.camp
  location: My City, ST
  description: My City ATProtocol user group
  bluesky: https://bsky.app/profile/mycity.atproto.camp
```

Community accounts are also used to fetch events — any `community.lexicon.calendar.event` records on the account's PDS will automatically appear on the Events page and homepage.

## Contributing a theme

The site supports multiple visual themes — pick one with the toggle in the header. Each theme is a single CSS file under `src/styles/themes/`. Adding one is a 3-touchpoint job.

### How theming is layered

1. **Base tokens** (e.g. `--color-primary`, `--color-base-100`) — plain colors. **Themes redefine these.**
2. **Semantic tokens** (e.g. `--foreground`, `--card`, `--success-muted`) — composed from base. Components consume these. Theme-agnostic.
3. **Component tokens** (e.g. `--header-bg`, `--card-border`, `--badge-tag-bg`) — scoped knobs. Default to a semantic value; **themes may override** for theme-specific patterns.

Themes MUST NOT touch the semantic layer or the structural tokens (spacing, type scale, radii, fonts, breakpoints, motion durations).

### Steps

1. **Copy the template.**

   ```sh
   cp src/styles/themes/_template.css src/styles/themes/<your-theme>.css
   ```

   Replace every `REPLACE_ME` with your theme id (lowercase, no spaces — e.g. `seafoam`, `vapor-95`).

2. **Fill in the base tokens.** All of them, with plain colors. Every `*-content` token must hit ≥4.5:1 contrast on its paired surface (or 3:1 for large/UI text on badges).

3. **Override component tokens as needed.** The template lists every available knob, commented out — uncomment what you change, delete the rest. Common starting points: `--header-bg`, `--card-border`, `--badge-tag-bg`.

4. **Register the theme.** Two one-liners:
   - Add `@import "./themes/<your-theme>.css";` to `src/styles/tokens.base.css`
   - Add an entry to the `themes` array in `src/lib/themes.ts`:
     ```ts
     { id: '<your-theme>', name: '<Display Name>', scheme: 'light' | 'dark' }
     ```

5. **Test it.** `npm run dev`, cycle to your theme via the header toggle, click around every page. Verify card hovers, button states, badges, the hero, and the mobile hamburger.

### Theme rules (cheat sheet)

- **Specificity:** theme blocks use `:root[data-theme="<name>"]` — that beats the `:root` defaults in the semantic and component layers regardless of import order.
- **Dark themes:** invert the surface ramp — `--color-base-100` is the _darkest_ (page bg), and elevation lifts toward lighter shades. Lower chroma than the light equivalent.
- **Reduced motion:** if your theme animates anything, wrap the motion overrides in `@media (prefers-reduced-motion: reduce)` to disable them.
- **Skip link:** if you set `position: relative` on `body > *` for a layered background, exclude `.skip-link` so it stays offscreen until focused.
- **Lexicon-ready:** keep base tokens as plain colors (no `color-mix`, no `var()` chains). The base layer is intended to be serializable into a `community.atmosphere.theme` lexicon record someday.

### Existing themes

| Id         | Mood                                            |
| ---------- | ----------------------------------------------- |
| `horizon`  | Default light — warm, breezy, blues and corals  |
| `blacksky` | Deep indigo dark mode                           |

## Data sources

| Data        | Source                                                                                                      | Fetched at |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| Blog posts  | [Offprint](https://blog.atmosphere.community) via `site.standard.document` XRPC                             | Build time |
| Events      | [Smoke Signal](https://smokesignal.events) / community accounts via `community.lexicon.calendar.event` XRPC | Build time |
| Communities | Static YAML (`src/data/communities.yml`)                                                                    | Build time |
| Apps        | Static YAML (`src/data/apps.yml`)                                                                           | Build time |

## License

MIT
