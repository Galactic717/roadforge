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
- **Weights:** `data/pretrained_model.json` is committed. Local retraining writes ignored `data/model.json`.

Recreate the weights with:

```bash
roadforge train --seed 7 --samples 1100 --epochs 24 --output data/pretrained_model.json
```

## Evaluation

`roadforge evaluate --model data/pretrained_model.json` runs a closed-loop trip on the same city. The default route reaches the goal in 789 fixed simulation steps with the learned policy, versus 800 steps for the reference driver. Both arrive. A small route sweep performed during development also arrived on `4-3→0-0`, `0-3→4-0`, `2-0→2-3`, and `1-1→3-2`; these use the same road graph and are not independent held-out worlds.

This is a functional demonstration. It does not establish generalization to unseen layouts or physical vehicles. The app supports training on a user-built world so the model can be evaluated there directly.

`roadforge benchmark` also runs the model on two distinct, hand-built road layouts that were not used in training: switchback and zigzag. Both reached the destination in a local development run (99.5% and 99.2% route progress respectively). Automated tests assert arrival on all three presets. These are still small synthetic worlds and do not establish robust out-of-distribution performance.

## Known limitations

- No pedestrians, traffic lights, dynamic obstacles, weather physics, or right-of-way rules.
- All roads have the same width; intersection geometry is approximated by overlapping strips.
- Collision handling is based on center distance, not vehicle polygons.
- The sampled teacher provides the training labels, so the learned policy inherits its biases.
- Route completion and training loss measure simulator behavior, not real-world safety.
