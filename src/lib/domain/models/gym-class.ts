import type { WeeklyClassTime } from "../scheduling/expand-class-schedule";

export interface GymClass {
  id: string;
  gymId: string;
  name: string;
  coachAthleteId: string | null;
  coachName: string | null;
  weeklyTimes: WeeklyClassTime[];
  timeZone: string;
  capacity: number;
}

export interface ClassSessionSummary {
  id: string;
  classId: string;
  className: string;
  gymId: string;
  gymName: string;
  startsAt: Date;
  localDate: string;
  timeZone: string;
  coachName: string | null;
  capacity: number;
  cancelled: boolean;
}
