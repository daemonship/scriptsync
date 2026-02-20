# ScriptSync — Production Deployment Guide

## Architecture

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  Next.js App (Vercel)   │────▶│  Supabase (cloud)        │
│  scriptsync-ten.vercel  │     │  - Auth                  │
│  .app                   │     │  - PostgreSQL             │
└─────────────────────────┘     │  - Storage (clips/frames) │
                                └──────────────────────────┘
┌─────────────────────────┐              ▲
│  Worker (Fly.io)        │──────────────┘
│  scriptsync-worker.     │  Polls for pending clips,
│  fly.dev                │  runs FFmpeg + AI tagging
└─────────────────────────┘
```

---

## 1. Supabase — Production Project

### Create project
1. Go to https://supabase.com/dashboard and create a new project
2. Note your **Project URL** and **anon key** (Settings → API)
3. Note your **service_role key** (keep it secret — worker only)

### Run migrations (in order)
Open the **SQL editor** and run each file in order:

```bash
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_storage_policies.sql
supabase/migrations/003_add_video_seconds_rpc.sql
supabase/migrations/004_add_clip_embeddings.sql
```

### Auth settings
- Settings → Authentication → Site URL: `https://scriptsync-ten.vercel.app`
- Add redirect URL: `https://scriptsync-ten.vercel.app/api/auth/callback`

### Storage buckets
Buckets are created by migration `002_storage_policies.sql`. Verify in the dashboard:
- `clips` — private, 2 GB limit, mp4/mov only
- `frames` — public (for thumbnail display)

---

## 2. Vercel — Next.js App

**Live at:** https://scriptsync-ten.vercel.app

### Environment variables (set in Vercel dashboard → Settings → Environment Variables)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `WORKER_URL` | `https://scriptsync-worker.fly.dev` |
| `WORKER_API_KEY` | Shared secret (set same value in Fly.io worker) |
| `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` | Your Stripe payment link URL (optional) |

After setting env vars, trigger a redeploy:
```bash
npx vercel --prod --yes
```

---

## 3. Fly.io — Worker Service

### Prerequisites
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

### Deploy
```bash
cd worker
fly deploy --remote-only
```

The `worker/fly.toml` is already configured with:
- App name: `scriptsync-worker`
- Region: `iad` (US East)
- 2 CPUs / 4 GB RAM (required for FFmpeg)

### Set secrets
```bash
cd worker
fly secrets set \
  SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  ANTHROPIC_API_KEY=sk-ant-... \
  OPENAI_API_KEY=sk-... \
  WORKER_API_KEY=your-shared-secret
```

### Verify worker is running
```bash
fly status -a scriptsync-worker
fly logs -a scriptsync-worker
```

---

## 4. Stripe — Payment Link (optional)

1. Create a product in your Stripe dashboard
2. Create a Payment Link for it
3. Copy the link URL (e.g. `https://buy.stripe.com/...`)
4. Set `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` in Vercel

The "Upgrade" button will appear in the dashboard nav when this is set.

---

## 5. End-to-End Verification Checklist

- [ ] Sign up / sign in at https://scriptsync-ten.vercel.app
- [ ] Create a project
- [ ] Upload an MP4 or MOV clip (up to 2 GB)
- [ ] Wait for status to change from `processing` → `ready` (worker must be running)
- [ ] Confirm thumbnail appears and tags are visible
- [ ] Use the search bar to filter clips by keyword
- [ ] Paste a script paragraph into the script panel
- [ ] Confirm B-roll match suggestions appear with scores
- [ ] Export CSV and verify it contains: filename, description, tags, matched paragraph, score
- [ ] Click "Upgrade" link and verify it opens the Stripe payment page
