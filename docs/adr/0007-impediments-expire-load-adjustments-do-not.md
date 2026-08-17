# Impediments carry the temporary limits; Load Adjustments carry the durable ones

Both objects reduce an athlete's load, and without a rule for which to reach for,
everything becomes a Load Adjustment — an object with no end date, applied to
every future prescription, that nobody remembers setting.

An **Impediment** is a temporary physical limit: "my shoulder hurts." It is
dated, expires on its own, and caps load across everything the shoulder touches
via `MovementConstraint.maxLoadPercent`, which `workout-generator.ts` already
applies. A **Load Adjustment** is a durable capability gap: "I am not strong
enough at thrusters yet." Single-movement, no natural end date, and it ends when
the athlete gets stronger.

An athlete citing an injury as their reason is steered toward creating an
Impediment instead.

## Consequences

Injury-driven load reduction expires by construction, because Impediments already
have `start_date` / `end_date`. That leaves only the strength-deficit case
needing an ending, and getting stronger is something results can actually
demonstrate — so a Load Adjustment ends via an evidence-based review prompt
("you have hit this load cleanly five sessions running — still need the 70%?"),
never on a timer. `bias-detector.ts` and `fatigue-tracker.ts` already run
multi-session queries of this shape.

Progressive automatic decay was rejected. It silently *increases* load. Every
other automatic behaviour in this system makes work easier; that is the one
direction where being wrong injures somebody, and it is the same silent
auto-application ADR-0001 rejected in the safer direction.

Without the steer toward Impediments, a Load Adjustment set for a shoulder that
healed in March is still quietly removing 30% in August — and because the athlete
is never asked for more, no result in their history ever contradicts it.
