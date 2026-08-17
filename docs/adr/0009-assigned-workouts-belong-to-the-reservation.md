# An Assigned Workout belongs to its Reservation

An Assigned Workout is created when an Athlete reserves a Class Session, and it
is destroyed when that Reservation is cancelled. Cancelling discards the
athlete's Overrides and Substitutions along with it.

## Considered Options

**Keying the Assigned Workout to (Athlete, Class Session)** so it survives
cancellation and returns intact on re-booking was considered and rejected as
unnecessary machinery for now. It would have made cancel-and-rebook — the most
common reservation action in a gym — lossless, and would have allowed carrying
Overrides across a same-day class switch, since the fan-out gives both sessions
the same `sourceWorkoutId` and ADR-0001 already tags which values the athlete set
by hand.

## Consequences

An athlete who pre-scales a workout and then moves from the 6am to the noon class
does that work again. Watch for this: if athletes routinely re-enter the same
Overrides after switching classes, the ownership above is the cause.

A no-show is silent. The Reservation and Assigned Workout persist, no result is
recorded, and nothing touches the athlete's statistics — nothing was performed,
so nothing is recorded.

Class results and solo results are one thing. A single `workout_results` row, the
same personal records, volume, and fatigue. The Class Session is context on a
result, not a different kind of result, and a Gym is not a separate ledger.
