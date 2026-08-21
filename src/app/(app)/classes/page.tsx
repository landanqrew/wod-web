import { requireAthlete } from "@/lib/data/athlete";
import { getClassesForGym, getUpcomingClassSessionsForAthlete } from "@/lib/data/gym-class";
import { getGymMembers, getGymsForAthlete } from "@/lib/data/gym";
import { getProgrammedWorkoutForSession } from "@/lib/data/programmed-workout";
import { getAssignedWorkoutForAthlete } from "@/lib/data/assigned-workout";
import { getGymLibrary } from "@/lib/data/gym-library";
import { getBenchmarkWorkouts } from "@/lib/data/training";
import { MembershipRole } from "@/lib/domain/models/gym";
import { getAllMovements } from "@/lib/domain/movements/library";
import { checkMovement, mergeConstraints } from "@/lib/domain/scaling/constraint-engine";
import { ensureUpcomingClassSessions } from "@/lib/training/gym-class";
import { ensureAssignedWorkoutsForAthlete } from "@/lib/training/assigned-workout";
import { ClassesClient } from "./classes-client";

export default async function ClassesPage() {
  const athlete = await requireAthlete();
  await ensureUpcomingClassSessions(athlete.id);
  await ensureAssignedWorkoutsForAthlete(athlete.id);
  const gyms = await getGymsForAthlete(athlete.id);
  const ownerGyms = gyms.filter(({ membershipRole }) => membershipRole === MembershipRole.Owner);
  const programmingGyms = gyms.filter(
    ({ membershipRole }) => membershipRole === MembershipRole.Owner || membershipRole === MembershipRole.Coach,
  );
  const [upcomingSessions, ownerData, libraryData, globalBenchmarks] = await Promise.all([
    getUpcomingClassSessionsForAthlete(athlete.id, new Date()),
    Promise.all(
      ownerGyms.map(async (gym) => ({
        gymId: gym.id,
        classes: await getClassesForGym(gym.id, athlete.id),
        coaches: (await getGymMembers(gym.id, athlete.id)).filter(
          ({ role }) => role === MembershipRole.Owner || role === MembershipRole.Coach,
        ),
      })),
    ),
    Promise.all(
      programmingGyms.map(async (gym) => [gym.id, await getGymLibrary(gym.id, athlete.id)] as const),
    ),
    getBenchmarkWorkouts(),
  ]);
  const programmedWorkouts = await Promise.all(
    upcomingSessions
      .filter(({ workoutPosted, reserved, gymId }) => {
        const role = gyms.find((gym) => gym.id === gymId)?.membershipRole;
        return workoutPosted && (reserved || role === MembershipRole.Owner || role === MembershipRole.Coach);
      })
      .map(
        async (session) =>
          [session.id, (await getProgrammedWorkoutForSession(session.id, athlete.id))?.workout] as const,
      ),
  );
  const assignedWorkouts = await Promise.all(
    upcomingSessions
      .filter(({ reserved }) => reserved)
      .map(async (session) => [session.id, await getAssignedWorkoutForAthlete(session.id, athlete.id)] as const),
  );
  const assignedWorkoutsBySession = Object.fromEntries(assignedWorkouts);
  const movementOptionsBySession = Object.fromEntries(
    upcomingSessions.map((session) => {
      const floor = new Set(gyms.find(({ id }) => id === session.gymId)?.floor.map(({ equipment }) => equipment) ?? []);
      const activeImpediments = athlete.impediments.filter(
        ({ startDate, endDate }) =>
          startDate <= session.localDate && (endDate === undefined || endDate >= session.localDate),
      );
      const constraints = mergeConstraints(activeImpediments);
      const assignedMovementIds = new Set(
        assignedWorkoutsBySession[session.id]?.workout.movements.map(({ movementId }) => movementId) ?? [],
      );
      return [
        session.id,
        getAllMovements()
          .map((movement) => ({
            ...movement,
            available: checkMovement(movement, constraints, floor).allowed,
          }))
          .filter(({ id, available }) => available || assignedMovementIds.has(id))
          .map(({ id, name, loadType, available }) => ({
            id,
            name,
            loadType,
            available,
          })),
      ];
    }),
  );

  return (
    <ClassesClient
      gyms={gyms}
      upcomingSessions={upcomingSessions}
      programmedWorkoutsBySession={Object.fromEntries(programmedWorkouts)}
      assignedWorkoutsBySession={assignedWorkoutsBySession}
      classesByGym={Object.fromEntries(ownerData.map(({ gymId, classes }) => [gymId, classes]))}
      coachesByGym={Object.fromEntries(ownerData.map(({ gymId, coaches }) => [gymId, coaches]))}
      movementOptionsBySession={movementOptionsBySession}
      libraryWorkoutsByGym={Object.fromEntries(libraryData)}
      globalBenchmarks={globalBenchmarks}
    />
  );
}
