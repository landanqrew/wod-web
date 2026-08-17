import { Joint, Muscle } from "./body";

/**
 * Categories of physical impediments that affect movement selection.
 *
 * Each impediment type carries different constraints:
 * - Some eliminate movements entirely (e.g., no inversions during pregnancy)
 * - Some reduce load/intensity (e.g., rehabbing a joint)
 * - Some substitute movement patterns (e.g., no impact -> bike instead of run)
 */
export enum ImpedimentCategory {
  /** Pregnancy -- trimester matters for constraint severity */
  Pregnancy = "pregnancy",
  /** Postpartum recovery -- weeks/months postpartum affects constraints */
  Postpartum = "postpartum",
  /** Acute injury -- recently occurred, still healing */
  AcuteInjury = "acute_injury",
  /** Chronic condition -- ongoing, managed */
  ChronicCondition = "chronic_condition",
  /** Rehab -- actively rehabbing a specific area */
  Rehab = "rehab",
  /** Mobility limitation -- restricted range of motion */
  MobilityLimitation = "mobility_limitation",
  /** Medical restriction -- doctor-imposed constraint */
  MedicalRestriction = "medical_restriction",
  /** Temporary soreness or fatigue in a region */
  Soreness = "soreness",
}

/**
 * Severity affects how aggressively we constrain movement selection.
 */
export enum ImpedimentSeverity {
  /** Mild -- prefer alternatives but movement is possible with modification */
  Mild = "mild",
  /** Moderate -- avoid direct stress, use scaled alternatives */
  Moderate = "moderate",
  /** Severe -- completely avoid all movements stressing this area */
  Severe = "severe",
}

/**
 * Movement constraints that an impediment imposes.
 * These are the building blocks the substitution engine uses.
 */
export interface MovementConstraint {
  /** Muscles that should be protected */
  avoidMuscles: Muscle[];
  /** Joints that should be protected */
  avoidJoints: Joint[];
  /** Specific movement patterns to avoid (by movement tag) */
  avoidTags: string[];
  /** Maximum percentage of 1RM allowed (undefined = no load restriction) */
  maxLoadPercent?: number;
  /** Whether high-impact movements are allowed */
  allowHighImpact: boolean;
  /** Whether overhead movements are allowed */
  allowOverhead: boolean;
  /** Whether inverted positions are allowed */
  allowInversion: boolean;
  /** Whether prone/supine (lying face down/up) positions are ok */
  allowProne: boolean;
  /** Whether kipping/ballistic movements are allowed */
  allowKipping: boolean;
  /** Whether heavy axial loading (spine compression) is allowed */
  allowHeavyAxialLoad: boolean;
  /** Free-text notes for the athlete/coach */
  notes?: string;
}

export interface AffectedBodyParts {
  muscles: Muscle[];
  joints: Joint[];
}

/**
 * An active impediment on an athlete's profile.
 */
export interface Impediment {
  id: string;
  category: ImpedimentCategory;
  severity: ImpedimentSeverity;
  /** Affected Muscles */
  affectedMuscles: Muscle[];
  /** Affected Joints */
  affectedJoints: Joint[];
  /** Human-readable description (e.g., "Left knee ACL rehab - 8 weeks post-op") */
  description: string;
  /** When this impediment started */
  startDate: string;
  /** Expected end date, if known */
  endDate?: string;
  /** Additional detail for pregnancy/postpartum */
  trimester?: 1 | 2 | 3;
  weeksPostpartum?: number;
  /** The computed constraints this impediment produces */
  constraints: MovementConstraint;
}

/**
 * Preset constraint builders for common impediments.
 * These provide sensible defaults that users can customize.
 */
export function buildPregnancyConstraints(
  trimester: 1 | 2 | 3
): MovementConstraint {
  const base: MovementConstraint = {
    avoidMuscles: [],
    avoidJoints: [],
    avoidTags: [],
    allowHighImpact: true,
    allowOverhead: true,
    allowInversion: false, // no inversions any trimester
    allowProne: true,
    allowKipping: true,
    allowHeavyAxialLoad: true,
    notes: `Pregnancy trimester ${trimester} defaults. Always consult physician.`,
  };

  if (trimester === 1) {
    // First trimester: minimal restrictions beyond inversions
    // Athlete may continue current programming with awareness
    return {
      ...base,
      avoidTags: ["max_effort"],
      notes:
        "First trimester: avoid max-effort lifts. Continue normal training with awareness. Consult physician.",
    };
  }

  if (trimester === 2) {
    return {
      ...base,
      avoidMuscles: [Muscle.Core],
      avoidTags: ["max_effort", "high_skill"],
      allowHighImpact: false,
      allowProne: false,
      allowKipping: false,
      allowHeavyAxialLoad: false,
      maxLoadPercent: 70,
      notes:
        "Second trimester: no prone, no kipping, reduce loads, modify core work to avoid coning. Consult physician.",
    };
  }

  // Trimester 3
  return {
    ...base,
    avoidMuscles: [Muscle.Core, Muscle.LowerBack],
    avoidTags: ["max_effort", "high_skill", "complex"],
    allowHighImpact: false,
    allowOverhead: false,
    allowProne: false,
    allowKipping: false,
    allowHeavyAxialLoad: false,
    maxLoadPercent: 50,
    notes:
      "Third trimester: significant modifications. Focus on maintenance, mobility, and comfort. Consult physician.",
  };
}

export function buildPostpartumConstraints(
  weeksPostpartum: number
): MovementConstraint {
  if (weeksPostpartum < 6) {
    return {
      avoidMuscles: [Muscle.Core, Muscle.LowerBack, Muscle.HipFlexors],
      avoidJoints: [],
      avoidTags: ["max_effort", "high_skill", "complex"],
      allowHighImpact: false,
      allowOverhead: false,
      allowInversion: false,
      allowProne: false,
      allowKipping: false,
      allowHeavyAxialLoad: false,
      maxLoadPercent: 30,
      notes:
        "Early postpartum (<6 weeks): walking, gentle mobility only. Must have physician clearance to train.",
    };
  }

  if (weeksPostpartum < 12) {
    return {
      avoidMuscles: [Muscle.Core],
      avoidJoints: [],
      avoidTags: ["max_effort", "high_skill"],
      allowHighImpact: false,
      allowOverhead: true,
      allowInversion: false,
      allowProne: true,
      allowKipping: false,
      allowHeavyAxialLoad: false,
      maxLoadPercent: 50,
      notes:
        "Postpartum 6-12 weeks: gradual return. Rebuild core and pelvic floor before adding intensity. Consult physician.",
    };
  }

  // 12+ weeks
  return {
    avoidMuscles: [],
    avoidJoints: [],
    avoidTags: ["max_effort"],
    allowHighImpact: true,
    allowOverhead: true,
    allowInversion: true,
    allowProne: true,
    allowKipping: false, // still cautious with kipping
    allowHeavyAxialLoad: true,
    maxLoadPercent: 80,
    notes:
      "Postpartum 12+ weeks: most movements available. Progress kipping and max loads gradually. Consult physician.",
  };
}

export function buildInjuryConstraints(
  affected: AffectedBodyParts,
  severity: ImpedimentSeverity
): MovementConstraint {
  const affectedNames = [...affected.muscles, ...affected.joints];

  switch (severity) {
    case ImpedimentSeverity.Mild:
      return {
        avoidMuscles: [],
        avoidJoints: [],
        avoidTags: ["max_effort"],
        allowHighImpact: true,
        allowOverhead: true,
        allowInversion: true,
        allowProne: true,
        allowKipping: true,
        allowHeavyAxialLoad: true,
        maxLoadPercent: 80,
        notes: `Mild issue in ${affectedNames.join(", ")}. Reduce load, monitor pain. Stop if pain increases.`,
      };
    case ImpedimentSeverity.Moderate:
      return {
        avoidMuscles: affected.muscles,
        avoidJoints: affected.joints,
        avoidTags: ["max_effort", "high_skill"],
        allowHighImpact: affected.joints.every(
          (joint) =>
            ![Joint.Knees, Joint.Ankles, Joint.Hips, Joint.Spine].includes(joint)
        ),
        allowOverhead:
          !affected.muscles.includes(Muscle.Shoulders) &&
          affected.joints.every(
            (joint) => ![Joint.Elbows, Joint.Wrists].includes(joint)
          ),
        allowInversion:
          !affected.muscles.includes(Muscle.Shoulders) &&
          affected.joints.every(
            (joint) =>
              ![Joint.Wrists, Joint.Neck, Joint.Spine].includes(joint)
          ),
        allowProne: !affected.joints.includes(Joint.Spine),
        allowKipping: false,
        allowHeavyAxialLoad: !affected.joints.includes(Joint.Spine),
        maxLoadPercent: 50,
        notes: `Moderate issue in ${affectedNames.join(", ")}. Avoid direct stress. Use alternatives.`,
      };
    case ImpedimentSeverity.Severe:
      return {
        avoidMuscles: affected.muscles,
        avoidJoints: affected.joints,
        avoidTags: ["max_effort", "high_skill", "complex"],
        allowHighImpact: false,
        allowOverhead:
          !affected.muscles.includes(Muscle.Shoulders) &&
          affected.joints.every(
            (joint) => ![Joint.Elbows, Joint.Wrists].includes(joint)
          ),
        allowInversion: false,
        allowProne: false,
        allowKipping: false,
        allowHeavyAxialLoad: false,
        maxLoadPercent: 0,
        notes: `Severe issue in ${affectedNames.join(", ")}. Completely avoid. Seek medical guidance.`,
      };
  }
}
