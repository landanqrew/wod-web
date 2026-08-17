import { requireAthlete } from "@/lib/data/athlete";
import {
  getClassesForGym,
  getUpcomingClassSessionsForAthlete,
} from "@/lib/data/gym-class";
import { getGymMembers, getGymsForAthlete } from "@/lib/data/gym";
import { getProgrammedWorkoutForSession } from "@/lib/data/programmed-workout";
import { MembershipRole } from "@/lib/domain/models/gym";
import { ensureUpcomingClassSessions } from "@/lib/training/gym-class";
import { ClassesClient } from "./classes-client";

export default async function ClassesPage() {
  const athlete = await requireAthlete();
  await ensureUpcomingClassSessions(athlete.id);
  const gyms = await getGymsForAthlete(athlete.id);
  const ownerGyms = gyms.filter(
    ({ membershipRole }) => membershipRole === MembershipRole.Owner,
  );
  const [upcomingSessions, ownerData] = await Promise.all([
    getUpcomingClassSessionsForAthlete(athlete.id, new Date()),
    Promise.all(
      ownerGyms.map(async (gym) => ({
        gymId: gym.id,
        classes: await getClassesForGym(gym.id, athlete.id),
        coaches: (await getGymMembers(gym.id, athlete.id)).filter(
          ({ role }) =>
            role === MembershipRole.Owner || role === MembershipRole.Coach,
        ),
      })),
    ),
  ]);
  const programmedWorkouts = await Promise.all(
    upcomingSessions
      .filter(({ workoutPosted, reserved, gymId }) => {
        const role = gyms.find((gym) => gym.id === gymId)?.membershipRole;
        return (
          workoutPosted &&
          (reserved ||
            role === MembershipRole.Owner ||
            role === MembershipRole.Coach)
        );
      })
      .map(async (session) => [
        session.id,
        (await getProgrammedWorkoutForSession(session.id, athlete.id))?.workout,
      ] as const),
  );

  return (
    <ClassesClient
      gyms={gyms}
      upcomingSessions={upcomingSessions}
      programmedWorkoutsBySession={Object.fromEntries(programmedWorkouts)}
      classesByGym={Object.fromEntries(
        ownerData.map(({ gymId, classes }) => [gymId, classes]),
      )}
      coachesByGym={Object.fromEntries(
        ownerData.map(({ gymId, coaches }) => [gymId, coaches]),
      )}
    />
  );
}
