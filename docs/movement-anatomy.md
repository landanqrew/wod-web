# Movement anatomy audit

This document records the rules and representative evidence used to classify all
78 entries in `MOVEMENT_LIBRARY`. It is a maintenance guide, not medical advice.

## Classification rules

- **Primary muscles** are prime movers that produce the movement's external work.
- **Secondary muscles** assist a prime mover or stabilize the body or implement
  under meaningful demand.
- **Loaded joints** materially transmit resistance, impact, or bodyweight force.
  Isometric loading counts: a joint need not articulate to be loaded. Incidental
  posture alone does not make every joint a loaded joint.
- Composite movements include the prime movers and loaded joints from each
  material phase. Variants in one family use the same baseline, with differences
  justified by their rack, support, catch, or implement position.
- `Shoulders` intentionally exists on both typed axes. `Muscle.Shoulders` is the
  project's practical muscle-group label; `Joint.Shoulders` represents the
  articulation bearing force. Legacy `"shoulders"` Impediments migrate to both.

## Family audit

| Family | Applied mechanical rule | Representative evidence |
| --- | --- | --- |
| Squats, lunges, step-ups | Quads/glutes are prime and hamstrings/core/lower back/adductors form the squat baseline. Front and overhead racks add upper-back or shoulder stabilization, while an unloaded air squat omits upper-limb and material axial joint load. Ankle, knee, and hip loading remains consistent. | [Squat kinematics and kinetics](https://pubmed.ncbi.nlm.nih.gov/20182386/), [loaded squat muscle activation review](https://pubmed.ncbi.nlm.nih.gov/22373894/), [single-leg squat/lunge/step-up EMG](https://pubmed.ncbi.nlm.nih.gov/32236133/) |
| Deadlifts and swings | Glutes and hamstrings drive hip extension; quads assist from the floor; lumbar, abdominal, upper-back, and grip muscles stabilize. Sumo stance makes adductors prime movers in both the deadlift and high-pull variant. A held implement loads the upper-limb joints isometrically. | [Deadlift neuromuscular activation](https://pubmed.ncbi.nlm.nih.gov/33345180/), [kettlebell swing EMG and kinematics](https://pubmed.ncbi.nlm.nih.gov/26618061/), [swing trunk activation](https://pubmed.ncbi.nlm.nih.gov/30911671/) |
| Cleans, snatches, jerks, thrusters | Lower-body triple extension supplies propulsion; the squat/catch and overhead phases add their respective prime movers and loaded joints. Shoulders remain secondary stabilizers for every snatch implement; they become primary only when a press occurs, as in a thruster or jerk. Power, hang, and unilateral variants do not change that role. | [Clean versus snatch biomechanics and EMG](https://pubmed.ncbi.nlm.nih.gov/41352184/) |
| Horizontal and vertical pressing | Chest/triceps lead horizontal pressing; shoulders/triceps lead vertical pressing. Core and upper back stabilize. Closed-chain pressing loads the spine and shoulders isometrically. | [Push-up versus bench-press kinematics and EMG](https://pubmed.ncbi.nlm.nih.gov/31508485/), [push-up kinetics review](https://pubmed.ncbi.nlm.nih.gov/30284496/) |
| Pulling, hanging, and muscle-ups | Lats and elbow flexors produce the pull; upper back, grip, and trunk assist. Hanging bodyweight loads shoulders, elbows, and wrists even while those joints may be held isometrically. Kipping variants add hip and spinal demand. | [Pull-up EMG and elbow motion](https://pubmed.ncbi.nlm.nih.gov/21068680/) |
| Planks and hanging core work | Abdominal and oblique muscles lead trunk control; hip flexors lead dynamic leg raises. Body-lever and hanging exercises create meaningful spinal compression, so the spine remains a loaded joint even without visible spinal motion. | [Anterior-chain muscle activity and spine load](https://pubmed.ncbi.nlm.nih.gov/25111163/), [static plank muscle activation](https://pubmed.ncbi.nlm.nih.gov/35370773/) |
| Running, jumping, and rope work | Calves, glutes, hamstrings, and quads contribute to propulsion and support according to speed and phase. Hip, knee, and ankle all carry contact force; impact movements also transmit spinal load. | [Muscle contributions to running joint contact forces](https://pubmed.ncbi.nlm.nih.gov/35719242/), [lower-limb strategies with running speed](https://pubmed.ncbi.nlm.nih.gov/25103134/), [high-speed hamstring demands](https://pubmed.ncbi.nlm.nih.gov/37668346/) |
| Ergometers | Rowing combines leg drive with hip/trunk transfer and an upper-body pull. Cycling is lower-extremity dominant. Skiing combines a lat/triceps pull with trunk and hip extension. | [Rowing biomechanics systematic review](https://pubmed.ncbi.nlm.nih.gov/33397675/), [cycling biomechanics review](https://pubmed.ncbi.nlm.nih.gov/18796820/) |
| Carries and sleds | Locomotor prime movers remain active while grip, upper back, shoulders, and trunk transmit an external load isometrically. The external load distinguishes these from unloaded walking. | [Strongman exercise biomechanics systematic review](https://pubmed.ncbi.nlm.nih.gov/31820223/), [sled-push muscle activation and kinematics](https://pubmed.ncbi.nlm.nih.gov/34833557/) |
| Turkish get-up | Classification includes the changing lower-body, trunk, and bilateral shoulder demands across all seven stages rather than treating it as a simple press. | [Turkish get-up shoulder activity by stage](https://pubmed.ncbi.nlm.nih.gov/30691756/) |

## Maintenance

When adding a movement, start from its closest family and document any mechanical
difference that changes a primary muscle or loaded joint. The integrity tests
reject movements without a primary muscle or loaded joint; review must still
establish whether the declared data is anatomically coherent.
