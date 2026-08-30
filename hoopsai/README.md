# HoopsAi

The data centre for NBA punters. hoopsai.com.

Centerpiece: a live Win Probability Chart on real NBA play-by-play, powered by Shimi's
model (logistic regression trained on 2025-26 season play states). Around it: a live
games ticker, a replayable game archive, the Knowledge Hub (upload CSV/PDF models,
Shimi folds them into the chart), Shimi chat, a model-derived betting slip, an audio
analyst, registration with email verification, and a two-tab admin page.

Product: Gadi + Ofer Komem (partner, product manager). Built by the AI team (Adam/Ada).

## Stack

Next.js (App Router, TS) + Tailwind v4, deployed on Vercel. No database: JSON
collections in Vercel Blob (production) or `.data/` (local). Data source: ESPN's open
NBA API through `lib/espn.ts`; if it proves fragile, BALLDONTLIE GOAT slots in behind
the same adapter (decision 2026-08-30).

## Deployment (live)

Vercel project `hoopsai` on `spready2026io-5260s-projects`, production at
**hoopsai.vercel.app**. Deploy with `npx vercel deploy --prod` from this folder.

**Git auto-deploy is deliberately disconnected.** The app lives in a subfolder of
the NBA repo while the project's Root Directory is `.`, so a git-triggered build
would deploy the repo root (the old concept page) to production. Set Root
Directory to `hoopsai` in the project settings, then `vercel git connect`.

**ESPN 403s datacenter IPs**, so the deployed site cannot fetch play-by-play.
Production serves all 524 archived games from `public/games/*.json`, built by
`node scripts/build-game-data.mjs` on a machine ESPN serves (re-runs skip files
that already exist). The live feed is still tried first, for games in progress.
A live-season feed is an open decision: see `M-memory 1/decisions.md`.

`hoopsai.com` is not attached yet: it is claimed by another Vercel account and
currently redirects to dealsize.ai. DNS already points at Vercel, so once it is
released, `vercel domains add hoopsai.com hoopsai` verifies immediately.

## The model

`scripts/train-model.mjs` fetches play-by-play (cached in `scripts/cache/`), fits a
ridge-regularized logistic regression, and writes:

- `lib/model/coefficients.json`: coefficients + provenance + honest holdout metrics
  (including the ESPN win-probability Brier on the same held-out games)
- `data/archive-index.json`: the archive list with our model's wp sparklines

Runtime math lives in `lib/model/shimi.ts` and MUST stay in sync with the trainer.
Retrain: `node scripts/train-model.mjs` (cache makes reruns cheap). Off-season, the
site replays recorded games as the live experience.

## Environment variables (all optional in dev, set in Vercel for production)

| Var | Purpose | Without it |
|---|---|---|
| `HOOPSAI_SECRET` | signs session cookies | dev fallback secret; production build throws |
| `ADMIN_PASSWORD` | /admin access | admin disabled |
| `RESEND_API_KEY` | verification emails | verify link shown on screen (dev mode) |
| `MAIL_FROM` | sender identity | `HoopsAi <onboarding@resend.dev>` |
| `ANTHROPIC_API_KEY` | Shimi chat + PDF reading (claude-opus-5) | deterministic model-math replies |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage (PRIVATE store) | local `.data/` JSON files |

Set in production today: `HOOPSAI_SECRET`, `BLOB_READ_WRITE_TOKEN`. Not set, and
each one closes a feature until it is: `RESEND_API_KEY` (registration returns 502
and no one can sign up), `ADMIN_PASSWORD` (/admin returns 503), `ANTHROPIC_API_KEY`
(Shimi answers from model math only). All three fail closed by design.

## Run

```
npm run dev    # http://localhost:3010 (port set in ../.claude/launch.json usage)
npm run build
```
