export interface WeeklyClassTime {
  /** Sunday = 0 through Saturday = 6. */
  dayOfWeek: number;
  /** Wall-clock time in HH:mm form. */
  localTime: string;
}

export interface ExpandedClassSession {
  localDate: string;
  startsAt: Date;
}

export function localDateInTimeZone(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDateTimeToInstant(
  localDate: string,
  localTime: string,
  timeZone: string,
): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const desiredWallTime = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  let instant = desiredWallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter(({ type }) => type !== "literal")
        .map(({ type, value }) => [type, Number(value)]),
    );
    const representedWallTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const correction = desiredWallTime - representedWallTime;
    if (correction === 0) return new Date(instant);
    instant += correction;
  }

  throw new RangeError(
    `${localDate} ${localTime} is not a valid local time in ${timeZone}`,
  );
}

export function expandClassSchedule(
  weeklyTimes: readonly WeeklyClassTime[],
  timeZone: string,
  startDate: string,
  endDate: string,
): ExpandedClassSession[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (
    !Number.isFinite(start.valueOf()) ||
    !Number.isFinite(end.valueOf()) ||
    start > end
  ) {
    throw new RangeError("Class Session date range is invalid");
  }

  const sessions: ExpandedClassSession[] = [];
  for (
    let date = start;
    date <= end;
    date = new Date(date.valueOf() + 86_400_000)
  ) {
    const localDate = date.toISOString().slice(0, 10);
    for (const weeklyTime of weeklyTimes) {
      if (weeklyTime.dayOfWeek !== date.getUTCDay()) continue;
      sessions.push({
        localDate,
        startsAt: localDateTimeToInstant(
          localDate,
          weeklyTime.localTime,
          timeZone,
        ),
      });
    }
  }

  return sessions.sort(
    (left, right) => left.startsAt.valueOf() - right.startsAt.valueOf(),
  );
}
