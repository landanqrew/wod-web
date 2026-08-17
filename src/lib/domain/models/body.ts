/** Muscles that a movement trains. */
export enum Muscle {
  Shoulders = "shoulders",
  Chest = "chest",
  UpperBack = "upper_back",
  Lats = "lats",
  Biceps = "biceps",
  Triceps = "triceps",
  Forearms = "forearms",
  // Core
  Core = "core",
  LowerBack = "lower_back",
  Obliques = "obliques",
  // Lower body
  Quads = "quads",
  Hamstrings = "hamstrings",
  Glutes = "glutes",
  Calves = "calves",
  HipFlexors = "hip_flexors",
  Adductors = "adductors",
}

/** Articulations that a movement loads and an Impediment can protect. */
export enum Joint {
  Shoulders = "shoulders",
  Wrists = "wrists",
  Elbows = "elbows",
  Knees = "knees",
  Ankles = "ankles",
  Hips = "hips",
  Spine = "spine",
  Neck = "neck",
}

/** Mechanical movement shapes used only for balance reporting. */
export enum MovementPattern {
  Push = "push",
  Pull = "pull",
  Squat = "squat",
  Hinge = "hinge",
  Core = "core",
  Carry = "carry",
}

/**
 * Movement modality / training domain.
 */
export enum Modality {
  Weightlifting = "weightlifting", // barbell, dumbbell, kettlebell strength
  Gymnastics = "gymnastics", // bodyweight, ring work, handstands
  Monostructural = "monostructural", // run, row, bike, ski, jump rope
  Strongman = "strongman", // sled, sandbag, carries
}
