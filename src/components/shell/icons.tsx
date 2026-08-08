import {
  BarChart3,
  CalendarDays,
  Clock,
  Dumbbell,
  Flame,
  Home,
  Info,
  Trophy,
  Zap,
} from "lucide-react";
import type { NavIcon } from "./nav";

const MAP = {
  home: Home,
  bolt: Zap,
  clock: Clock,
  barbell: Dumbbell,
  trophy: Trophy,
  chart: BarChart3,
  info: Info,
  calendar: CalendarDays,
} as const;

export function NavGlyph({ icon, size = 18 }: { icon: NavIcon; size?: number }) {
  const Icon = MAP[icon];
  return <Icon size={size} strokeWidth={2} />;
}

/** The volt flame mark. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl bg-primary text-on-primary"
      style={{ width: size, height: size, boxShadow: "0 0 16px color-mix(in srgb, #c8f042 35%, transparent)" }}
    >
      <Flame size={size / 2} strokeWidth={2.2} />
    </span>
  );
}
