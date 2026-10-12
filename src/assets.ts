import { AssetType, defineAssets } from '@iwsdk/core';

// Scenes are modelled, lit and baked in Blender (see art/README.md); characters are
// skinned low-poly figures (art/build_figure.py). The first scene blocks start-up;
// the rest download in the background while the player is busy.
export default defineAssets({
  cell: { url: './models/cell.glb', type: AssetType.GLTF, priority: 'critical', name: 'Cell (baked)' },
  corridor: { url: './models/corridor.glb', type: AssetType.GLTF, priority: 'background', name: 'Corridor (baked)' },
  figures: { url: './models/figures.glb', type: AssetType.GLTF, priority: 'background', name: 'Characters' },
});
