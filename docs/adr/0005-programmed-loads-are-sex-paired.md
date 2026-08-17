# Programmed loads are a sex-paired Rx

A Programmed Workout stores each load as a pair rather than a single number —
"thruster 95/65" — mirroring `defaultLoadMale` / `defaultLoadFemale` and the
convention every affiliate whiteboard already uses. The Assigned Workout resolves
the athlete's side of the pair, and that resolved number is the programmed load
that ADR-0004's Load Adjustment ratio applies to.

A single number was rejected because it silently makes a gym's programming
male-default and pushes half the class into hand-editing every loaded movement.

## Considered Options

**Percentage-based prescription** — "5×5 back squat @ 75%", resolved against each
athlete's own one-rep max — is better programming and is how strength cycles are
genuinely written. It is also the unlock ADR-0003 names for making Recovery
Windows intensity-aware. Deferred because it requires reliable per-lift 1RM data
that `personal_records` only accumulates as athletes train; building it first
yields a system that cannot programme for a new member.

## Consequences

`athletes.sex` is `notNull` and load resolution now depends on it, making it a
hard requirement rather than an incidental one. We considered separating the
physiological field from an explicit "which Rx do you train at" preference, and
decided against it for now: the binary field stays as-is.

The accepted cost is that any athlete whose training Rx does not match their sex
must Override the load on every loaded movement, every session. That includes
masters athletes training the lighter Rx — standard practice, and codified in
CrossFit's own masters divisions — as well as non-binary athletes, who have no
defined resolution path at all. Per ADR-0007 these are not Load Adjustments: a
different anchor is not a capability gap, and routing them through Load
Adjustments would pollute that object.

Revisit if Override traffic concentrates on athletes whose every loaded movement
gets the same treatment — that pattern is this decision surfacing as friction.
