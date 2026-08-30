// Shared shapes across the app. The reduced game shape mirrors what
// scripts/train-model.mjs caches; keep the two in sync.

export type TeamSide = {
  abbrev: string;
  name: string;
  score: number;
};

// [periodNumber, secondsLeftInPeriod, homeScore, awayScore]
export type ReducedPlay = [number, number, number, number];

export type PlayDetail = {
  period: number;
  clock: string;
  text: string;
  homeScore: number;
  awayScore: number;
  scoringPlay: boolean;
  team?: string; // team id
};

export type GameStatus = 'pre' | 'in' | 'final';

export type GameData = {
  id: string;
  date: string | null;
  venue: string | null;
  status: GameStatus;
  statusDetail: string;
  home: TeamSide;
  away: TeamSide;
  homeWon: boolean | null;
  spreadHome: number | null; // ESPN convention: negative = home favored
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  plays: ReducedPlay[];
  playDetails: PlayDetail[];
};

export type ScoreboardGame = {
  id: string;
  date: string;
  status: GameStatus;
  statusDetail: string;
  home: TeamSide;
  away: TeamSide;
};

export type ArchiveEntry = {
  id: string;
  date: string | null;
  venue: string | null;
  home: TeamSide;
  away: TeamSide;
  homeWon: boolean;
  spreadHome: number | null;
  volatility: number; // 0-100, scaled by corpus P95 (see lib/model/coefficients.json)
  finalHomeWp: number;
  spark: number[];
};

export type Insight = {
  atPlay: number;
  period: number;
  clock: string;
  text: string;
  kind: 'swing' | 'run' | 'lead-change' | 'closing';
};

export type SlipLeg = {
  market: string;
  pick: string;
  modelWp: number; // our model's probability for the pick
  impliedWp: number | null; // bookmaker-implied probability, when odds exist
  edge: number | null; // modelWp - impliedWp
  note: string;
};

export type User = {
  username: string;
  email: string;
  consent: boolean;
  verified: boolean;
  verifyToken?: string;
  createdAt: string;
  verifiedAt?: string;
};

export type UploadedSource = {
  id: string;
  username: string;
  kind: 'csv' | 'pdf' | 'url';
  name: string;
  size?: number;
  status: 'synced' | 'processing' | 'error';
  addedAt: string;
  summary?: string; // what Shimi extracted from it
  overlay?: { label: string; points: [number, number][] } | null; // user wp overlay: [gameFraction 0..1, wp 0..1]
  adjustHome?: number | null; // user model adjustment in points, applied to the prior
};

export type Counters = {
  registrations: number;
  dashboardViews: number;
  filesUploaded: number;
};
