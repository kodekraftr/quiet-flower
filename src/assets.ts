import { AssetType, defineAssets } from '@iwsdk/core';

// The cell is modelled, lit and baked in Blender: see art/README.md.
export default defineAssets({
  cell: { url: './models/cell.glb', type: AssetType.GLTF, priority: 'critical', name: 'Cell (baked)' },
});
