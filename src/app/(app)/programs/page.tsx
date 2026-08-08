import { requireAthlete } from "@/lib/data/athlete";
import { ProgramsClient } from "./programs-client";

export default async function ProgramsPage() {
  await requireAthlete();
  return <ProgramsClient />;
}
