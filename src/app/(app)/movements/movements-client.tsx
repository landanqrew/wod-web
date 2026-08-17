"use client";

import * as React from "react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { Input, Segmented } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import type { Movement } from "@/lib/domain/models/movement";
import { Modality } from "@/lib/domain/models/body";
import { EM_DASH, titleCase } from "@/lib/format";

export function MovementsClient({ movements }: { movements: Movement[] }) {
  const [query, setQuery] = React.useState("");
  const [modality, setModality] = React.useState<string>("all");

  const filtered = movements.filter((m) => {
    if (modality !== "all" && m.modality !== modality) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.primaryMuscles.some((muscle) => muscle.includes(q)) ||
      m.secondaryMuscles.some((muscle) => muscle.includes(q)) ||
      m.movementPatterns.some((g) => g.includes(q)) ||
      m.equipment.some((e) => e.includes(q))
    );
  });

  return (
    <>
      <PageHeader title="Movements" subtitle={`${filtered.length} of ${movements.length}`} />

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search movements, Muscles, Patterns, equipment…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 max-w-xs rounded-full py-0"
        />
        <Segmented
          value={modality}
          onChange={setModality}
          options={[
            { value: "all", label: "All" },
            ...Object.values(Modality).map((m) => ({ value: m, label: titleCase(m) })),
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="table-head-cell">Movement</th>
                <th className="table-head-cell">Modality</th>
                <th className="table-head-cell">Movement Patterns</th>
                <th className="table-head-cell">Equipment</th>
                <th className="table-head-cell">Tier</th>
                <th className="table-head-cell text-right">Rx load</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="data-row">
                  <td className="px-3 py-1.5">
                    <Link href={`/movements/${m.id}`} className="block font-medium">
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-muted-fg">{titleCase(m.modality)}</td>
                  <td className="px-3 py-1.5 text-muted-fg">
                    {m.movementPatterns.map(titleCase).join(", ") || EM_DASH}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[12px] text-subtle">
                    {m.equipment.map((e) => e.replace(/_/g, " ")).join(", ")}
                  </td>
                  <td className="px-3 py-1.5">
                    <Pill tone="format">{m.difficulty.replace("_", "+")}</Pill>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[13px]">
                    {m.defaultLoadMale ? (
                      `${m.defaultLoadMale} / ${m.defaultLoadFemale ?? EM_DASH}`
                    ) : (
                      <span className="text-subtle">{EM_DASH}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-xs text-subtle">No movements match.</p>
        ) : null}
      </Card>
    </>
  );
}
