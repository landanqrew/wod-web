import { requireAthlete } from "@/lib/data/athlete";
import { getGymMembers, getGymsForAthlete } from "@/lib/data/gym";
import { MembershipRole } from "@/lib/domain/models/gym";
import { GymsClient } from "./gyms-client";

export default async function GymsPage() {
  const athlete = await requireAthlete();
  const gyms = await getGymsForAthlete(athlete.id);
  const memberships = Object.fromEntries(
    await Promise.all(
      gyms
        .filter(({ membershipRole }) => membershipRole !== MembershipRole.Member)
        .map(async (gym) => [
          gym.id,
          await getGymMembers(gym.id, athlete.id),
        ] as const),
    ),
  );
  return <GymsClient gyms={gyms} memberships={memberships} />;
}
