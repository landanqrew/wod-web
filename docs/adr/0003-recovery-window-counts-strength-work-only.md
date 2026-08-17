---
status: accepted
---

# A Recovery Window counts strength work only

A Gym's Recovery Window starts the clock on a Muscle only when it is loaded by
`SessionBlockType.Strength` / `WorkoutFormat.Strength` work. Metcon and accessory
volume against the same Muscle does not open or extend the window. We expect to
revisit this, so the rejected options are recorded in full.

## Considered Options

**A — Muscle only, any loading counts.** Rejected as unusable. Quads and core are
loaded almost daily in this sport: squat heavy Monday, 150 wall balls Tuesday,
run repeats Wednesday, box step-overs Thursday. A window that any of these opens
blocks most of CrossFit for the week.

**B — Muscle plus block type. (Chosen.)** The distinction already exists in the
model, `SessionBlockType.Strength` sitting apart from `Metcon` and `Accessory`,
and it matches how coaches actually reason: "we squatted heavy Monday, so no
heavy pulling Tuesday." Nobody counts wall ball reps against squat recovery.

**C — Muscle plus computed intensity,** derived from load percentage or the
`max_effort` / `axial_load` tags. Rejected *for now* because the intensity signal
is not trustworthy here. Load originates from `movement.defaultLoadMale` /
`defaultLoadFemale`, static library constants that say nothing about how hard the
work was for the people in the room — and it is the very number Load Adjustments
and Overrides exist to modify. Inferring intensity from it means inferring from a
figure that was never a measure of intensity.

## Consequences

A genuinely savage metcon — Fran, a heavy chipper — contributes nothing to the
window. This is acceptable because coaches do not treat it as contributing
either, but it means the Recovery Window is a *strength-programming* tool and
must not be presented as general overtraining protection. Athlete-side
overreaching is Fatigue's job, and Fatigue is advisory (see ADR-0001's provenance
rules for why nothing here auto-applies).

## Revisit when

Option C becomes viable once prescribed load is athlete-relative rather than a
library constant — for instance once enough one-rep-max data exists to express a
prescription as a percentage of the athlete's own maximum. At that point
intensity is measurable and the block-type proxy can be dropped. Until then,
moving to C would mean trusting a number that does not carry the meaning the
calculation needs.
