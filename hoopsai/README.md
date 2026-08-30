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
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage | local `.data/` JSON files |

## Run

```
npm run dev    # http://localhost:3010 (port set in ../.claude/launch.json usage)
npm run build
```
