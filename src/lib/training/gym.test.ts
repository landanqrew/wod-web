import { describe, expect, it } from "vitest";
import { Equipment } from "../domain/models/equipment";
import {
  GymPermission,
  MembershipRole,
  membershipHasPermission,
} from "../domain/models/gym";
import { gymInputSchema, membershipGrantSchema } from "../validation";

describe("Gym membership authorisation", () => {
  it("lets every Member view a Gym but reserves management for its role", () => {
    expect(membershipHasPermission(MembershipRole.Member, GymPermission.View)).toBe(
      true,
    );
    expect(
      membershipHasPermission(MembershipRole.Member, GymPermission.Program),
    ).toBe(false);

    expect(membershipHasPermission(MembershipRole.Coach, GymPermission.View)).toBe(
      true,
    );
    expect(
      membershipHasPermission(MembershipRole.Coach, GymPermission.Program),
    ).toBe(true);
    expect(
      membershipHasPermission(MembershipRole.Coach, GymPermission.ManageFloor),
    ).toBe(false);

    expect(
      membershipHasPermission(MembershipRole.Owner, GymPermission.ManageFloor),
    ).toBe(true);
    expect(
      membershipHasPermission(MembershipRole.Owner, GymPermission.ManageMemberships),
    ).toBe(true);
  });

  it("grants only coach or member roles to an existing account email", () => {
    expect(
      membershipGrantSchema.parse({
        email: "  COACH@example.com ",
        role: MembershipRole.Coach,
      }),
    ).toEqual({ email: "coach@example.com", role: MembershipRole.Coach });

    expect(() =>
      membershipGrantSchema.parse({
        email: "owner@example.com",
        role: MembershipRole.Owner,
      }),
    ).toThrow();
  });
});

describe("Gym floor input", () => {
  it("accepts equipment with optional Station counts", () => {
    expect(
      gymInputSchema.parse({
        name: "Iron Ridge",
        floor: [
          { equipment: Equipment.Rower, stationCount: 12 },
          { equipment: Equipment.Barbell },
        ],
      }),
    ).toEqual({
      name: "Iron Ridge",
      floor: [
        { equipment: Equipment.Rower, stationCount: 12 },
        { equipment: Equipment.Barbell },
      ],
    });
  });

  it("rejects duplicate equipment and invalid Station counts", () => {
    expect(() =>
      gymInputSchema.parse({
        name: "Iron Ridge",
        floor: [
          { equipment: Equipment.Rower, stationCount: 0 },
          { equipment: Equipment.Rower, stationCount: 4 },
        ],
      }),
    ).toThrow();
  });

  it("rejects the internal bodyweight sentinel as floor equipment", () => {
    expect(() =>
      gymInputSchema.parse({
        name: "Iron Ridge",
        floor: [{ equipment: Equipment.None }],
      }),
    ).toThrow();
  });
});
