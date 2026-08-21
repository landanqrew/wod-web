import { describe, expect, it } from "vitest";
import {
  expandClassSchedule,
  localDateInTimeZone,
} from "./expand-class-schedule";

describe("Class schedule expansion", () => {
  it("derives today from the explicit local time zone instead of UTC", () => {
    const eveningInChicago = new Date("2026-08-18T00:52:00.000Z");
    expect(localDateInTimeZone(eveningInChicago, "America/Chicago")).toBe(
      "2026-08-17",
    );
  });

  it("keeps a Class at its local time across daylight-saving changes", () => {
    const sessions = expandClassSchedule(
      [{ dayOfWeek: 0, localTime: "06:00" }],
      "America/Chicago",
      "2026-03-01",
      "2026-03-15",
    );

    expect(sessions).toEqual([
      { localDate: "2026-03-01", startsAt: new Date("2026-03-01T12:00:00Z") },
      { localDate: "2026-03-08", startsAt: new Date("2026-03-08T11:00:00Z") },
      { localDate: "2026-03-15", startsAt: new Date("2026-03-15T11:00:00Z") },
    ]);
  });

  it("expands one multi-day Class into ordered dated Class Sessions", () => {
    const sessions = expandClassSchedule(
      [
        { dayOfWeek: 1, localTime: "06:00" },
        { dayOfWeek: 3, localTime: "06:00" },
        { dayOfWeek: 5, localTime: "06:00" },
      ],
      "America/Chicago",
      "2026-08-17",
      "2026-08-23",
    );

    expect(sessions.map(({ localDate }) => localDate)).toEqual([
      "2026-08-17",
      "2026-08-19",
      "2026-08-21",
    ]);
  });
});
