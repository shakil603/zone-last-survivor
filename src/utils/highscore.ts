export interface ScoreEntry {
  name: string;
  score: number;
  kills: number;
  placement: number; // 1 = won
  result: "VICTORY" | "ELIMINATED";
  date: number;
}

const KEY = "zls_highscores_v1";
const NAME_KEY = "zls_playername_v1";

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 10);
  } catch {
    return [];
  }
}

export function saveScore(entry: Omit<ScoreEntry, "date">): ScoreEntry[] {
  const list = loadScores();
  const full: ScoreEntry = { ...entry, date: Date.now() };
  list.push(full);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 10);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    /* ignore */
  }
  return top;
}

export function isHighScore(score: number): boolean {
  if (score <= 0) return false;
  const list = loadScores();
  if (list.length < 10) return true;
  return score > list[list.length - 1].score;
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, 12));
  } catch {
    /* ignore */
  }
}

export function rankSuffix(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}
