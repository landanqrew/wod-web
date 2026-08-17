import { describe, expect, it } from "vitest";
import { gymClassInputSchema } from "../validation";

describe("Class definition input", () => {
  it("accepts one Class with several weekly times and an IANA time zone", () => {
    expect(
      gymClassInputSchema.parse({
        name: "6am CrossFit",
        coachAthleteId: "ath_coach",
        weeklyTimes: [
          { dayOfWeek: 1, localTime: "06:00" },
          { dayOfWeek: 3, localTime: "06:00" },
          { dayOfWeek: 5, localTime: "06:00" },
        ],
        timeZone: "America/Chicago",
        capacity: 25,
      }),
    ).toMatchObject({
      name: "6am CrossFit",
      weeklyTimes: expect.arrayContaining([
        { dayOfWeek: 1, localTime: "06:00" },
        { dayOfWeek: 3, localTime: "06:00" },
        { dayOfWeek: 5, localTime: "06:00" },
      ]),
      timeZone: "America/Chicago",
      capacity: 25,
    });
  });

  it("rejects invalid local times, time zones, and duplicate weekly times", () => {
    for (const input of [
      {
        name: "Bad time",
        coachAthleteId: "ath_coach",
        weeklyTimes: [{ dayOfWeek: 1, localTime: "25:00" }],
        timeZone: "America/Chicago",
        capacity: 25,
      },
      {
        name: "Bad zone",
        coachAthleteId: "ath_coach",
        weeklyTimes: [{ dayOfWeek: 1, localTime: "06:00" }],
        timeZone: "Central-ish",
        capacity: 25,
      },
      {
        name: "Duplicate",
        coachAthleteId: "ath_coach",
        weeklyTimes: [
          { dayOfWeek: 1, localTime: "06:00" },
          { dayOfWeek: 1, localTime: "17:00" },
        ],
        timeZone: "America/Chicago",
        capacity: 25,
      },
    ]) {
      expect(() => gymClassInputSchema.parse(input)).toThrow();
    }
  });
});
