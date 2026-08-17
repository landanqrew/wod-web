import type { Workout } from "../models/workout";
import type { Movement } from "../models/movement";
import { Joint, Muscle, Modality } from "../models/body";
import { getMovement } from "../movements/library";

/**
 * A warm-up drill with description and target muscles.
 */
export interface WarmUpDrill {
  name: string;
  durationOrReps: string;
  targetMuscles: Muscle[];
  targetJoints?: Joint[];
  notes?: string;
}

/**
 * General warm-up drills (always included).
 */
const GENERAL_WARMUP: WarmUpDrill[] = [
  {
    name: "Easy Jog / Row",
    durationOrReps: "2 min",
    targetMuscles: [],
    notes: "Get blood flowing at conversational pace",
  },
  {
    name: "Jumping Jacks",
    durationOrReps: "20 reps",
    targetMuscles: [Muscle.Shoulders, Muscle.Calves],
  },
];

/**
 * Region-specific mobility and activation drills.
 */
const BODY_PART_DRILLS: Record<string, WarmUpDrill[]> = {
  [Muscle.Shoulders]: [
    {
      name: "Arm Circles",
      durationOrReps: "10 each direction",
      targetMuscles: [Muscle.Shoulders],
    },
    {
      name: "PVC Pass-throughs",
      durationOrReps: "10 reps",
      targetMuscles: [Muscle.Shoulders, Muscle.Chest],
    },
    {
      name: "Band Pull-Aparts",
      durationOrReps: "15 reps",
      targetMuscles: [Muscle.Shoulders, Muscle.UpperBack],
    },
  ],
  [Joint.Hips]: [
    {
      name: "Hip Circles",
      durationOrReps: "10 each direction",
      targetMuscles: [Muscle.Glutes],
      targetJoints: [Joint.Hips],
    },
    {
      name: "Pigeon Stretch",
      durationOrReps: "30s each side",
      targetMuscles: [Muscle.Glutes],
      targetJoints: [Joint.Hips],
    },
  ],
  [Muscle.Quads]: [
    {
      name: "Walking Quad Stretch",
      durationOrReps: "10 each side",
      targetMuscles: [Muscle.Quads, Muscle.HipFlexors],
    },
    {
      name: "Bodyweight Squats",
      durationOrReps: "10 reps",
      targetMuscles: [Muscle.Quads, Muscle.Glutes],
    },
  ],
  [Muscle.Hamstrings]: [
    {
      name: "Inchworms",
      durationOrReps: "5 reps",
      targetMuscles: [Muscle.Hamstrings, Muscle.Core],
    },
    {
      name: "Good Mornings (empty bar or BW)",
      durationOrReps: "10 reps",
      targetMuscles: [Muscle.Hamstrings, Muscle.LowerBack],
    },
  ],
  [Muscle.Glutes]: [
    {
      name: "Glute Bridges",
      durationOrReps: "10 reps",
      targetMuscles: [Muscle.Glutes, Muscle.Hamstrings],
    },
    {
      name: "Clamshells",
      durationOrReps: "10 each side",
      targetMuscles: [Muscle.Glutes],
      targetJoints: [Joint.Hips],
    },
  ],
  [Muscle.Core]: [
    {
      name: "Dead Bugs",
      durationOrReps: "10 reps",
      targetMuscles: [Muscle.Core],
    },
    {
      name: "Plank Hold",
      durationOrReps: "30s",
      targetMuscles: [Muscle.Core, Muscle.Shoulders],
    },
  ],
  [Muscle.Chest]: [
    {
      name: "Push-Up to Down Dog",
      durationOrReps: "8 reps",
      targetMuscles: [Muscle.Chest, Muscle.Shoulders],
    },
  ],
  [Muscle.UpperBack]: [
    {
      name: "Cat-Cow Stretch",
      durationOrReps: "10 reps",
      targetMuscles: [Muscle.UpperBack, Muscle.LowerBack],
    },
    {
      name: "Scapular Pull-Ups",
      durationOrReps: "10 reps",
      targetMuscles: [Muscle.UpperBack, Muscle.Lats],
    },
  ],
  [Joint.Wrists]: [
    {
      name: "Wrist Circles",
      durationOrReps: "10 each direction",
      targetMuscles: [],
      targetJoints: [Joint.Wrists],
    },
    {
      name: "Wrist Flexor Stretch",
      durationOrReps: "20s each",
      targetMuscles: [Muscle.Forearms],
      targetJoints: [Joint.Wrists],
    },
  ],
  [Joint.Ankles]: [
    {
      name: "Ankle Circles",
      durationOrReps: "10 each direction",
      targetMuscles: [Muscle.Calves],
      targetJoints: [Joint.Ankles],
    },
    {
      name: "Wall Ankle Stretch",
      durationOrReps: "30s each side",
      targetMuscles: [Muscle.Calves],
      targetJoints: [Joint.Ankles],
    },
  ],
  [Muscle.LowerBack]: [
    {
      name: "Cat-Cow Stretch",
      durationOrReps: "10 reps",
      targetMuscles: [Muscle.LowerBack, Muscle.Core],
    },
    {
      name: "Scorpion Stretch",
      durationOrReps: "5 each side",
      targetMuscles: [Muscle.LowerBack],
      targetJoints: [Joint.Hips],
    },
  ],
  [Muscle.Calves]: [
    {
      name: "Calf Raises",
      durationOrReps: "15 reps",
      targetMuscles: [Muscle.Calves],
    },
  ],
};

/**
 * Modality-specific warm-up additions.
 */
const MODALITY_WARMUP: Partial<Record<Modality, WarmUpDrill[]>> = {
  [Modality.Weightlifting]: [
    {
      name: "Empty Barbell Complex",
      durationOrReps: "5 reps each",
      targetMuscles: [Muscle.Shoulders],
      targetJoints: [Joint.Hips],
      notes: "Deadlift, Hang Clean, Front Squat, Press, Back Squat",
    },
  ],
  [Modality.Gymnastics]: [
    {
      name: "Hollow Body Hold",
      durationOrReps: "20s",
      targetMuscles: [Muscle.Core],
    },
    {
      name: "Kipping Swings",
      durationOrReps: "10 reps",
      targetMuscles: [Muscle.Shoulders, Muscle.Core],
      notes: "If pull-up bar movements are in the WOD",
    },
  ],
  [Modality.Monostructural]: [
    {
      name: "Dynamic Stretching",
      durationOrReps: "1 min",
      targetMuscles: [Muscle.Quads, Muscle.Hamstrings, Muscle.Calves],
      notes: "High knees, butt kicks, leg swings",
    },
  ],
};

/**
 * Analyze a workout and generate a movement-specific warm-up.
 */
export function generateWarmUp(workout: Workout): WarmUpDrill[] {
  const drills: WarmUpDrill[] = [];
  const usedDrillNames = new Set<string>();

  // 1. Always start with general warm-up
  for (const drill of GENERAL_WARMUP) {
    drills.push(drill);
    usedDrillNames.add(drill.name);
  }

  // 2. Collect all body muscles and modalities from the workout
  const muscles = new Set<Muscle>();
  const joints = new Set<Joint>();
  const modalities = new Set<Modality>();

  for (const p of workout.movements) {
    const movement: Movement | undefined =
      p.movement ?? getMovement(p.movementId);
    if (!movement) continue;

    modalities.add(movement.modality);
    for (const r of movement.primaryMuscles) muscles.add(r);
    for (const r of movement.secondaryMuscles) muscles.add(r);
    for (const joint of movement.loadedJoints) joints.add(joint);
  }

  // 3. Add muscle-specific drills (pick 1 per muscle to keep warm-up concise)
  for (const muscle of muscles) {
    const muscleDrills = BODY_PART_DRILLS[muscle];
    if (!muscleDrills) continue;

    // Pick the first drill we haven't used yet
    for (const drill of muscleDrills) {
      if (!usedDrillNames.has(drill.name)) {
        drills.push(drill);
        usedDrillNames.add(drill.name);
        break;
      }
    }
  }

  for (const joint of joints) {
    const jointDrills = BODY_PART_DRILLS[joint];
    if (!jointDrills) continue;

    for (const drill of jointDrills) {
      if (!usedDrillNames.has(drill.name)) {
        drills.push(drill);
        usedDrillNames.add(drill.name);
        break;
      }
    }
  }

  // 4. Add modality-specific drills
  for (const modality of modalities) {
    const modalityDrills = MODALITY_WARMUP[modality];
    if (!modalityDrills) continue;

    for (const drill of modalityDrills) {
      if (!usedDrillNames.has(drill.name)) {
        drills.push(drill);
        usedDrillNames.add(drill.name);
      }
    }
  }

  return drills;
}

/**
 * Generate simple cool-down stretches targeting the muscles used in the workout.
 */
export interface CoolDownDrill {
  name: string;
  duration: string;
  targetMuscles: Muscle[];
  targetJoints?: Joint[];
}

const COOLDOWN_DRILLS: CoolDownDrill[] = [
  { name: "Easy Walk / Slow Row", duration: "2 min", targetMuscles: [] },
  {
    name: "Standing Forward Fold",
    duration: "30s",
    targetMuscles: [Muscle.Hamstrings, Muscle.LowerBack],
  },
  {
    name: "Couch Stretch",
    duration: "30s each side",
    targetMuscles: [Muscle.Quads, Muscle.HipFlexors],
  },
  {
    name: "Child's Pose",
    duration: "30s",
    targetMuscles: [Muscle.LowerBack, Muscle.Shoulders, Muscle.Lats],
  },
  {
    name: "Pigeon Stretch",
    duration: "30s each side",
    targetMuscles: [Muscle.Glutes],
    targetJoints: [Joint.Hips],
  },
  {
    name: "Doorway Chest Stretch",
    duration: "30s each side",
    targetMuscles: [Muscle.Chest, Muscle.Shoulders],
  },
  {
    name: "Cross-Body Shoulder Stretch",
    duration: "30s each side",
    targetMuscles: [Muscle.Shoulders],
  },
  {
    name: "Lying Spinal Twist",
    duration: "30s each side",
    targetMuscles: [Muscle.LowerBack, Muscle.Obliques],
  },
];

/**
 * Generate a cool-down based on the workout's target muscles.
 */
export function generateCoolDown(workout: Workout): CoolDownDrill[] {
  const muscles = new Set<Muscle>();

  for (const p of workout.movements) {
    const movement: Movement | undefined =
      p.movement ?? getMovement(p.movementId);
    if (!movement) continue;
    for (const r of movement.primaryMuscles) muscles.add(r);
  }

  const drills: CoolDownDrill[] = [];

  // Always include the easy walk
  drills.push(COOLDOWN_DRILLS[0]);

  // Pick stretches that target the worked muscles
  for (const drill of COOLDOWN_DRILLS.slice(1)) {
    if (drill.targetMuscles.some((r) => muscles.has(r))) {
      drills.push(drill);
    }
  }

  // Ensure at least 3 stretches
  if (drills.length < 4) {
    for (const drill of COOLDOWN_DRILLS.slice(1)) {
      if (!drills.includes(drill)) {
        drills.push(drill);
        if (drills.length >= 4) break;
      }
    }
  }

  return drills;
}
