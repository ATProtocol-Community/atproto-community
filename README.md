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

| Command           | Action                                       |
| :---------------- | :------------------------------------------- |
| `npm install`     | Install dependencies                         |
| `npm run dev`     | Start local dev server at `localhost:4321`    |
| `npm run build`   | Build production site to `./dist/`           |
| `npm run preview` | Preview the build locally before deploying   |

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

## Data sources

| Data | Source | Fetched at |
|------|--------|-----------|
| Blog posts | [Offprint](https://blog.atmosphere.community) via `site.standard.document` XRPC | Build time |
| Events | [Smoke Signal](https://smokesignal.events) / community accounts via `community.lexicon.calendar.event` XRPC | Build time |
| Communities | Static YAML (`src/data/communities.yml`) | Build time |
| Apps | Static YAML (`src/data/apps.yml`) | Build time |

## License

MIT
