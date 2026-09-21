# Bink

Bink is a personal-brand content strategist for technical people and founders who build a lot but
never post about it. It reads your real GitHub, X, and LinkedIn history, talks through your
positioning with you like a strategist, turns your own work — plus industry news and what your peers
are posting — into concrete content ideas, then writes finished LinkedIn and X posts in your real
voice, and can publish them automatically once you approve.

**[Try the live demo →](#)** (update this link once deployed)

The live demo runs in guest mode: every visitor gets their own private, temporary profile
automatically, no login needed. Real posting is turned off in that mode — nobody can ever publish to
a real account through the public demo. Clone this repo and run it yourself to unlock that.

## What it does

1. **Profile** — point it at a GitHub username, an X handle, and/or a LinkedIn URL. It scrapes your
   real history and writes a plain-English summary of what you build, what you care about, and how
   you write.
2. **Strategy** — a chat with Bink that plays your own story back to you and locks in two or three
   things you want to be known for.
3. **Content ideas** — cards pulled from your own work, recent news in your space, and what peers in
   your niche are posting. Keep, edit, or dismiss each one.
4. **Posts** — finished LinkedIn/X drafts written in your voice, checked against what you've already
   posted so nothing repeats. Give feedback in a chat-style panel to refine any draft. Approve one and
   it can publish (or schedule) itself — no manual posting.

## Stack

Next.js (App Router, Server Actions) · Prisma + PostgreSQL · Tailwind CSS · Anthropic API (Claude) ·
Apify (scraping GitHub/X/LinkedIn and searching peers/news) · Zernio (real LinkedIn/X publishing)

## Run it yourself

```bash
npm install
cp .env.example .env   # then fill in the values below
npx prisma migrate dev
npm run dev
```

Then open <http://localhost:3210>.

You'll need a Postgres database — a free one from [Neon](https://neon.tech) or
[Supabase](https://supabase.com) works fine, or run Postgres locally. Paste its connection string in
as `DATABASE_URL`.

| Key | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | yes | A Postgres connection string (see above) |
| `ANTHROPIC_API_KEY` | yes | <https://console.anthropic.com/settings/keys> → Create Key |
| `APIFY_TOKEN` | yes | <https://console.apify.com/settings/integrations> → Personal API tokens → Create |
| `GITHUB_TOKEN` | optional | <https://github.com/settings/tokens> → Generate new token (classic) → no scopes needed. Raises GitHub's limit from 60 to 5,000 requests/hour. |
| `ZERNIO_API_KEY` | optional | <https://zernio.com> → Settings → API keys. Only needed for real auto-posting to LinkedIn/X. Leave blank to use everything except publishing. |
| `NEXT_PUBLIC_DEMO_MODE` | no | Leave `false` for your own private use. Only set `true` on a deployment strangers can reach — see below. |

Edits to most keys in `.env` take effect on the next click, no restart needed. `NEXT_PUBLIC_DEMO_MODE`
is the exception — it's baked in at build time, so it has to be set before `next build`, not just
before `next start`.

## Deploying a public demo safely

If you're hosting this somewhere the public can click into without logging in, set
`NEXT_PUBLIC_DEMO_MODE=true` before building. That flips on three things:

- **Guest mode** — every visitor's data is scoped to a private cookie automatically. Nobody sees
  anyone else's profile.
- **Posting disabled** — the real "connect account" / "post now" flow is removed from the UI and
  blocked server-side too, regardless of whether `ZERNIO_API_KEY` is set. Simplest to just leave that
  key unset entirely on a public deployment.
- **Usage caps** — each guest is capped at `NEXT_PUBLIC_DEMO_DAILY_LIMIT` (default 30) expensive
  actions (scrapes, AI writes) per day, since those run on your own API keys.

## Design

Cream background, warm orange/purple palette, Quicksand + Baloo 2 fonts, a persistent left sidebar
with a ⌘K jump palette, and tabbed profile pages where later tabs unlock as you progress. Design
tokens live in `src/app/globals.css`.

## Where things live

```
prisma/schema.prisma        database tables: Profile, Source, WritingSample, ContentIdea, Draft...
src/middleware.ts            gives every visitor a private guest cookie before any page/action runs
src/lib/guest.ts              reads the current visitor's guest id
src/lib/guestLimit.ts         per-guest daily usage cap, enforced only in demo mode
src/lib/demoModeShared.ts     the NEXT_PUBLIC_DEMO_MODE flag, safe to import from client or server code
src/lib/apify.ts             THE one generic Apify helper — every scraper calls runActor()
src/lib/github.ts            GitHub reader + plain-text digest
src/lib/x.ts / linkedin.ts   X / LinkedIn post fetchers (use runActor)
src/lib/classify.ts          scores posts 0 to 3 for founder signal, flags personal ones
src/lib/summarize.ts         Claude call, the summary schema, and the system prompt
src/lib/strategy.ts          the strategy-chat model loop
src/lib/ideas.ts             content idea generation
src/lib/drafts.ts            post-writing model call
src/lib/zernio.ts            real LinkedIn/X publishing (skipped entirely in demo mode)
src/app/actions.ts           every server action: profiles, scrapes, chat, ideas, drafts, publishing
src/app/page.tsx             home page (hero, how it works, your profiles)
src/app/profile/[id]/        profile page: tab controller, Home/Strategy/Content Ideas/Posts tabs
src/components/              sidebar, palette, run button, summary view, animated how-it-works flow
```
