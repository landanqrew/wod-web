import { ScoreType } from "@/lib/domain/models/workout";
import type { WorkoutFormat } from "@/lib/domain/models/workout";
import type { WorkoutResult } from "@/lib/domain/models/workout-result";
import type { MovementPrescription } from "@/lib/domain/models/workout";
import { getMovement } from "@/lib/domain/movements/library";

export const EM_DASH = "—";

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function parseClock(value: string): number | undefined {
  const parts = value.trim().split(":");
  if (parts.length === 2) {
    const m = Number(parts[0]);
    const s = Number(parts[1]);
    if (Number.isFinite(m) && Number.isFinite(s)) return m * 60 + s;
  }
  const n = Number(value);
  return Number.isFinite(n) && value.trim() !== "" ? n : undefined;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** The single line an athlete reads as "their score". */
export function formatScore(result: WorkoutResult): string {
  switch (result.scoreType) {
    case ScoreType.Time:
      return result.timeSeconds !== undefined ? formatSeconds(result.timeSeconds) : EM_DASH;
    case ScoreType.RoundsAndReps:
      if (result.roundsCompleted === undefined) return EM_DASH;
      return result.partialReps
        ? `${result.roundsCompleted} + ${result.partialReps}`
        : `${result.roundsCompleted} rounds`;
    case ScoreType.Load:
      return result.peakLoad !== undefined ? `${formatNumber(result.peakLoad)} lb` : EM_DASH;
    case ScoreType.Reps:
      return result.totalReps !== undefined ? `${formatNumber(result.totalReps)} reps` : EM_DASH;
    case ScoreType.Calories:
      return result.totalCalories !== undefined ? `${result.totalCalories} cal` : EM_DASH;
    case ScoreType.Distance:
      return result.totalDistance !== undefined ? `${formatNumber(result.totalDistance)} m` : EM_DASH;
    default:
      return EM_DASH;
  }
}

export function formatPRValue(value: number, unit: string): string {
  switch (unit) {
    case "seconds":
      return formatSeconds(value);
    case "rounds_reps": {
      const rounds = Math.floor(value / 1000);
      const reps = value % 1000;
      return reps ? `${rounds} + ${reps}` : `${rounds} rounds`;
    }
    case "lbs":
      return `${formatNumber(value)} lb`;
    case "meters":
      return `${formatNumber(value)} m`;
    case "calories":
      return `${value} cal`;
    default:
      return `${formatNumber(value)} ${unit}`;
  }
}

/** "21-15-9 Thruster @ 95 lb" style prescription line. */
export function prescriptionLine(p: MovementPrescription): string {
  const movement = p.movement ?? getMovement(p.movementId);
  const name = movement?.name ?? p.movementId;
  const bits: string[] = [];
  if (p.reps !== undefined) bits.push(`${p.reps}`);
  if (p.calories !== undefined) bits.push(`${p.calories} cal`);
  if (p.distance !== undefined) bits.push(`${p.distance} m`);
  if (p.duration !== undefined) bits.push(`${p.duration}s`);
  const prefix = bits.length ? `${bits.join(" / ")} ` : "";
  const load = p.rxLoad
    ? ` @ ${p.rxLoad.male}/${p.rxLoad.female} lb`
    : p.load !== undefined
      ? ` @ ${p.load} lb`
      : "";
  return `${prefix}${name}${load}`;
}

const FORMAT_LABELS: Record<string, string> = {
  amrap: "AMRAP",
  emom: "EMOM",
  for_time: "For time",
  rounds_for_time: "Rounds for time",
  tabata: "Tabata",
  interval: "Interval",
  strength: "Strength",
  chipper: "Chipper",
  ladder: "Ladder",
};

export function formatLabel(format: WorkoutFormat | string): string {
  return FORMAT_LABELS[format] ?? titleCase(format);
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function relativeDay(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatShortDate(iso);
}

export const TIER_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  rx: "Rx",
  rx_plus: "Rx+",
};
