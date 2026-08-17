# Assigned Workout values carry provenance

An Assigned Workout is materialised early — at Reservation time — so athletes can
pre-adjust it before they train. That means the copy outlives changes to
everything it was derived from: the coach re-programmes the workout, the athlete
clears an impediment, a Load Adjustment shifts. We tag every value on an Assigned
Workout with where it came from — `programmed` (the coach's number), `adjusted`
(derived by the system from the athlete's impediments, equipment, and Load
Adjustments), or `overridden` (typed by the athlete) — and re-derivation may
freely recompute the first two but never silently replaces the third.

## Considered Options

- **Freeze at materialisation.** Rejected: an athlete who clears an injury or sets
  a PR trains off a stale picture of their own body, and coach corrections never
  reach anyone.
- **Re-derive on every upstream change.** Rejected: destroys the pre-editing that
  early materialisation exists to enable.

## Consequences

Movement identity is the identity of a prescription line. If the coach changes
the *movement*, the line is a new line and every athlete override on it is
discarded. If the coach changes only a *parameter* — reps, load, duration,
distance — athlete overrides of that parameter survive.

Discarding overrides on a movement swap must be surfaced to the athlete, not done
silently; they may have had a reason the system cannot see.

The `adjusted` rung is what makes Load Adjustments carry forward safely: without
it the system cannot tell "155 because history says scale 30%" from "155 because
the athlete insisted", and would compound adjustments on top of overrides.
