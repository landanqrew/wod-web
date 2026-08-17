# Load Adjustments are a ratio of the programmed load

A Load Adjustment stores a ratio, not a weight, and that ratio is applied to the
load the coach programmed for the session — not to the movement's library Rx
(`defaultLoadMale` / `defaultLoadFemale`). It applies only to movements that
carry a library Rx load at all; 41 of the 78 movements in the library are
bodyweight, distance, or calorie work where the concept is meaningless.

## Considered Options

**Absolute weight.** Rejected: a stored 65 lbs is 68% of a 95 lb prescription and
48% of a 135 lb one. The adjustment stops meaning anything the moment the coach
programmes a different load, and can end up *heavier* than what the class is
being asked to do.

**Ratio of library Rx.** Rejected on the repo's own data. Of the 20 loaded
prescriptions in `benchmark-library.ts`, 12 differ from library Rx — thruster
alone is programmed at 45, 95, and 135 in different workouts because the rep
volume differs. An athlete on a 70% adjustment anchored to library Rx gets 67 lbs
in all three: half again heavier than the light day asks, half what the heavy day
asks. Anchoring here means **a coach's programming stops reaching precisely the
athletes who most need their judgment** — every deload, heavy day, and cycle
progression silently fails to apply. It would also freeze the library constants,
since retuning a default would move every adjusted athlete's working weight.

Note the intuition that programmed load and library Rx are usually the same does
hold for *generated* workouts — `workout-generator.ts:83` assigns `defaultLoad`
directly. It breaks for hand-authored programming, which is the entire point of
the gym feature.

## Consequences

The ratio is derived from and displayed against library Rx, so an athlete still
sees the stable, comprehensible "I'm a 70% thruster athlete", while the value
that lands on the bar tracks what the coach actually wrote.

Load Adjustments cover load only, never reps or duration. Rep reduction already
belongs to Scaling Tiers (`TIER_REP_SCALE`); letting one object cut both turns it
into a general-purpose handicap nobody can reason about.

An Override remains an absolute weight — the athlete is typing what goes on the
bar today, and a one-time edit has no future prescription to track.

Where an athlete's absolute Override ends up heavier than the programmed load, we
surface it rather than clamping it. Rx+ athletes deliberately go heavier and a
clamp would fight them.
