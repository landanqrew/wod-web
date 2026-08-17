import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  athletes,
  gymClasses,
  gymEquipment,
  gyms,
  memberships,
  users,
} from "../db/schema";
import { MembershipRole } from "../domain/models/gym";
import { newId } from "../ids";
import { gymInputSchema, membershipGrantSchema } from "../validation";

export async function createGymForOwner(ownerAthleteId: string, raw: unknown) {
  const input = gymInputSchema.parse(raw);
  const gymId = newId("gym");

  await db.transaction(async (tx) => {
    await tx.insert(gyms).values({
      id: gymId,
      name: input.name,
    });
    await tx.insert(memberships).values({
      gymId,
      athleteId: ownerAthleteId,
      role: MembershipRole.Owner,
    });
    if (input.floor.length > 0) {
      await tx.insert(gymEquipment).values(
        input.floor.map(({ equipment, stationCount }) => ({
          gymId,
          equipment,
          stationCount,
        })),
      );
    }
  });

  return gymId;
}

export async function updateGymForOwner(
  gymId: string,
  ownerAthleteId: string,
  raw: unknown,
) {
  const input = gymInputSchema.parse(raw);

  await db.transaction(async (tx) => {
    const [ownedGym] = await tx
      .update(gyms)
      .set({ name: input.name, updatedAt: new Date() })
      .where(
        and(
          eq(gyms.id, gymId),
          sql`exists (
            select 1 from ${memberships}
            where ${memberships.gymId} = ${gyms.id}
              and ${memberships.athleteId} = ${ownerAthleteId}
              and ${memberships.role} = ${MembershipRole.Owner}
          )`,
        ),
      )
      .returning({ id: gyms.id });
    if (!ownedGym) throw new Error("Gym not found");

    await tx.delete(gymEquipment).where(eq(gymEquipment.gymId, gymId));
    if (input.floor.length > 0) {
      await tx.insert(gymEquipment).values(
        input.floor.map(({ equipment, stationCount }) => ({
          gymId,
          equipment,
          stationCount,
        })),
      );
    }
  });
}

export async function grantGymMembership(
  gymId: string,
  ownerAthleteId: string,
  raw: unknown,
) {
  const input = membershipGrantSchema.parse(raw);

  return db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ athleteId: memberships.athleteId })
      .from(memberships)
      .where(
        and(
          eq(memberships.gymId, gymId),
          eq(memberships.athleteId, ownerAthleteId),
          eq(memberships.role, MembershipRole.Owner),
        ),
      )
      .limit(1);
    if (!owner) throw new Error("Gym not found");

    const [target] = await tx
      .select({ athleteId: athletes.id })
      .from(users)
      .innerJoin(athletes, eq(athletes.userId, users.id))
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    if (!target) throw new Error("Athlete not found");

    const [existing] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.gymId, gymId),
          eq(memberships.athleteId, target.athleteId),
        ),
      )
      .limit(1);
    if (existing?.role === MembershipRole.Owner) {
      throw new Error("The Gym owner role cannot be changed");
    }

    if (existing?.role === MembershipRole.Coach && input.role !== MembershipRole.Coach) {
      await tx
        .update(gymClasses)
        .set({ coachAthleteId: null, updatedAt: new Date() })
        .where(
          and(
            eq(gymClasses.gymId, gymId),
            eq(gymClasses.coachAthleteId, target.athleteId),
          ),
        );
    }

    await tx
      .insert(memberships)
      .values({
        gymId,
        athleteId: target.athleteId,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: [memberships.gymId, memberships.athleteId],
        set: { role: input.role, updatedAt: new Date() },
      });

    return target.athleteId;
  });
}

export async function revokeGymMembership(
  gymId: string,
  ownerAthleteId: string,
  targetAthleteId: string,
) {
  await db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ athleteId: memberships.athleteId })
      .from(memberships)
      .where(
        and(
          eq(memberships.gymId, gymId),
          eq(memberships.athleteId, ownerAthleteId),
          eq(memberships.role, MembershipRole.Owner),
        ),
      )
      .limit(1);
    if (!owner) throw new Error("Gym not found");

    const [target] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.gymId, gymId),
          eq(memberships.athleteId, targetAthleteId),
        ),
      )
      .limit(1);
    if (target?.role === MembershipRole.Owner) {
      throw new Error("The Gym owner cannot be removed");
    }

    if (target?.role === MembershipRole.Coach) {
      await tx
        .update(gymClasses)
        .set({ coachAthleteId: null, updatedAt: new Date() })
        .where(
          and(
            eq(gymClasses.gymId, gymId),
            eq(gymClasses.coachAthleteId, targetAthleteId),
          ),
        );
    }

    await tx
      .delete(memberships)
      .where(
        and(
          eq(memberships.gymId, gymId),
          eq(memberships.athleteId, targetAthleteId),
        ),
      );
  });
}
