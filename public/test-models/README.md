# Test models

This folder is reserved for real GLB fixtures used to manually exercise
each tool during development. No fake/placeholder binaries are checked
in here — add real files as they're captured or exported.

Planned fixtures:

| File | Purpose |
| --- | --- |
| `static.glb` | Baseline: single static mesh, no animation, no rig. |
| `rigged-animated.glb` | Skinned mesh with joints and one or more animation clips — exercises Strip Animations and the "preserve rigging" checks in Optimise GLB. |
| `heavy-4k.glb` | Contains 4K textures — exercises Compress Textures and the "high-res texture" recommendation in Optimise GLB's Model Check. |
| `morph-target.glb` | Contains morph targets — exercises the "preserve morph targets" validation path. |
| `transparent.glb` | Contains transparent/alpha-blended materials — exercises the "preserve transparency" validation path. |
| `corrupt.glb` | Deliberately malformed file — exercises upload validation and error handling. |

Add files here as they become available; nothing above is required for
the site to build or run.
