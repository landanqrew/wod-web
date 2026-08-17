import { db } from "@/lib/db";
import { athletes, impediments } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { impedimentInputSchema, onboardingSchema } from "@/lib/validation";
import type { MovementConstraint } from "@/lib/domain/models/impediment";
import {
  ImpedimentCategory,
  ImpedimentSeverity,
  buildInjuryConstraints,
  buildPostpartumConstraints,
  buildPregnancyConstraints,
} from "@/lib/domain/models/impediment";
import type { Joint, Muscle } from "@/lib/domain/models/body";
import type { z } from "zod";

export type ImpedimentInput = z.infer<typeof impedimentInputSchema>;

/** Constraints are always derived here — never trusted from the client. */
export function deriveConstraints(input: ImpedimentInput): MovementConstraint {
  if (input.category === ImpedimentCategory.Pregnancy) {
    return buildPregnancyConstraints(input.trimester ?? 1);
  }
  if (input.category === ImpedimentCategory.Postpartum) {
    return buildPostpartumConstraints(input.weeksPostpartum ?? 0);
  }
  return buildInjuryConstraints(
    {
      muscles: input.affectedMuscles as Muscle[],
      joints: input.affectedJoints as Joint[],
    },
    input.severity as ImpedimentSeverity
  );
}

function impedimentRow(athleteId: string, input: ImpedimentInput) {
  return {
    id: newId("imp"),
    athleteId,
    category: input.category,
    severity: input.severity,
    affectedMuscles: input.affectedMuscles,
    affectedJoints: input.affectedJoints,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    trimester: input.trimester ?? null,
    weeksPostpartum: input.weeksPostpartum ?? null,
    constraints: deriveConstraints(input),
  };
}

/** Create the athlete profile a user owns, plus any impediments they declared. */
export async function createAthleteProfile(userId: string, raw: unknown): Promise<string> {
  const input = onboardingSchema.parse(raw);
  const athleteId = newId("ath");

  await db.insert(athletes).values({
    id: athleteId,
    userId,
    name: input.name,
    sex: input.sex,
    equipment: input.equipment,
    preferredDuration: input.preferredDuration,
    framework: input.framework ?? null,
  });

  if (input.impediments.length > 0) {
    await db
      .insert(impediments)
      .values(input.impediments.map((imp) => impedimentRow(athleteId, imp)));
  }

  return athleteId;
}

export async function addImpedimentFor(athleteId: string, raw: unknown): Promise<void> {
  const input = impedimentInputSchema.parse(raw);
  await db.insert(impediments).values(impedimentRow(athleteId, input));
}
