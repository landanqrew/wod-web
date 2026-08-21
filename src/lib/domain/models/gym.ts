import type { Equipment } from "./equipment";

export enum MembershipRole {
  Owner = "owner",
  Coach = "coach",
  Member = "member",
}

export enum GymPermission {
  View = "view",
  Program = "program",
  ViewRoster = "view_roster",
  ManageFloor = "manage_floor",
  ManageMemberships = "manage_memberships",
}

export function membershipHasPermission(
  role: MembershipRole,
  permission: GymPermission,
): boolean {
  if (permission === GymPermission.View) return true;
  if (
    permission === GymPermission.Program ||
    permission === GymPermission.ViewRoster
  ) {
    return role === MembershipRole.Owner || role === MembershipRole.Coach;
  }
  return role === MembershipRole.Owner;
}

export interface GymFloorEntry {
  equipment: Equipment;
  stationCount?: number;
}

export interface Gym {
  id: string;
  name: string;
  recoveryWindowHours: number;
  membershipRole: MembershipRole;
  floor: GymFloorEntry[];
}

export interface GymMember {
  athleteId: string;
  name: string;
  email: string;
  role: MembershipRole;
}
