# Neural driver model card

## Purpose

The included weights provide an immediately usable learned driver for the bundled RoadForge city. They are a reproducible software-simulation artifact, not a vehicle-control model.

## Training data and method

- **Source:** synthetic states generated from the bundled road graph and default route (`0-0` to `4-3`).
- **Seed:** `7`.
- **Samples:** `1,100` poses, headings, and speeds.
- **Epochs:** `24`.
- **Teacher:** deterministic route-following reference controller.
- **Optimization:** backpropagation with stochastic gradient descent and squared action error.
- **Network:** 8 inputs, 12 hidden tanh units, 2 output tanh units.
- **Parameter count:** 134 trainable weights and biases.
- **Weights:** `data/pretrained_model.json` is committed. Local retraining writes ignored `data/model.json`.

Recreate the weights with:

```bash
roadforge train --seed 7 --samples 1100 --epochs 24 --output data/pretrained_model.json
```

## Evaluation

`roadforge evaluate --model data/pretrained_model.json` runs a closed-loop trip on the same city. With the current analytical road-edge rays, the default route reaches the goal in 792 fixed simulation steps with the learned policy, versus 800 steps for the reference driver. Both arrive. This is the same road graph used for training and is not an independent generalization test.

This is a functional demonstration. It does not establish generalization to unseen layouts or physical vehicles. The app supports training on a user-built world so the model can be evaluated there directly.

`roadforge benchmark` runs paired reference and learned-policy trips from the same 21 initial states on three maps. Each map has a nominal start plus six starts with lateral displacement, heading error, and nonzero initial speed; the suite uses one route per map and a 1,900-step time limit. City is the training map. Switchback and zigzag are small, hand-built layouts absent from fitting. The committed model and the reference both arrive in 21/21 current cases. Mean completion is 0.9941 for the learned policy and 0.9942 for the reference. The command emits every case and writes a transactional SQLite record with the model SHA-256 by default. These deterministic checks are useful for regressions, but the cases were designed by a developer and are not an independent sample of real road layouts. Repeatedly tuning against this suite would also make it a development set, not an untouched test set.

`roadforge benchmark --stress` additionally uses five seeded, generated layouts with alternating right-angle turns and road widths between 36 and 60 simulation units. The resulting 56-case suite currently gives **56/56 reference arrivals** and **53/56 learned arrivals**. The learned policy leaves the road in the `right_edge` start of seed 23 and the `left_edge` and `right_edge` starts of seed 71. These failures show a limit of the committed policy. Seeds and perturbations are fixed in code; this is a developer-designed stress check, not a random population estimate or an untouched test set.

## Known limitations

- No pedestrians, traffic lights, dynamic obstacles, weather physics, or right-of-way rules.
- All roads have the same width; intersection geometry is approximated by overlapping strips.
- Collision handling is based on center distance, not vehicle polygons.
- The sampled teacher provides the training labels, so the learned policy inherits its biases.
- Squared action error is an imitation objective, not a measure of driving quality. Errors can compound when the student visits states outside the sampled training distribution (covariate shift); this version does not use DAgger or intervention data.
- The generated layouts are deterministic and share a narrow design family. The suite has no moving actors, sensor noise, or uncertainty intervals. Neither a 21/21 nor a 53/56 result can be extrapolated to real roads.
- Route completion and training loss measure simulator behavior, not real-world safety.
