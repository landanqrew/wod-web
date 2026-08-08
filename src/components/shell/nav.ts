export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/generate", label: "Generate", icon: "bolt" },
  { href: "/history", label: "History", icon: "clock" },
  { href: "/movements", label: "Movements", icon: "barbell" },
  { href: "/benchmarks", label: "Benchmarks", icon: "trophy" },
  { href: "/progress", label: "Progress", icon: "chart" },
  { href: "/insights", label: "Insights", icon: "info" },
  { href: "/programs", label: "Programs", icon: "calendar" },
] as const;

export type NavIcon = (typeof NAV_ITEMS)[number]["icon"];
