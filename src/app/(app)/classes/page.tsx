import { requireAthlete } from "@/lib/data/athlete";
import {
  getClassesForGym,
  getUpcomingClassSessionsForAthlete,
} from "@/lib/data/gym-class";
import { getGymMembers, getGymsForAthlete } from "@/lib/data/gym";
import { MembershipRole } from "@/lib/domain/models/gym";
import { ClassesClient } from "./classes-client";

export default async function ClassesPage() {
  const athlete = await requireAthlete();
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

  return (
    <ClassesClient
      gyms={gyms}
      upcomingSessions={upcomingSessions}
      classesByGym={Object.fromEntries(
        ownerData.map(({ gymId, classes }) => [gymId, classes]),
      )}
      coachesByGym={Object.fromEntries(
        ownerData.map(({ gymId, coaches }) => [gymId, coaches]),
      )}
    />
  );
}
