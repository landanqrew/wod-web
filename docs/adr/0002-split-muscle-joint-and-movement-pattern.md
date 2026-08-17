# Muscle, Joint, and Movement Pattern are three separate axes

`BodyRegion` conflated muscles (chest, lats, quads) with joints (knee, wrist,
spine), and `MuscleGroup` actually held movement patterns (push, pull, squat,
hinge, carry) rather than muscles. We split them into `Muscle`, `Joint`, and
`MovementPattern`, because gym programming needs to reason about muscle recovery
across consecutive days, impediments need to reason about joints, and neither
question can be answered by an enum that mixes the two.

## Consequences

`Movement` gains `loadedJoints` alongside `primaryMuscles` / `secondaryMuscles`.
Backfilling it across the movement library is domain work, not a mechanical
rename — someone has to decide which joints each movement loads.

This fixes a live bug rather than merely tidying names. `constraint-engine.ts`
blocks a movement when its regions intersect an impediment's `avoidRegions`, but
no movement in the library declared `Knees` while `impediment.ts` readily
produced `avoidRegions: [Knees]`. Knee impediments blocked almost nothing —
lunges carry neither the `high_impact` nor `axial_load` tag that the fallback
heuristics rely on. Requiring `loadedJoints` on every movement is what forces the
data to exist.

Movement Pattern must not be used for load or recovery decisions. A 30% cut to a
bench press and a 30% cut to a snatch are both "push" and are not the same
intervention; the limiting factor is pressing strength in one and technique in
the other.

Landed as a standalone refactor ahead of the gym feature work, so the compiler
verifies the rename without new-code errors muddying the signal.
