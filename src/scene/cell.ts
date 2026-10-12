/**
 * Scene 2's cell: modelled, lit and baked in Blender (art/build_cell.py,
 * art/bake_export.py), loaded here as one GLB. Every surface uses an unlit
 * material with the Cycles lighting baked into its texture, so the room costs
 * about 11 draw calls, ~27k triangles and no real-time lights or shadows.
 *
 * Movable things (pebble, crate, door bar, door) are separate meshes; they were
 * left out of the room's baked shadows, so each gets a soft blob shadow that
 * fades as Rise lifts it. The door's origin is its hinge.
 */

import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COMMON_FLATS, type FlatColours, prepareBakedRoom, takeNodes } from './baked-room.js';

export interface Cell {
  /** Static room: everything that never moves. */
  room: Group;
  pebble: Object3D;
  crate: Object3D;
  doorBar: Object3D;
  /** Swings open about its own Y axis (origin = hinge); negative angles open it outward. */
  door: Object3D;
  /** Warm light at the far end of the corridor, shown once the door opens. */
  corridorGlow: Mesh;
  /** The grain sack in the corner: the player's bag. */
  bagCenter: Vector3;
  /** Centre of the lantern's glass (moths circle it). */
  lanternCenter: Vector3;
  dust: Points;
}

/** Flat colours for the surfaces that emit light or are only seen through gaps. */
const FLAT: FlatColours = {
  ...COMMON_FLATS,
  emit_sky: { color: 0x1a2a48 },
  emit_glass: { color: 0xffc27a, glow: true },
};

function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 80, 2, 32, 80, 64);
  grad.addColorStop(0, 'rgba(255,170,80,0.9)');
  grad.addColorStop(0.4, 'rgba(200,110,40,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function addBlob(room: Group, object: Object3D, size: number, y: number, opacity: number, tex: CanvasTexture): void {
  const blob = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(object.position.x, y, object.position.z);
  blob.renderOrder = 1;
  room.add(blob);
  object.userData.blob = blob;
  object.userData.blobOpacity = opacity;
}

export function buildCell(gltf: GLTF): Cell {
  const room = gltf.scene;
  room.name = 'cell-room';
  const lanternCenter = new Vector3(1.0, 1.49, -1.75);
  prepareBakedRoom(room, FLAT, (key, mesh) => {
    if (key === 'emit_glass') new Box3().setFromObject(mesh).getCenter(lanternCenter);
  });
  const { pebble, crate, door_bar: doorBar, door } = takeNodes(room, 'cell.glb', ['pebble', 'crate', 'door_bar', 'door']);

  const blob = blobTexture();
  addBlob(room, pebble, 0.15, 0.4415, 0.8, blob); // on the pedestal top
  addBlob(room, crate, 0.55, 0.003, 0.75, blob);

  // Faint moonbeam from the slit to the pale patch on the floor (both baked).
  const beam = new Mesh(
    new PlaneGeometry(0.2, 2.15),
    new MeshBasicMaterial({ color: 0x9fb8d8, transparent: true, opacity: 0.035, blending: AdditiveBlending, depthWrite: false }),
  );
  beam.position.set(-0.43, 0.99, -1.58);
  beam.rotation.set(-0.4, 0, 0.07);
  room.add(beam);

  // Dust motes; they slow down while the staff is open (time slows).
  const count = 160;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 2.2;
    positions[i * 3 + 1] = 0.5 + Math.random() * 1.4;
    positions[i * 3 + 2] = -0.2 - Math.random() * 1.6;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(positions, 3));
  const dust = new Points(
    dustGeo,
    new PointsMaterial({ color: new Color(0xdce8f5), size: 0.008, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  room.add(dust);

  // The corridor stub is baked unlit (see art/build_cell.py); torchlight round the corner.
  const glowTex = glowTexture();
  const corridorGlow = new Mesh(
    new PlaneGeometry(1.4, 2.0),
    new MeshBasicMaterial({ map: glowTex, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }),
  );
  corridorGlow.position.set(3.6, 1.0, -0.7);
  corridorGlow.rotation.y = -Math.PI / 2;
  corridorGlow.visible = false;
  room.add(corridorGlow);

  return {
    room: room as Group,
    pebble,
    crate,
    doorBar,
    door,
    corridorGlow,
    bagCenter: new Vector3(-1.16, 0.26, -1.22),
    lanternCenter,
    dust,
  };
}
