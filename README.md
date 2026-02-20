# ScriptSync: AI-Powered Transcript & B-Roll Logging for Video Editors

Video editors waste hours scrubbing through footage to match spoken words with B-roll clips. ScriptSync lets you upload your footage, automatically tags every clip with AI-generated descriptions and keywords, then matches each line of your script to the best B-roll candidates — in seconds.

## Feedback & Ideas

> **This project is being built in public and we want to hear from you.**
> Found a bug? Have a feature idea? Something feel wrong or missing?
> **[Open an issue](../../issues)** — every piece of feedback directly shapes what gets built next.

## Status

> 🚧 In active development — not yet production ready

| Feature | Status | Notes |
|---------|--------|-------|
| Project scaffold & auth | ✅ Complete | Next.js 14 App Router, Supabase Auth, Fly.io worker skeleton |
| Video upload & frame extraction | ✅ Complete | MP4/MOV up to 2 GB, FFmpeg 1fps/2s, 5-hour usage cap |
| Claude vision tagging pipeline | ✅ Complete | claude-sonnet-4-6 vision, description + keyword tags, retry logic |
| Clip browser, search & script paste UI | ✅ Complete | Thumbnail grid, keyword search, script paste, match view, CSV export |
| B-roll matching & CSV export | ✅ Complete | OpenAI embeddings, cosine similarity, CSV export API |
| Deploy to production | 📋 Planned | |

## What It Does

1. **Upload** video clips (MP4/MOV, up to 2 GB)
2. **AI tagging** — Claude vision analyzes extracted frames and generates descriptions + keyword tags for each clip
3. **Paste your script** — ScriptSync parses it into paragraphs
4. **Match** — embedding-based cosine similarity ranks your clips against each script paragraph
5. **Export** — download a CSV with clip filename, description, tags, matched paragraph, and similarity score

## Who It's For

Solo video creators, small production teams, and documentary editors who want to stop scrubbing.

## Tech Stack

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS
- **Backend/DB:** Supabase (auth, storage, PostgreSQL)
- **Worker:** Node.js on Fly.io (FFmpeg frame extraction, Claude vision, OpenAI embeddings)
- **AI:** Claude claude-sonnet-4-6 vision for clip tagging, `text-embedding-3-small` for script matching

## Setup

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- Anthropic and OpenAI API keys (for the worker)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Run the database migration

Open the Supabase SQL editor and run `supabase/migrations/001_initial_schema.sql`.

Create two storage buckets in your Supabase project:
- `clips` — stores raw uploaded video files (private)
- `frames` — stores extracted frames and thumbnails (public, for thumbnail display)

### 4. Run the dev server

```bash
npm run dev
```

App is at [http://localhost:3000](http://localhost:3000).

### Worker (Fly.io)

```bash
cd worker
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY
node src/index.js
```

---

*Built by [DaemonShip](https://github.com/daemonship) — autonomous venture studio*
