# The Song of Quiet Flower

A seated, hands-only musical-spell escape story (`../docs/STORYBOARD.md`, `../docs/BUILD_SPEC.md`).

**Built so far — Scene 2, The Cell, playable start to finish** (modelled and lit in Blender, light baked: see `art/README.md`):

1. **Look at your bag** in the corner and **pinch**: it opens and 5 torn pieces of your own song flutter out.
2. **Pinch each piece and drop it inside the outline**; it snaps home.
3. The whole page glows and hums, the pebble trembles, and a drawing of a clap appears in its margin. You've found **Rise (Ga Ma)**.
4. **Clap → the staff appears** (a fist drawing appears on the page). Write Ga Ma, **hold a fist** to cast.
5. **Look at the door bar and cast Rise**: the bar lifts, the door swings open, and the story blinks on to the Corridor.

**Scene 3, The Corridor** (the hearing rule's first puzzle):

1. **Look at the scrap** on the floor and **pinch**: you find **Sleep (Ma Ga Re)**; Re unlocks.
2. Tolo dozes half-awake at his table; Senn plays dice in the guardroom behind a closed door. Their **ear markers** show who can hear you: Senn's ear is struck out with a door.
3. Sleep straight away reaches only Tolo. Senn notices the silence, comes out and **catches you → the moment rewinds** (a few seconds; nothing is lost).
4. **Rise on the guardroom's latch bar** opens the door (Senn starts to get up), **then Sleep** reaches both.
5. With both asleep, **look at the ore cart and pinch its rim** to climb in (the Yard is next). Sleepers wake after 30 s (slower while the staff is open), and an awake guard catches you.

Any other melody triggers a harmless *Curiosity* (the lamp flickers, the pebble hums, moths circle the lantern). Stuck for 45 s? New handwriting appears on the page.
The **hearing rule**: every listener carries an ear marker (glowing ear = can hear; struck ear + door / water / earmuff / distance glyph = can't; z z = asleep).

Built with Meta's Immersive Web SDK (IWSDK) 1.0.1 — a WebXR app that runs in Meta Quest Browser.

## Run it (Windows)

Needs **Node.js 22.12+** (or 20.19+, or 24+). Check with `node -v`.

```sh
cd quiet-flower
npm install
npm run dev
```

`npm run dev` starts the IWSDK dev server on **https://localhost:8081** and opens a browser with the IWER emulator (a WebXR emulator). The emulator skips the home screen and goes straight into the cell in VR with **emulated hands**. Use the **Hand [L] / Hand [R]** panels to move each hand and change its pose (e.g. *pinch*, *fist*), or switch modes from the hand icon in the emulator's top bar.

### On your Quest 3 / 3S (same Wi-Fi as the PC)

1. Find your PC's IP: `ipconfig` → "IPv4 Address" (e.g. 192.168.1.20).
2. In Quest Browser open `https://192.168.1.20:8081` and accept the certificate warning (it's the local dev certificate).
   Allow Node.js through Windows Firewall if asked.
3. Put the controllers down, make sure **hand tracking** is on (Settings → Movement tracking → Hand tracking) and sit down. Tap **Enter VR** on the home screen (or accept the browser's own Enter VR prompt) and you're in the cell.
   The Song of Quiet Flower is played with hands. If you pick the controllers up anyway, they're drawn as hands, not controllers.

USB alternative: `adb reverse tcp:8081 tcp:8081`, then open `https://localhost:8081` on the headset.

## How to play

| Do | Gesture |
|---|---|
| Summon / dismiss the staff | **Clap**, then pull your hands about 30 cm apart. Dismiss: clap again, or poke the grey knot at the staff's right end. |
| Add a note | **Pinch** a coloured token under the staff, move it onto the staff, let go. It snaps to its own line at the next beat. |
| Remove a note | Pinch it on the staff and let go away from the staff. |
| Pick things up | Look at the bag and **pinch**; pinch torn pieces to carry them. |
| Aim Rise | Look at the pebble, the crate or the door bar. It glows teal when targeted. |
| Cast | Close either hand into a **fist** and hold until the gold ring around it fills (~0.35 s). |

Notes unlock as you find spells: the Cell gives **Ga** and **Ma** (Rise = **Ga Ma**). Cast again to set the object down. The staff can't be summoned until the torn song is whole.

### Keyboard (desktop / emulator)

`Space` staff · `1`–`4` add Sa / Re / Ga / Ma · `Backspace` remove last · `Enter` cast · `Esc` dismiss · `P` the scene's pinch (open the bag, place the next torn piece).
In a normal desktop browser (no VR), click **Play in browser** on the home screen; **drag (or use the arrow keys) to look around** so you can aim Rise. The keys are listed at the bottom left and **Home** goes back.

### URL options (no rebuild needed)

| Add to the URL | Effect |
|---|---|
| `?debug=1` | Live readout under your view: pinch distance, fist %, palm distance, clap phase, target, fps. **Use this for the gesture tests.** |
| `?notation=western` | A B♭ C D instead of Sa Re Ga Ma |
| `?hold=450` | Fist hold time in ms (150–1000, default 350) |
| `?summon=hold` | Also allow one-hand summon: pinch and hold still for 1 s |
| `?dist=50` | Staff distance in cm (30–70, default 45) |
| `?learn=all` | Every spell and note unlocked; the Cell starts at its last step (the door bar) |
| `?scene=corridor` | Start in a scene (`cell`, `corridor`, `yard`, `gate`, `dawn`); scenes not built yet show a placeholder card |

Combine with `&`, e.g. `https://192.168.1.20:8081/?debug=1&hold=450`.

**Hand-tracking test page:** open `/test` (e.g. https://kodekraftr.github.io/quiet-flower/test). Bring both palms together and hold for 1 s to set 0,0,0; then each hand shows its palm position from there as signed x/y/z in cm (x+ right, y+ up, z+ forward), which fingers are open or closed, and **FIST**. The readout floats in front of you in VR and is mirrored on the page.

## Week-1 acceptance test (go / no-go on Oct 12)

Seated on a Quest 3 or 3S, with `?debug=1`:

- [ ] Clap summons the staff **9 of 10** tries; no accidental summons in 2 minutes of composing.
- [ ] Pinch-place a note on the staff **19 of 20** tries.
- [ ] No accidental casts in 2 minutes of composing; a deliberate fist-hold casts every time.
- [ ] Ga Ma + fist → the pebble rises; again → it settles. Other melodies → a Curiosity.
- [ ] Steady **≥ 72 fps** (debug readout, or the OVR Metrics HUD).

If the clap is unreliable, try `?summon=hold`. If casts fire by accident, raise `?hold=`. Tell me the numbers from the debug readout and I'll retune the thresholds in `src/input/gestures.ts`.

## Code map

| Path | What |
|---|---|
| `src/game/notes.ts` | Lines, names (sargam/western), pitches, colours, shapes |
| `src/game/spells.ts` | Spell data, exact melody matching, Free rule, Curiosities |
| `src/game/hearing.ts` | The hearing rule (ready for Scene 3) |
| `src/input/gestures.ts` | Pinch, fist-hold, one-hand hold, clap detectors (pure, unit-tested) |
| `src/systems/hand-input.ts` | Reads 25 joints per hand from the XR frame, runs the detectors |
| `src/systems/staff.ts` | Staff: summon, palette, pick/drop notes, cast ring, cast |
| `src/systems/targeting.ts` | Head-direction targeting for Rise |
| `src/systems/effects.ts` | Ripples, Rise lift, Curiosities, captions, ambient motion |
| `src/systems/keyboard.ts`, `debug-hud.ts` | Keyboard fallback, live gesture readout |
| `src/scene/cell.ts` | Loads the baked cell (`public/models/cell.glb`), blob shadows, moonbeam, dust |
| `src/scene/baked.ts` | Baked-light materials: lantern flicker and target tint as colour multipliers |
| `art/` | Blender scripts that build, light, bake and export the cell (`art/README.md`) |
| `src/audio/synth.ts` | Synthesised notes and sounds (placeholders for recorded hum + kalimba) |
| `tests/` | 33 unit tests: `npm test` |

Other commands: `npm test` · `npm run typecheck` · `npm run build` (output in `dist/`, deploy to GitHub Pages as in `../docs/BEST_PRACTICES.md` §9).

## Known limits of this prototype

- Only Rise does something visible; Sleep/Cuckoo/Free need listeners (Scene 3+).
- Notes are synthesised; the staff is placeholder art. The cell is real art but still uses procedural materials (see `art/README.md` for swapping in scanned textures).
- The bundle is ~1.7 MB compressed, mostly the SDK. Trimming it is part of the cold-start pass.
- The optional IWSDK "reference" cache failed to download in the build sandbox; on your PC run `npm run reference:warmup` once if you want it (not needed to run the game).

## Deploy (GitHub Pages)

Every push to `master` builds the app and publishes `dist/` via `.github/workflows/deploy.yml`.
One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Live at https://kodekraftr.github.io/quiet-flower/.
