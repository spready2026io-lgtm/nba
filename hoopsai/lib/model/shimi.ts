// Shimi's win-probability engine. The math here MUST match scripts/train-model.mjs,
// which fits the coefficients this module loads. Change one, change both.
//
// Model: logistic regression, P(home win) = sigmoid(b0 + b1*x1 + b2*x2 + b3*x3)
//   x1 = margin / sqrt(secRemaining + 8)
//   x2 = -pregameHomeSpread * min(1, secRemaining / 2880)   (prior decays with clock)
//   x3 = margin
// Trained on real 2025-26 ESPN play-by-play; provenance and holdout metrics live
// in coefficients.json next to this file.

import coefficients from './coefficients.json';
import type { GameData, Insight, ReducedPlay, SlipLeg } from '../types';

const BETA: number[] = coefficients.coefficients;
const VOL_P95: number = coefficients.volatilityP95;

export const modelMeta = {
  version: coefficients.version,
  trainedAt: coefficients.trainedAt,
  games: coefficients.games, // full corpus: train + holdout
  gamesTrain: coefficients.games - coefficients.gamesHoldout,
  gamesHoldout: coefficients.gamesHoldout,
  rowsTrain: coefficients.rowsTrain,
  holdout: coefficients.metrics.holdout,
  espnBenchmark: coefficients.metrics.espnHoldoutBenchmark,
};

export function secRemaining(period: number, clockSec: number): number {
  if (period <= 4) return (4 - period) * 720 + clockSec;
  return clockSec; // inside an overtime period
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function homeWinProb(margin: number, secRem: number, spreadHome: number | null, priorAdjust = 0): number {
  const prior = (spreadHome == null ? 0 : -spreadHome) + priorAdjust;
  const x1 = margin / Math.sqrt(secRem + 8);
  const x2 = prior * Math.min(1, secRem / 2880);
  const x3 = margin;
  return sigmoid(BETA[0] + BETA[1] * x1 + BETA[2] * x2 + BETA[3] * x3);
}

// priorAdjust: points added to the home prior, e.g. from a user-uploaded model.
export function wpSeries(plays: ReducedPlay[], spreadHome: number | null, priorAdjust = 0): number[] {
  return plays.map(([period, clockSec, hs, as]) =>
    homeWinProb(hs - as, secRemaining(period, clockSec), spreadHome, priorAdjust));
}

export function volatilityIndex(series: number[]): number {
  let sum = 0;
  for (let i = 1; i < series.length; i++) sum += Math.abs(series[i] - series[i - 1]);
  return Math.min(100, Math.round((sum / VOL_P95) * 100));
}

export function volatilityLabel(v: number): string {
  if (v >= 70) return 'High';
  if (v >= 40) return 'Medium';
  return 'Low';
}

// change in home wp over roughly the last quarter-hour of plays
export function momentumShift(series: number[], window = 40): number {
  if (series.length < 2) return 0;
  const w = Math.min(window, series.length - 1);
  return series[series.length - 1] - series[series.length - 1 - w];
}

export function leadChanges(series: number[]): number {
  let n = 0;
  for (let i = 1; i < series.length; i++) {
    if ((series[i] - 0.5) * (series[i - 1] - 0.5) < 0) n++;
  }
  return n;
}

// Deterministic, data-derived commentary. Every sentence is backed by the series
// it is computed from; nothing here is invented.
export function detectInsights(game: GameData, series: number[]): Insight[] {
  const out: Insight[] = [];
  const { home, away } = game;
  const W = 25; // plays per swing window
  let lastFlaggedAt = -999;
  for (let i = W; i < series.length; i++) {
    const delta = series[i] - series[i - W];
    if (Math.abs(delta) >= 0.15 && i - lastFlaggedAt >= W) {
      const detail = game.playDetails[i];
      const gainer = delta > 0 ? home : away;
      out.push({
        atPlay: i,
        period: detail?.period ?? 0,
        clock: detail?.clock ?? '',
        kind: 'swing',
        text: `Win probability swung ${(Math.abs(delta) * 100).toFixed(1)}% toward ${gainer.abbrev} over the last ${W} plays (${periodName(detail?.period ?? 0)}, ${detail?.clock ?? ''} on the clock).`,
      });
      lastFlaggedAt = i;
    }
  }
  // scoring runs: 10-0 or better inside a 20-play window
  for (let i = 20; i < game.plays.length; i += 5) {
    const [, , hs2, as2] = game.plays[i];
    const [, , hs1, as1] = game.plays[i - 20];
    const dh = hs2 - hs1;
    const da = as2 - as1;
    if ((dh >= 10 && da === 0) || (da >= 10 && dh === 0)) {
      const detail = game.playDetails[i];
      const team = dh > da ? home : away;
      out.push({
        atPlay: i,
        period: detail?.period ?? 0,
        clock: detail?.clock ?? '',
        kind: 'run',
        text: `${team.abbrev} is on a ${Math.max(dh, da)}-0 run (${periodName(detail?.period ?? 0)}, ${detail?.clock ?? ''}).`,
      });
      i += 20;
    }
  }
  return out.sort((a, b) => a.atPlay - b.atPlay);
}

export function periodName(p: number): string {
  if (p === 0) return '';
  if (p <= 4) return ['1st quarter', '2nd quarter', '3rd quarter', '4th quarter'][p - 1];
  return p === 5 ? 'overtime' : `${p - 4}OT`;
}

function impliedFromMoneyline(ml: number | null): number | null {
  if (ml == null) return null;
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

// Betting slip: only markets the model actually covers (the side). Where pregame
// moneylines exist we show the model edge against them; where they do not, edge is null.
export function generateSlip(game: GameData, series: number[]): SlipLeg[] {
  if (series.length === 0) return [];
  const wpHome = series[series.length - 1];
  const pickHome = wpHome >= 0.5;
  const team = pickHome ? game.home : game.away;
  const modelWp = pickHome ? wpHome : 1 - wpHome;
  const implied = impliedFromMoneyline(pickHome ? game.homeMoneyline : game.awayMoneyline);
  const vol = volatilityIndex(series);
  const mom = momentumShift(series);
  const momNote =
    Math.abs(mom) >= 0.08 && game.status === 'in'
      ? ` Momentum note: ${(Math.abs(mom) * 100).toFixed(1)}% of win probability moved to ${(mom > 0 ? game.home : game.away).abbrev} over the recent stretch, volatility ${vol}/100.`
      : '';
  return [
    {
      market: game.status === 'final' ? 'Moneyline (closed)' : 'Moneyline',
      pick: team.name,
      modelWp,
      impliedWp: implied,
      edge: implied == null ? null : modelWp - implied,
      note:
        (implied == null
          ? `Model has ${team.abbrev} at ${(modelWp * 100).toFixed(1)}%. No pregame line available for this game.`
          : `Model ${(modelWp * 100).toFixed(1)}% vs pregame implied ${(implied * 100).toFixed(1)}%. Pregame lines only; live prices will differ.`) + momNote,
    },
  ];
}

// Narrative for the Audio Analyst: assembled only from computed values.
export function buildCommentary(game: GameData, series: number[]): string {
  if (series.length === 0) return 'No play-by-play data is available for this game yet.';
  const wp = series[series.length - 1];
  const leader = wp >= 0.5 ? game.home : game.away;
  const leaderWp = wp >= 0.5 ? wp : 1 - wp;
  const vol = volatilityIndex(series);
  const flips = leadChanges(series);
  const insights = detectInsights(game, series);
  const parts: string[] = [];
  parts.push(
    `${game.away.name} at ${game.home.name}. ` +
    (game.status === 'final'
      ? `Final score ${game.home.abbrev} ${game.home.score}, ${game.away.abbrev} ${game.away.score}.`
      : `Score ${game.home.abbrev} ${game.home.score}, ${game.away.abbrev} ${game.away.score}, ${game.statusDetail}.`)
  );
  parts.push(`Shimi's model has ${leader.name} at ${(leaderWp * 100).toFixed(1)}% win probability.`);
  parts.push(`Volatility index ${vol} out of 100, ${volatilityLabel(vol).toLowerCase()}. The favorite flipped ${flips} ${flips === 1 ? 'time' : 'times'}.`);
  for (const ins of insights.slice(-3)) parts.push(ins.text);
  return parts.join(' ');
}
