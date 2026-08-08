import { requireAthlete } from "@/lib/data/athlete";
import { AppShell } from "@/components/shell/app-shell";
import { titleCase } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const athlete = await requireAthlete();
  const meta = [
    `${athlete.equipment.size} equipment`,
    athlete.impediments.length
      ? `${athlete.impediments.length} impediment${athlete.impediments.length > 1 ? "s" : ""}`
      : titleCase(athlete.sex),
  ].join(" · ");

  return (
    <AppShell athleteName={athlete.name} athleteMeta={meta}>
      {children}
    </AppShell>
  );
}
