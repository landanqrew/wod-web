import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { gymEquipment, gyms } from "../db/schema";
import { newId } from "../ids";
import { gymInputSchema } from "../validation";

export async function createGymForOwner(ownerAthleteId: string, raw: unknown) {
  const input = gymInputSchema.parse(raw);
  const gymId = newId("gym");

  await db.transaction(async (tx) => {
    await tx.insert(gyms).values({
      id: gymId,
      name: input.name,
      ownerAthleteId,
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
      .where(and(eq(gyms.id, gymId), eq(gyms.ownerAthleteId, ownerAthleteId)))
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
