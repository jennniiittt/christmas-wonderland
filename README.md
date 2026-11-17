# Christmas Wonderland

An immersive, interactive Christmas experience built with **Three.js**, **GSAP** and **Vite**.
Everything you see and hear is generated in code: geometry, textures, shaders, music and sound effects.
There are no external models, images or audio recordings, so the whole thing has no licensing concerns.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Useful URL parameters:

| Parameter | Effect |
| --- | --- |
| `?quality=high` / `medium` / `low` | Force a quality tier (normally auto-detected). |
| `?fallback` | Preview the lightweight 2D version used when WebGL is unavailable. |

## The experience

1. **The Invitation**: a moonlit winter sky with falling snow, twinkling stars and the "Enter the Wonderland" button.
2. **The Giant Tree**: a cinematic camera move brings you to the tree, its lights switch on from bottom to top and the star ignites last.
   - The tree is built from about 4,000 instanced fir fronds, ~900 twinkling fairy lights, about 170 metal and glass baubles, finials, a satin ribbon spiral, bead swags and velvet bows.
   - Snow slowly settles on the branches while you watch.
3. **Magic Ornaments**: 8 glowing ornaments. Click one and the camera glides to it to reveal one of four kinds of surprise:
   - a wish
   - a hidden message
   - a little surprise (a golden helix climbs to the star, or a snow flurry)
   - a small gift
4. **The Magic Playground** (the bottom menu):
   - **Make a Wish**: your typed words dissolve into golden particles and gather into a light. The light rises into the sky and becomes a permanent star, which this device remembers.
   - **Open a Present**: flies you to the next unopened gift.
   - **Snow Globe**: a globe on a candle-lit table. Tap it to step inside the village of Winterbrook, with glowing windows, chimney smoke and snow you can shake.
   - **Lights**: switch between Warm Gold, Colourful and Winter Blue (the change moves up the tree), adjust snowfall and toggle the music.
5. **The Finale**: the camera rises to the star and golden light drifts upward with "May your Christmas be filled with magic." Then you can **Make Another Wish**.

### Mystery Presents

There are six gifts under the tree, each with its own state, wrapping paper, ribbon, bow and surprise:

| Gift | Surprise |
| --- | --- |
| Golden | An animated greeting with hand-drawn flourishes, plus spiralling golden rings |
| Ruby | A sealed letter: the wax seal breaks, the flap opens and the message writes itself, with a heart of sparks |
| Emerald | A crystal snowflake rises, spins and shatters into sparkles |
| Silver | The camera looks up as a shooting star crosses the sky |
| Midnight | A miniature snow globe rises out of the box; tap it or press "Shake" |
| **Special Golden** | Locked until the other five are opened. Five orbs circling it light up as you progress. When all are found, the orbs spiral in and the padlock dissolves. Opening it plays the grand finale: a ring of light, a wave up the tree, fireworks and the northern lights |

How opening a present works:
- Hovering lifts the box, makes its seam glow and wiggles the bow. On touch screens, a tap opens it directly.
- Opening runs this sequence:
  1. The camera flies in and ambient motion slows.
  2. The ribbon comes loose.
  3. The lid floats off.
  4. Light and particles pour out.
  5. The surprise plays.
- A guard flag prevents overlapping or accidental re-opens. Opened gifts can be revisited.
- Opened gifts are remembered for the rest of the visit, so a page reload keeps them.

### Extra touches
- Occasional shooting stars.
- A little train circles the tree. Click it for a jingle and a puff of steam.
- Golden motes drift around the tree.
- Victorian lamp posts cast pools of light on the snow, which glitters.
- A cursor sparkle trail on desktop.
- Touch the star at the top of the tree for a secret.

## Customise

| What | Where |
| --- | --- |
| Present texts, order, placement and size | `src/config/gifts.js` |
| Ornament messages, types and positions | `src/config/ornaments.js` |
| Light mood colours | `src/effects/lighting.js` (`MOODS`) |
| Wrapping paper and ribbon styles | `src/scenes/giftBox.js` (`PRESENT_STYLES`) |
| Quality tiers (frond, light and snow counts) | `src/core/quality.js` |

## Architecture

```
src/
  main.js                 bootstrap, app context, render loop, scene flow
  style.css
  config/                 gifts.js, ornaments.js (editable content)
  core/                   renderer (composer + bloom + adaptive quality), camera rig,
                          environment map, quality detection, shared world state
  scenes/                 environment (sky, aurora, ground, forest, lamps, shooting stars),
                          christmasTree, giftBox, train, snowGlobe, globeExperience (lazy), finale
  interactions/           picker (tap vs drag raycasting), presents, giftReveals,
                          ornaments, wishes
  effects/                snowfall (GPU), particles (pooled bursts + GPU motes),
                          lighting moods, cursorTrail
  audio/audioManager.js   Web Audio synthesis: music, wind, bells, effects
  ui/ui.js                DOM UI (loader, intro, HUD, dock, cards, toasts)
  fallback/fallback2d.js  2D canvas version for devices without WebGL (lazy)
  utils/                  helpers, bow builder, GLSL noise
```

### Performance
- **Instancing:** fronds, baubles, beads, the forest and the track sleepers all use instanced meshes.
- **GPU animation:** snow, fairy lights, motes and stars are animated entirely in shaders. Burst particles come from one pooled buffer.
- **Quality tiers:** detected from the device (pointer type, cores, memory, software renderer) and adjustable with `?quality=`.
  - **High:** MSAA plus half-resolution bloom.
  - **Low:** bloom off, with lights drawing their own halos.
- **Adaptive quality:** if the frame rate stays low, resolution and then bloom are reduced automatically.
- **Pausing and cleanup:**
  - The render loop and audio pause when the tab is hidden.
  - All listeners use an `AbortController`.
  - `destroy()` disposes GPU resources (it is wired to Vite HMR).
- **Lazy loading:** the snow globe and the 2D fallback are separate code-split chunks.

### Sound
All audio is synthesised live with the Web Audio API. There is an original, generative music-box and pad piece in D major, plus soft wind, church and sleigh bells, and magical effects. Nothing plays until the visitor clicks **Enter** (or the sound button). The mute button is always visible, and the site works fully without sound.
