# WOD

Generates and tracks CrossFit-style training. Serves two macro-usecases: an
individual programming for themselves, and a gym programming for classes of
enrolled athletes.

## Language

### People and organisations

**Athlete**:
A person who trains. Owns their own results, personal records, and impediments.
_Avoid_: User, member, client

**Gym**:
An organisation that programmes workouts for classes of athletes and declares
the equipment available on its floor.
_Avoid_: Box, affiliate, tenant, organization

**Station**:
One simultaneously usable unit of a piece of equipment on a Gym's floor — "12
rowers" is 12 stations. Compared against a Class Session's Reservation count to
warn when a Programmed Workout cannot be run in a single heat. Advisory only;
heats and rotations are legitimate programming, not errors.
_Avoid_: Slot, unit, capacity

### The body

**Muscle**:
A muscle or muscle group a movement stresses — chest, lats, quads, glutes.
The axis volume tracking and Recovery Windows are measured on.
_Avoid_: Body region, muscle group (ambiguous — see Movement Pattern)

**Joint**:
An articulation a movement loads — shoulder, knee, wrist, elbow, spine. The axis most
Impediments are declared on. Distinct from Muscle: a bad knee is not a bad quad,
and a movement can hammer a joint it barely muscles. Shoulder intentionally
appears on both axes: shoulder musculature can be trained while the shoulder
articulation independently bears load.
_Avoid_: Body region

**Movement Pattern**:
The mechanical shape of a movement — push, pull, squat, hinge, core, carry.
Used for balance reporting, never for load or recovery decisions; the loads and
limiting factors within one pattern are not comparable.
_Avoid_: Muscle group (its misleading name in code today), movement type,
exercise category

**Impediment**:
A *temporary* physical limit an Athlete carries — injury, pregnancy, postpartum.
Dated, expires on its own, located on Muscles or Joints, and caps or forbids
everything the affected part touches. The right tool for "my shoulder hurts"; a
Load Adjustment is not. Where an Impediment says what a body cannot do right now,
a Load Adjustment says what an athlete cannot do yet.

**Recovery Window**:
A Gym's constraint on its own programming calendar — the period after a Muscle is
loaded during which the Gym should avoid loading it again. Reads only that Gym's
own Programmed Workouts. Blind to what its athletes do elsewhere, and correctly
so: a Gym programmes for a Class, not for a person.
_Avoid_: Rest period, cooldown, fatigue

**Fatigue**:
An Athlete's accumulated load across every Gym they train at and every solo
session. Surfaced as advice on their Assigned Workout — never auto-applied,
because an adjustment the athlete cannot see is one they cannot revise.
_Avoid_: Recovery, soreness, readiness

### Programming

**Workout**:
A named definition — format, movements, rep schemes, scoring. Reusable and
authorless in principle; a benchmark like Fran is a Workout.

**Gym Library**:
The Workouts a Gym owns — house benchmarks and saved templates it programmes
from. Distinct from the shared global benchmark set, which every Gym can draw on
but none owns.
_Avoid_: Template library, gym workouts

**Movement Prescription**:
One line within a Workout — a movement plus its reps, load, distance, or
duration. Already the meaning of `MovementPrescription` in code; do not reuse
this word for anything class- or athlete-level.

**Class**:
A recurring commitment a Gym offers — a name, a coach, and a weekly schedule.
"6am CrossFit, Mon/Wed/Fri". A definition, not an event.

**Class Session**:
One dated occurrence of a Class. "6am CrossFit, Tue 17 Feb". Attendance and
programming attach here, never to the Class itself.
_Avoid_: Class instance, session (bare — collides with auth sessions and
`TrainingSession`), occurrence

**Membership**:
An Athlete's relationship to a Gym, carrying a role — owner, coach, or member.
An Athlete may hold Memberships at several Gyms at once. Coaching is something
you do *at a gym*, not a property of a person.
_Avoid_: Role, account, affiliation

**Coach**:
An Athlete holding a coaching Membership at a Gym. Records attribution on the
Programmed Workouts they write, but never owns them — the Gym does, so a coach
leaving costs the gym nothing but a name.
_Avoid_: Trainer, instructor, programmer

**Reservation**:
An Athlete claiming a spot in one Class Session. The only way an athlete joins a
class — there is no standing membership in a Class.
_Avoid_: Enrollment, booking, registration, signup, RSVP

**Programming**:
Producing a Programmed Workout for a Class Session. Constrained by the Gym's
equipment, its Stations, and its Recovery Window. No athlete is involved.
_Avoid_: Generating, planning

**Personalisation**:
Turning a Programmed Workout into one Athlete's Assigned Workout — resolving
their side of the Rx Pair and applying their Impediments and Load Adjustments.
An individual training alone runs Programming then Personalisation back to back;
there is one engine, not two.
_Avoid_: Scaling, adapting

**Rx Pair**:
A programmed load written as male/female — "thruster 95/65". The unit a Coach
writes loads in; Personalisation resolves the athlete's side.
_Avoid_: Default load, prescribed weight

**Programmed Workout**:
A Workout a Gym publishes to a Class Session. Shared by everyone attending that
session and never mutated by an individual athlete. Normally fanned out to every
session in a gym-day by one action, but independently editable afterwards.
_Avoid_: Daily WOD, prescription, assignment

**Assigned Workout**:
One athlete's personal, editable copy of a Programmed Workout, materialised when
their Reservation and the Programmed Workout both exist. Carries their
Substitutions and Load Adjustments, may be hand-edited by the athlete ahead of
time, and is the thing they log a result against. Belongs to the Reservation and
does not outlive it.
_Avoid_: Scaled workout, instance, personal WOD

### Scaling

Three distinct concepts share the English word "scaling". Each keeps its own
name; never say "scaling" unqualified.

**Scaling Tier**:
A whole-workout difficulty band — Beginner, Intermediate, Advanced, Rx, Rx+ —
that scales every load and rep count by a fixed factor. Applies to a Workout as
a whole.
_Avoid_: Level, division

**Substitution**:
Replacing one movement with a different movement, because equipment is absent or
an impediment forbids it. Changes *what* is performed.
_Avoid_: Swap, alternative, scale

**Roster**:
A Coach's view of one Class Session — everyone reserved, and how each athlete's
Assigned Workout differs from what was programmed. Informational: athletes scale
and substitute without asking permission, and the Roster is how a Coach learns
their programming was too aggressive.
_Avoid_: Attendance sheet, class list

**Override**:
A one-time hand edit an Athlete makes to a single line of a single Assigned
Workout, stored as an absolute value — the weight that goes on the bar today.
Applies to that workout only and carries forward to nothing.
_Avoid_: Adjustment, scale, tweak

**Load Adjustment**:
A standing, named, athlete-visible policy reducing an Athlete's load for one
movement — "thruster: 70%, since 3 Feb, shoulder". Stored as a ratio and applied
to whatever the Coach programmed, so coaching still reaches the athlete on
deload and heavy days. Scoped to that single movement, never to a Muscle or
Movement Pattern, and only to movements carrying a library Rx load. Covers load
alone, never reps. Created only by explicit promotion from an Override, never
inferred silently.
_Avoid_: Scale, scaling factor, handicap, override
