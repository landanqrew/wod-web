# Workout generation splits into programming and personalisation

`generateWorkout` currently takes a single Athlete and does everything at once —
selects movements against that athlete's equipment, filters by their impediments,
and assigns loads from their sex. A Programmed Workout has no athlete: it belongs
to a Class Session with 25 people of both sexes and different injuries. We split
generation into two stages.

**Programming** produces a Programmed Workout for a Class Session, constrained by
the Gym's equipment and Stations, its Recovery Window, and nothing else.
Loads come out sex-paired (ADR-0005). No athlete is involved.

**Personalisation** turns a Programmed Workout into one athlete's Assigned
Workout — resolving their side of the load pair, applying their Impediments and
Load Adjustments, and substituting movements they cannot perform.

## Consequences

Personalisation is mostly code that already exists and already takes exactly
these inputs: `findSubstitution` and `checkMovement` are pure functions over
(movement, constraints, equipment). The split is largely a matter of separating
the movement-selection half from the constraint-application half.

The individual usecase becomes the degenerate case of the same pipeline: an
athlete programming for themselves runs both stages back to back, with their own
equipment standing in for the Gym's floor. There is one engine, not two.

Landed as its own refactor alongside the Muscle/Joint split (ADR-0002), ahead of
the gym feature work.
