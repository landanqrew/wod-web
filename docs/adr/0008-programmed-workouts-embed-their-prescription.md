# Programmed Workouts embed their prescription and keep a lineage pointer

A Programmed Workout stores its own copy of the movements, loads, and rep scheme
rather than referencing a `workouts` row, and carries a nullable
`sourceWorkoutId` recording what it was built from.

Each Class Session gets an independently editable Programmed Workout (see the
fan-out decision behind Q2), so a coach editing the 5:30 class must not touch the
5:00, and must certainly not mutate the canonical definition of Fran for everyone
who has ever run it. Embedding gives that isolation for nothing. The lineage
pointer preserves the identity a copy would otherwise destroy, answering "when
did we last run Fran?" and "here is our house benchmark across four quarters."

## Consequences

The codebase already works this way: `trainingSessions.blocks` is
`jsonb<SessionBlock[]>` and `SessionBlock.workout` holds a full embedded
`Workout`, not an id.

This retires the cascade-delete chain found in Q9 — `workouts.createdBy` cascades
from `athletes`, and `workout_results.workoutId` cascades from `workouts`, so
deleting a departed coach's athlete row would have destroyed their authored
workouts and every athlete's results against them. Embedded programming cannot be
deleted out from under a gym's history. (The cascade itself should still become
`set null`; it is a bug independent of this decision.)

A reference-plus-diff-layer was rejected as the worst of both: it inherits shared
mutation *and* requires replaying diffs to answer "what did we actually do last
Tuesday?", which is the question that most needs to be trivial.

Denormalisation is accepted. Correcting canonical Fran does not propagate to past
sessions, which is right — past programming is a historical record, not a view.

Gyms own a workout library of their own, holding house benchmarks and saved
templates, distinct from the shared global benchmark set.
