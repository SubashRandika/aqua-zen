# AquaZen

A calm, cinematic aquarium for your screen. Twelve species of fish live their own lives among stone, driftwood and swaying plants, under a slow day and night. Nothing follows a path: every fish is an autonomous agent with its own personality, hunger, energy and fears.

Built with Next.js, React Three Fiber and three.js. Everything you see and hear is generated in code. There are no 3D models, textures or audio files, so there's nothing to license (see [docs/assets.md](docs/assets.md)).

## What's in the tank

- **Twelve species**, each configured by data: neon tetra, harlequin rasbora, zebra danio, guppy, angelfish, betta, dwarf gourami, panda corydoras, black molly, fantail goldfish, young koi and a bristlenose pleco. They differ in size, speed, depth, swimming style, temperament and patterning.
- **Natural looks.** Bodies have scales that catch the light, gill covers, a lateral line, lips and eyes with a coloured iris. Fins are thin membranes over visible rays, fraying slightly at the edge. Markings follow the body's contours, and koi, goldfish and guppies each carry their own: kohaku, sanke, showa and ogon koi, red-and-white or lemon goldfish.
- **Individual personalities.** Traits are sampled per fish along a bold–shy axis, so one neon tetra is restless and curious and another is timid and slow.
- **Emergent behaviour.** Wandering, cruising, loose schooling, resting, hiding, foraging, territorial chases, curiosity and feeding are chosen by weighted utilities with hysteresis. Schools split, regroup and pass alarm along their members.
- **Foraging between meals.** Goldfish, koi and corydoras pick over the substrate nose-down in little darts. The pleco, the tank's cleaner, holds on to the glass, stones, wood and substrate with its sucker mouth and grazes in slow shuffles, so you often see its belly and mouth disc against the front glass.
- **Real swimming.** Fish steer by turning a heading; they can't strafe. Turns have momentum, building up and easing off, and the body curves into a turn just before the heading follows. Tetras and danios swim in bursts and glides and turn with a kick of the tail, corydoras and plecos hop along the bottom and settle when they stop, and the body wave, tail beat and fin sculling follow speed and turning.
- **Feeding.** A pinch is mixed flake food with a few sinking pellets for the bottom feeders. Flakes float flat and drift together on the surface film, soak, then rock down like falling leaves and settle; bitten flakes shed crumbs. Fish notice the food at different moments, approach from different sides, compete for it, eat in bites and drift back to normal life.
- **Glass interaction.** A tap startles shy fish, and the alarm spreads through schools. Curious fish come to investigate afterwards. Rest a finger on the glass and the bold ones come close.
- **Day and night.** A simulated clock (or your local time) drives the room's light and the fish's rhythm: diurnal fish rest and lose colour at night, while corydoras become more active.
- **Tank light.** The LED light above the tank runs on a timer, like a real aquarium's, and you can switch it on or off whenever you like. Switch it on at night and the fish wake up.
- **Sound.** Optional synthesised water ambience, air-stone bubbles and generative ambient music.

## Getting started

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script              | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Development server                  |
| `npm run build`     | Production build                    |
| `npm start`         | Serve the production build          |
| `npm run lint`      | ESLint                              |
| `npm run typecheck` | TypeScript, no emit                 |
| `npm test`          | Unit and integration tests (Vitest) |
| `npm run check`     | Typecheck, lint and tests together  |
| `npm run format`    | Prettier                            |

Copy `.env.example` to `.env.local` to set `NEXT_PUBLIC_SITE_URL`, which social preview metadata uses for absolute URLs.

## Using AquaZen

Controls fade away when you're just watching and come back as soon as you move the pointer, touch the screen or press a key.

| Control    | What it does                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auto       | Lighting follows the aquarium's own day                                                                                                          |
| Day        | Daylight, with the tank light on                                                                                                                 |
| Night      | Moonlight, with the tank light off                                                                                                               |
| Tank light | Switches the light above the tank on or off. In Auto it runs on a timer from 07:30 to 18:30; a switch by hand holds until the timer next changes |
| Feed       | Drops a pinch of food. For a few seconds after, tapping the water drops food where you tap                                                       |
| Sound      | Water sounds, music and volume                                                                                                                   |
| View       | Seated (still, with gentle motion) or Explore (drag, scroll or pinch). Watch a fish, or reset view                                               |
| Settings   | Quality, length of a day, reduced motion, reduced effects                                                                                        |

Keyboard: **F** feed · **A / D / N** auto, day, night · **L** tank light · **M** sound · **C** seated or explore · **W** watch a fish · **R** reset view · **H** hide controls · **Esc** close or stop.

Settings persist in `localStorage` under a versioned schema: sound, music, volume, lighting mode, tank light, day length, the aquarium's clock, quality, camera mode and accessibility preferences.

## Quality and performance

Quality has four tiers plus **Auto**. Auto picks a starting tier from the device (GPU, memory, cores, screen size, phone or tablet), then adjusts resolution and tier from the measured frame rate. It never climbs into Ultra on its own.

Measured in Chrome on an AMD Radeon 860M integrated GPU at 1600×900:

| Tier   | Fish | FPS | Draw calls / frame | Triangles / frame |
| ------ | ---- | --- | ------------------ | ----------------- |
| Low    | 35   | 60  | 78                 | 78k               |
| Medium | 47   | 60  | 104                | 141k              |
| High   | 58   | 59  | 120                | 200k              |
| Ultra  | 76   | 49  | 116                | 312k              |

The main techniques:

- Simulation state lives outside React. React only re-renders for UI changes, never per frame.
- Instancing is used for fish (four draw calls per species), plants, food and particles.
- Fish switch between two geometry levels of detail by camera distance.
- Bubbles, particles and light shafts animate entirely on the GPU.
- Caustics are rendered once per frame into a small tileable texture that every surface samples.
- Simulation is time-based, with fixed maximum steps. Distant fish think and perceive less often.
- Shader validation is skipped in production builds.

## Accessibility

- Every control works from the keyboard and has a visible focus ring, ARIA roles and labels. Panels move focus in and return it on close.
- A live region announces actions such as feeding and lighting changes.
- **Reduce motion** follows the system setting by default and can be forced on or off. It stops camera drift and parallax and shortens UI animation. The fish keep swimming.
- **Reduce effects** removes light shafts, bloom and grain, and thins particles.
- Without WebGL 2, a static page explains how to enable it. If the GPU context is lost, an overlay explains what happened and offers a reload.

## Project structure

```text
src/
├── app/                 Next.js App Router: layout, page, metadata, icon, manifest
├── components/
│   ├── AquariumApp.tsx  Client entry: WebGL check, quality, world, loading
│   ├── aquarium/        R3F scene: tank, scape, plants, fish, water, camera, effects
│   ├── controls/        The dock, panels and light timeline
│   └── ui/              Loading, fallbacks, error boundary, live region
├── simulation/          Framework-free simulation (no React, no rendering)
│   ├── core/            World, event bus, maths, noise, seeded random, spatial hash
│   ├── fish/            FishAgent, FishManager, personality, population, types
│   ├── behaviors/       Utility-based decisions and per-state steering
│   ├── steering/        Seek, flee, arrive, wander, separation, alignment, cohesion…
│   ├── environment/     Substrate, scape layout and obstacles, water flow, day/night
│   ├── feeding/         Food particles
│   └── interaction/     Glass stimuli (taps, touches, hover)
├── three/               Procedural geometry, shader patches, effect materials, assets
├── audio/               Web Audio engine: ambience, bubbles, effects, generative music
├── config/              Species, quality tiers, scape layout, lighting keyframes, tank
├── store/               Zustand: persisted settings, transient session state
├── hooks/               Audio, world sync, keyboard shortcuts, idle, reduced motion
└── lib/                 Persistence schema, device detection, camera framing, actions
tests/
├── unit/                Steering, personality, species, states, feeding, day/night…
└── integration/         Feeding, glass interaction, day/night behaviour, persistence
```

[docs/architecture.md](docs/architecture.md) explains how the systems fit together and how to add a species.

## Deployment

AquaZen is a static site: every route is prerendered. It deploys to Vercel or any Node host with `npm run build && npm start`. Set `NEXT_PUBLIC_SITE_URL` to the public URL so Open Graph images resolve to absolute addresses.

## Licence and assets

Everything is procedural and original to this project. [docs/assets.md](docs/assets.md) lists sources, authors and licences, including the Google Fonts used.
