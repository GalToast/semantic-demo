#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
umap-project-embeddings.py

Skip the embed (already done in re-embed-corpus.py) and just do the
UMAP projection. Updates data.dat in place with new x, y, z positions.
"""

import json
import time
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = REPO_ROOT / 'scripts'
DATA_DAT = REPO_ROOT / 'data.dat'
EMB_PATH = SCRIPTS_DIR / 'qwen3_embeddings.npy'


def main():
    print(f'=== Loading {EMB_PATH} ===')
    embeddings = np.load(EMB_PATH, mmap_mode='r')
    print(f'  shape: {embeddings.shape}')

    print(f'\n=== Reading {DATA_DAT} ===')
    data = json.loads(DATA_DAT.read_text(encoding='utf-8'))
    print(f'  {len(data)} records')

    print('\n=== UMAP projection to 3D ===')
    from umap import UMAP
    t0 = time.time()
    reducer = UMAP(
        n_components=3,
        n_neighbors=15,
        min_dist=0.1,
        metric='cosine',
        random_state=42,
    )
    coords = reducer.fit_transform(embeddings)
    print(f'  done in {time.time() - t0:.1f}s')
    print(f'  shape: {coords.shape}, x range [{coords[:,0].min():.2f}, {coords[:,0].max():.2f}]')
    print(f'           y range [{coords[:,1].min():.2f}, {coords[:,1].max():.2f}]')
    print(f'           z range [{coords[:,2].min():.2f}, {coords[:,2].max():.2f}]')

    print(f'\n=== Updating {DATA_DAT} ===')
    new_data = []
    for i, p in enumerate(data):
        row = list(p)
        row[0] = float(coords[i, 0])
        row[1] = float(coords[i, 1])
        row[2] = float(coords[i, 2])
        new_data.append(row)
    DATA_DAT.write_text(json.dumps(new_data, separators=(',', ':')), encoding='utf-8')
    print(f'  Wrote {len(new_data)} records with new 3D positions')
    print(f'  File size: {DATA_DAT.stat().st_size / 1024:.1f} KB')

    print('\n=== Done ===')
    print('Next: regenerate the bundle (npm run build) and deploy.')


if __name__ == '__main__':
    main()
