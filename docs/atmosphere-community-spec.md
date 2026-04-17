# atmosphere.community — Project Spec

## Overview

A static community landing page for the ATProto / Atmosphere community, built with Astro and deployed to GitHub Pages via GitHub Actions. The site aggregates community activity — blog posts from Offprint, upcoming events from Smoke Signal / atmo.rsvp, and links to regional communities — into a single hub at `atmosphere.community`.

The site replaces the current Ghost-powered blog at `atprotocol.dev`, which is being migrated to Offprint at `blog.atmosphere.community`.

### Source thread

[Moving atprotocol.dev off of Ghost](https://discourse.atprotocol.community/t/moving-atprotocol-dev-off-of-ghost/770) — Discourse discussion with Boris Mann, flo-bit, captaincalliope, and others establishing goals and scope.

### Goals (from the Discourse thread)

1. **Aggregate community long-form writing** for and by the Atmosphere community
2. **Help community members announce and highlight happenings** via email to subscribers and selective highlights on the site
3. **Serve as the community front door** — a place to send the 1000+ subscriber list and new community members
4. **Be a replicable pattern** — if the approach works, others could productize standard.site community aggregators

---

## Architecture

**Framework:** Astro (static site generation)
**Deployment:** GitHub Pages via GitHub Actions
**Repository:** [ATProtocol-Community GitHub org](https://github.com/ATProtocol-Community)
**Domain:** `atmosphere.community`

### Data sources at build time

| Data | Source | Method |
|------|--------|--------|
| Blog post previews | Offprint at `blog.atmosphere.community` | Fetch standard.site records from the ATProto account's PDS via XRPC (`com.atproto.repo.listRecords` for `site.standard.document`) at build time. Render title, author, date, excerpt. Link out to Offprint for full content. |
| Upcoming events | Smoke Signal / atmo.rsvp | Fetch event records via ATProto XRPC at build time. Render next 3 upcoming events on homepage; full list on events page. |
| Local communities | Static | YAML data file (`src/data/communities.yml`) with name, region, URL, description, optional logo. |
| Page content (About, etc.) | Static | Markdown or Astro components in the repo. |

### Build & deploy pipeline

A GitHub Actions workflow runs `astro build` and deploys to GitHub Pages. The workflow should run on:

- Push to `main`
- A cron schedule (e.g., every 6 hours) to pick up new Offprint posts and Smoke Signal events without manual deploys

---

## Pages

### 1. Homepage (`/`)

The homepage is the community front door. Layout from top to bottom:

**Hero section**
- Atmosphere community name and tagline (something like "The community hub for apps and people building on AT Protocol")
- Brief 1–2 sentence description of what the Atmosphere is
- CTA: "Subscribe to the newsletter" → links to the Offprint subscribe page at `blog.atmosphere.community`

**Featured + Latest Posts**
- Pull the most recent 3–6 posts from the Offprint blog via standard.site records
- Each post card shows: title, author name + avatar (from ATProto profile), publication date, first ~150 chars of content as excerpt
- Boris's reference: the current `atprotocol.dev` has a "featured" row at the top and a "latest" section below. For v1, treat all posts as latest (no manual featuring). A `featured: true` flag in a future iteration could promote specific posts.
- "Read on the blog →" link to `blog.atmosphere.community`

**Upcoming Events (widget)**
- Next 2–3 upcoming events pulled from Smoke Signal / atmo.rsvp
- Each event shows: name, date/time, location (or "Online"), link to RSVP
- "See all events →" link to `/events`

**Community highlights**
- Static or semi-static section: 3–4 cards linking to things like the Discourse forum, the ATProtocol-Community GitHub org, the ATmosphereConf site, and the Community Fund page
- Could also highlight community badges here in a future iteration (per Boris's suggestion in the thread)

### 2. About (`/about`)

Static markdown page covering:

- What the Atmosphere community is
- Relationship to AT Protocol and Bluesky
- What an "Atmosphere account" is (or link to the explainer that quillmatiq.com's group is working on)
- The AT Protocol Community Fund
- How to get involved
- Links to the Discourse, GitHub, Bluesky

### 3. Events (`/events`)

Full list of upcoming events, pulled from Smoke Signal / atmo.rsvp at build time.

Each event card: name, date, location, short description, RSVP link.

Past events could optionally be shown in a collapsed/archived section, or omitted for v1.

If the ATProto events data isn't ready or sufficient at launch, fall back to a static YAML file with manual entries, or embed/link to the [Discourse events wiki page](https://discourse.atprotocol.community/t/2026-events-atproto-open-social-dev-and-more/293).

### 4. Communities (`/communities`)

A static page listing regional and interest-based ATProto communities. Data from `src/data/communities.yml`.

Each community entry: name, region/location, short description, links (website, Bluesky, Discourse, etc.), optional logo.

Initial list should include communities mentioned in the Discourse thread and the events wiki, e.g.:

- AT Proto PDX (Portland)
- ATProto NYC
- Various regional groups that emerged around ATmosphereConf

This page could later pull from opensocial.community or ATProto groups data, but starts static.

### 5. Newsletter / Subscribe

Not a standalone page — the CTA throughout the site links to Offprint's subscribe page at `blog.atmosphere.community`. The subscribe action should be visible from:

- The homepage hero
- The footer (persistent across all pages)
- The blog section of the homepage

---

## Design Direction

**Mood:** Friendly, open, approachable. Consistent with the existing ATmosphereConf and AT Community branding but fresh.

**Color palette:** Blues and sky tones. Cloud/atmosphere imagery as accents or backgrounds. The current `atprotocol.dev` uses a dark theme with blue accents. The new site can go lighter — think open sky — while keeping blues as the primary family.

**Typography:** Pick something with character. The ATmosphereConf site and existing community materials can inform the direction, but this is a chance to establish a distinct community brand. Avoid overly corporate fonts.

**Layout principles:**
- Mobile-first, responsive
- Clean card-based layouts for posts and events (similar to the current atprotocol.dev homepage, which uses a grid of post cards)
- Generous whitespace
- Accessible — proper contrast ratios, semantic HTML, keyboard navigation

**Specific references from the thread:**
- Boris referenced [Planet Mozilla Participation](https://planet.mozilla.org/participation/) as a conceptual model (a "planet"-style aggregator that collects posts from multiple authors)
- Boris noted Leaflet's Reader is functional but "a little flat" and suggested the community site should highlight the person/organization behind each publication — author avatars, names, and context should be prominent on post cards
- The current `atprotocol.dev` recommendations section (recipe.exchange, Fediverse Report, Lexicon Community, Blacksky, Linkat) could be carried forward as a "friends of the community" or "recommended projects" section

---

## ATProto Integration Details

### Fetching standard.site records (blog posts)

At build time, the Astro site needs to:

1. Resolve the DID for the Offprint blog's ATProto handle (e.g., `atmosphere.community` or whatever handle is set on the account)
2. Call `com.atproto.repo.listRecords` on the account's PDS with collection `site.standard.document`
3. Parse the returned records to extract: title, content excerpt, creation date, author info
4. Generate static pages/components from the parsed data

The [`astro-standard-site`](https://github.com/musicjunkieg/astro-standard-site) package by Bryan Guffey provides an Astro Content Layer loader that does exactly this. Evaluate whether to use it directly or write a simpler custom loader.

### Fetching events from Smoke Signal / atmo.rsvp

This depends on what lexicons Smoke Signal and atmo.rsvp expose. At build time:

1. Identify the ATProto account(s) hosting community events
2. Fetch event records via XRPC (the specific collection/lexicon will depend on Smoke Signal's schema)
3. Parse event data: name, date/time, location, description, RSVP URL
4. Filter to upcoming events, sort by date

**If Smoke Signal's ATProto data isn't easily fetchable at build time**, fall back to a YAML data file and coordinate with flo-bit on integration later.

### ATProto identity for the site

Boris mentioned in the thread that he set up the DID TXT record for `atmosphere.community` already, meaning the domain can serve as an ATProto handle. The site could display a Bluesky-linkable identity (e.g., `@atmosphere.community`).

---

## Repo Structure (proposed)

```
atmosphere-community/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions: build + deploy to Pages
├── src/
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── PostCard.astro      # Blog post preview card
│   │   ├── EventCard.astro     # Event preview card
│   │   ├── CommunityCard.astro # Community listing card
│   │   └── Hero.astro
│   ├── data/
│   │   └── communities.yml     # Static community listings
│   ├── layouts/
│   │   └── Base.astro          # Base HTML layout
│   ├── lib/
│   │   ├── atproto.ts          # ATProto XRPC helpers (resolve DID, fetch records)
│   │   ├── blog.ts             # Fetch + parse standard.site posts from Offprint
│   │   └── events.ts           # Fetch + parse events from Smoke Signal
│   ├── pages/
│   │   ├── index.astro         # Homepage
│   │   ├── about.astro         # About page (or about.md)
│   │   ├── events.astro        # Events listing
│   │   └── communities.astro   # Communities listing
│   └── styles/
│       └── global.css          # Global styles, CSS variables
├── public/
│   ├── favicon.svg
│   └── images/                 # Static images, logos
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── README.md
```

---

## Implementation Phases

### Phase 1: Scaffold + Static Content (weekend prototype)

- [ ] Initialize Astro project, configure for GitHub Pages (static output)
- [ ] Set up GitHub Actions deploy workflow with cron schedule
- [ ] Build page layouts: Header, Footer, Base layout
- [ ] Homepage with hero, placeholder post cards, placeholder event cards, community highlights
- [ ] About page (static markdown)
- [ ] Communities page with YAML data
- [ ] Events page with placeholder/YAML data
- [ ] Design: blues + clouds palette, typography, responsive layout
- [ ] Footer with newsletter subscribe link (to Offprint)

### Phase 2: ATProto Blog Integration

- [ ] Write `src/lib/atproto.ts` — DID resolution, XRPC record fetching
- [ ] Write `src/lib/blog.ts` — fetch standard.site documents from the Offprint account, parse into post previews
- [ ] Wire up homepage Featured + Latest section to live data
- [ ] Handle edge cases: empty state, fetch failures (fall back to cache or placeholder)
- [ ] Evaluate `astro-standard-site` package vs. custom implementation

### Phase 3: Events Integration

- [ ] Coordinate with flo-bit on Smoke Signal / atmo.rsvp event data availability
- [ ] Write `src/lib/events.ts` — fetch and parse event records
- [ ] Wire up homepage events widget and `/events` page
- [ ] If ATProto event data isn't ready, keep YAML fallback

### Phase 4: Polish + Community Feedback

- [ ] Share with Discourse thread participants for feedback
- [ ] Add community badges section (per Boris's suggestion)
- [ ] Add "Recommended projects" section (carry forward from current atprotocol.dev)
- [ ] RSS feed generation for the aggregated content
- [ ] SEO: OpenGraph tags, meta descriptions
- [ ] Accessibility audit

---

## Open Questions

1. **Offprint account handle:** What ATProto handle/DID will the Offprint blog use? Boris mentioned swapping the handle from `@atprotocol.dev` to `atmosphere.community`. Need to confirm what account to fetch standard.site records from.

2. **Smoke Signal event data:** What lexicon/collection do Smoke Signal events use? Is there a community account that aggregates ATProto community events, or do we need to pull from multiple accounts? Coordinate with flo-bit.

3. **Content curation:** The thread discussed whether the aggregator should be fully open or use an allow list. For v1 with Offprint as the sole source, this is moot — the Offprint blog is editorially controlled. But if the site later aggregates from multiple standard.site publishers, a curation mechanism (allow list, groups membership via opensocial.community, etc.) will be needed.

4. **Newsletter vs. Offprint subscribe:** Boris mentioned wanting email list capabilities with preference categories (conference, events, community announcements). Offprint may handle this, but confirm what subscribe/email features Offprint provides.

5. **Domain routing:** `atmosphere.community` for the landing page, `blog.atmosphere.community` for Offprint. Confirm DNS/subdomain setup.

6. **Groups integration:** Boris suggested using Brittany's groups infrastructure for the allow list. This could be a future mechanism for deciding which standard.site publications get aggregated. Not needed for v1 but worth noting as a design consideration.

7. **The `atprotocol.dev` domain:** The thread discusses keeping this as a developer-focused resource. Is that a separate project, or does it redirect to `atmosphere.community` for now?
