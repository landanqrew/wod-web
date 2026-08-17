import { describe, expect, it } from "vitest";
import { Equipment } from "../domain/models/equipment";
import { gymInputSchema } from "../validation";

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
