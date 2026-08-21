import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { athletes, gymEquipment, gyms, memberships, users } from "../db/schema";
import type { Equipment } from "../domain/models/equipment";
import {
  GymPermission,
  MembershipRole,
  membershipHasPermission,
  type Gym,
  type GymMember,
} from "../domain/models/gym";

export async function getGymMembershipRole(
  gymId: string,
  athleteId: string,
): Promise<MembershipRole | null> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.gymId, gymId),
        eq(memberships.athleteId, athleteId),
      ),
    )
    .limit(1);
  return row ? (row.role as MembershipRole) : null;
}

export async function requireGymPermission(
  gymId: string,
  athleteId: string,
  permission: GymPermission,
): Promise<MembershipRole> {
  const role = await getGymMembershipRole(gymId, athleteId);
  if (!role || !membershipHasPermission(role, permission)) {
    throw new Error("Gym not found");
  }
  return role;
}

export async function getGymsForAthlete(athleteId: string): Promise<Gym[]> {
  const rows = await db
    .select({ gym: gyms, role: memberships.role })
    .from(gyms)
    .innerJoin(
      memberships,
      and(eq(memberships.gymId, gyms.id), eq(memberships.athleteId, athleteId)),
    );
  if (rows.length === 0) return [];

  const floorRows = await db
    .select()
    .from(gymEquipment)
    .where(inArray(gymEquipment.gymId, rows.map(({ gym }) => gym.id)));

  return rows.map((row) => ({
    id: row.gym.id,
    name: row.gym.name,
    recoveryWindowHours: row.gym.recoveryWindowHours,
    membershipRole: row.role as MembershipRole,
    floor: floorRows
      .filter(({ gymId }) => gymId === row.gym.id)
      .map(({ equipment, stationCount }) => ({
        equipment: equipment as Equipment,
        ...(stationCount !== null ? { stationCount } : {}),
      })),
  }));
}

export async function getGymForAthlete(
  gymId: string,
  athleteId: string,
): Promise<Gym | null> {
  const [row] = await db
    .select({ gym: gyms, role: memberships.role })
    .from(gyms)
    .innerJoin(
      memberships,
      and(eq(memberships.gymId, gyms.id), eq(memberships.athleteId, athleteId)),
    )
    .where(eq(gyms.id, gymId))
    .limit(1);
  if (!row) return null;

  const floor = await db
    .select()
    .from(gymEquipment)
    .where(eq(gymEquipment.gymId, gymId));
  return {
    id: row.gym.id,
    name: row.gym.name,
    recoveryWindowHours: row.gym.recoveryWindowHours,
    membershipRole: row.role as MembershipRole,
    floor: floor.map(({ equipment, stationCount }) => ({
      equipment: equipment as Equipment,
      ...(stationCount !== null ? { stationCount } : {}),
    })),
  };
}

export async function getGymMembers(
  gymId: string,
  athleteId: string,
): Promise<GymMember[]> {
  await requireGymPermission(gymId, athleteId, GymPermission.ViewRoster);

  const rows = await db
    .select({
      athleteId: athletes.id,
      name: athletes.name,
      email: users.email,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(athletes, eq(athletes.id, memberships.athleteId))
    .innerJoin(users, eq(users.id, athletes.userId))
    .where(eq(memberships.gymId, gymId));

  return rows.map((row) => ({
    ...row,
    role: row.role as MembershipRole,
  }));
}
