# Assets and licences

AquaZen contains no third-party 3D models, textures, images or audio recordings. Every visual and sound is generated at runtime by code in this repository, which avoids the licensing uncertainty of downloaded assets.

## Generated in code

| Asset                                                                    | Source                                                                                      | Author                                                 | Licence                                           | Usage restrictions |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- | ------------------ |
| Fish bodies, fins and barbels (18 species)                               | `src/three/geometry/fishGeometry.ts`, shapes in `src/config/species.ts`                     | AquaZen project                                        | Same terms as this repository                     | None               |
| Fish colour patterns, scales, eyes, fin rays, swimming deformation       | `src/three/materials/fishMaterial.ts`                                                       | AquaZen project                                        | Same terms as this repository                     | None               |
| Stones                                                                   | `src/three/geometry/rockGeometry.ts`                                                        | AquaZen project                                        | Same terms as this repository                     | None               |
| Driftwood                                                                | `src/three/geometry/driftwoodGeometry.ts`                                                   | AquaZen project                                        | Same terms as this repository                     | None               |
| Plants (Vallisneria, hairgrass, sword plants, stem plants)               | `src/three/geometry/plantGeometry.ts`, `plantPlacement.ts`                                  | AquaZen project                                        | Same terms as this repository                     | None               |
| Substrate (aquasoil and sand)                                            | `src/three/geometry/substrateGeometry.ts`, `src/three/materials/substrateMaterial.ts`       | AquaZen project                                        | Same terms as this repository                     | None               |
| Caustics                                                                 | `src/three/effects/causticsTexture.ts`, `src/three/materials/causticsPatch.ts`              | AquaZen project (original Voronoi-edge implementation) | Same terms as this repository                     | None               |
| Water surface, backdrop, light shafts, particles, bubbles, glass ripples | `src/three/effects/*`                                                                       | AquaZen project                                        | Same terms as this repository                     | None               |
| Fish food flakes (torn outlines, speckles) and pellets                   | `src/three/effects/foodTextures.ts` (drawn on a canvas), `src/components/aquarium/Food.tsx` | AquaZen project                                        | Same terms as this repository                     | None               |
| Etched wordmark on the glass                                             | Drawn at runtime with the Shippori Mincho font                                              | AquaZen project                                        | Same terms as this repository (font: SIL OFL 1.1) | None               |
| Water ambience, bubbles, glass tap, food sounds                          | `src/audio/ambience.ts`, `src/audio/effects.ts` (Web Audio synthesis)                       | AquaZen project                                        | Same terms as this repository                     | None               |
| Ambient music                                                            | `src/audio/music.ts` (generative Web Audio synthesis)                                       | AquaZen project                                        | Same terms as this repository                     | None               |
| Reverb impulse response                                                  | `src/audio/reverb.ts` (generated noise)                                                     | AquaZen project                                        | Same terms as this repository                     | None               |
| App icon                                                                 | `src/app/icon.svg`                                                                          | AquaZen project                                        | Same terms as this repository                     | None               |
| Social preview image                                                     | `src/app/opengraph-image.jpg` and `twitter-image.jpg`, screenshots of AquaZen itself        | AquaZen project                                        | Same terms as this repository                     | None               |

## Algorithms credited

| Technique                 | Where                                 | Notes                                                                       |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| Improved Perlin noise     | `src/simulation/core/noise.ts`        | Ken Perlin's published algorithm (2002), implemented from the paper         |
| Mulberry32 PRNG           | `src/simulation/core/random.ts`       | Public-domain algorithm by Tommy Ettinger                                   |
| Pink noise filter         | `src/audio/reverb.ts`                 | Paul Kellet's widely published economy filter                               |
| Steering behaviours       | `src/simulation/steering/steering.ts` | After Craig Reynolds, _Steering Behaviors for Autonomous Characters_ (1999) |
| Hash functions in shaders | `src/three/materials/*.ts`            | Common public-domain hash formulations                                      |

## Fonts

Served through `next/font/google` and self-hosted at build time.

| Font            | Author     | Licence                   | Usage restrictions                                            |
| --------------- | ---------- | ------------------------- | ------------------------------------------------------------- |
| Shippori Mincho | FONTDASU   | SIL Open Font License 1.1 | Must not be sold on its own; attribution is in the font files |
| Instrument Sans | Instrument | SIL Open Font License 1.1 | As above                                                      |
| IBM Plex Mono   | IBM        | SIL Open Font License 1.1 | As above                                                      |

## Libraries

Runtime dependencies (Next.js, React, three.js, React Three Fiber, drei, postprocessing, GSAP, Framer Motion, Zustand) are used under their own licences, which are listed in each package's `LICENSE` in `node_modules`. GSAP is used under its standard no-charge licence, which permits use in this kind of web application.
