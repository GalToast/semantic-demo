#!/usr/bin/env python3
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
re-embed-corpus.py

Re-embeds the leadops corpus with Qwen3-Embedding-0.6B (1024-dim) and
UMAP-projects to 3D. Updates data.dat in place with new x, y, z
positions. Saves the 1024-dim embeddings to scripts/qwen3_embeddings.npy
for future KNN use (Bug Sweep 34 spatial KNN search).

Inputs (read from):
    - scripts/leadEnrichment.public.json  (crm.sqlite-derived enrichment)
    - data.dat                              (current 3D positions, kept cluster)
    - scripts/leadopsLeads.json             (crm leadops_leads table)
    - ../tmp/.../ask_moco_corpus.from-leadops.jsonl  (parent corpus JSONL)

Output (writes):
    - data.dat                              (rebuilt with new x, y, z)
    - scripts/qwen3_embeddings.npy          (8406 x 1024 float32)
    - scripts/qwen3_embeddings_meta.json    (model name, query instruction)

Model: Qwen3-Embedding-0.6B (1024 dim, mean-pool, L2-normalize).
Hyperparameters: 8406 records at ~340 chars avg → 5-10 min on GPU.

Bug Sweep 33 → 34: this is the re-embed pass that replaces the
prior 3D positions (which were computed from a thinner corpus).
"""

import json
import os
import sys
import time
from pathlib import Path

import numpy as np

# Force HF cache to read-only so we don't accidentally re-download
os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'  # use cached weights only

REPO_ROOT = Path(__file__).resolve().parents[1]
PARENT_DIR = REPO_ROOT.parent
SCRIPTS_DIR = REPO_ROOT / 'scripts'
DATA_DAT = REPO_ROOT / 'data.dat'

# Qwen3-Embedding-0.6B from the HF cache (already downloaded on this machine)
MODEL_PATH = Path(
    r'C:\Users\HP\.cache\huggingface\hub\models--Qwen--Qwen3-Embedding-0.6B'
    r'\snapshots\c54f2e6e80b2d7b7de06f51cec4959f6b3e03418'
)

# Match parent's Qwen3 mean-pool + L2-normalize contract
MAX_TEXT_CHARS = 4000
BATCH_SIZE = 16

# Parent corpus JSONL: same source the existing 1024-dim index used
PARENT_CORPUS_JSONL = (
    PARENT_DIR / 'tmp' / 'public-semantic-search-build'
    / 'ask_moco_corpus.from-leadops.jsonl'
)


def load_enrichment():
    """Load scripts/leadEnrichment.public.json (crm.sqlite-derived)."""
    path = SCRIPTS_DIR / 'leadEnrichment.public.json'
    if not path.exists():
        raise SystemExit(f'Missing {path}. Run scripts/extract-crm-sqlite.py + scripts/merge-enrichment.mjs first.')
    return json.loads(path.read_text(encoding='utf-8'))


def load_parent_corpus():
    """Load parent's polished corpus (search_text field)."""
    if not PARENT_CORPUS_JSONL.exists():
        print(f'  WARNING: parent corpus not found at {PARENT_CORPUS_JSONL}, skipping')
        return {}
    records = {}
    with PARENT_CORPUS_JSONL.open('r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            records[str(d['lead_id'])] = d
    return records


def load_leadops_leads():
    """Load crm leadops_leads (operational status, basic fields)."""
    path = SCRIPTS_DIR / 'leadopsLeads.json'
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding='utf-8'))


def build_corpus_text(lead_id, enrichment, parent_corpus, crm_lead):
    """Build the per-lead text used for embedding.

    Order of priority (most analytical / lead-specific first):
    1. parent corpus's search_text (already polished by parent pipeline)
    2. snapshot (lead's own one-liner — most "what they do")
    3. business_overview (parent's polished version, redundant with #1)
    4. business_overview_extended (crm's analyst note)
    5. observations (crm pre-parsed analysis paragraph)
    6. contact_decision_makers (multi-person contact list)
    7. name + what + city + naics + address (basic fields)
    8. audit_highlights, security_trust, ux_conversion (when present)
    """
    parent = parent_corpus.get(lead_id, {})
    enr = enrichment.get(lead_id, {})
    crm = crm_lead.get(lead_id, {})

    parts = []

    # Identity
    name = crm.get('name') or parent.get('name') or ''
    if name:
        parts.append(f"Business: {name}")
    if crm.get('naics') or parent.get('naics'):
        parts.append(f"NAICS: {crm.get('naics') or parent.get('naics')}")
    if crm.get('address'):
        parts.append(f"Address: {crm['address']}")
    if crm.get('city') or parent.get('city'):
        parts.append(f"City: {crm.get('city') or parent.get('city')}")

    # Lead's own words
    if parent.get('search_text'):
        parts.append(parent['search_text'])
    if enr.get('snapshot'):
        parts.append(f"Snapshot: {enr['snapshot']}")
    if enr.get('business_overview_extended') and enr.get('business_overview_extended') != enr.get('snapshot'):
        parts.append(f"Business overview: {enr['business_overview_extended']}")
    if enr.get('observations'):
        parts.append(f"Observations: {enr['observations']}")
    if enr.get('contact_decision_makers'):
        parts.append(f"Contacts: {enr['contact_decision_makers']}")
    if enr.get('audit_highlights'):
        parts.append(f"Audit findings: {enr['audit_highlights']}")
    if enr.get('security_trust'):
        parts.append(f"Security: {enr['security_trust']}")
    if enr.get('ux_conversion'):
        parts.append(f"UX: {enr['ux_conversion']}")
    if parent.get('what') or crm.get('what'):
        parts.append(parent.get('what') or crm.get('what'))

    text = '\n'.join(parts)
    # Truncate to model's max input
    return text[:MAX_TEXT_CHARS]


def load_model():
    import torch
    from transformers import AutoModel, AutoTokenizer

    print(f'Loading model from {MODEL_PATH}...')
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_PATH), local_files_only=True)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = AutoModel.from_pretrained(
        str(MODEL_PATH),
        local_files_only=True,
        dtype=torch.float16 if device == 'cuda' else torch.float32,
    )
    model.to(device)
    model.eval()
    print(f'Model loaded on {device}, dim={model.config.hidden_size}')
    return model, tokenizer, device


def encode_texts(model, tokenizer, device, texts):
    import torch
    vectors = []
    n = len(texts)
    t0 = time.time()
    for start in range(0, n, BATCH_SIZE):
        batch = [t[:MAX_TEXT_CHARS] for t in texts[start:start + BATCH_SIZE]]
        encoded = tokenizer(
            batch,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors='pt',
        ).to(device)
        with torch.no_grad():
            outputs = model(**encoded)
            attention_mask = encoded['attention_mask'].unsqueeze(-1)
            hidden = outputs.last_hidden_state
            masked = hidden * attention_mask
            pooled = masked.sum(dim=1) / attention_mask.sum(dim=1).clamp(min=1)
            pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
        vectors.append(pooled.cpu().numpy().astype(np.float32))
        if (start // BATCH_SIZE) % 10 == 0:
            elapsed = time.time() - t0
            rate = (start + len(batch)) / max(elapsed, 0.001)
            eta = (n - start - len(batch)) / max(rate, 0.001)
            print(f'  {start + len(batch)}/{n}  ({rate:.0f}/s, eta {eta:.0f}s)')
    return np.concatenate(vectors, axis=0) if vectors else np.zeros((0, 0), dtype=np.float32)


def umap_project(embeddings, n_components=3, n_neighbors=15, min_dist=0.1):
    from umap import UMAP
    print(f'UMAP: {embeddings.shape} -> {n_components}D  (n_neighbors={n_neighbors}, min_dist={min_dist})')
    reducer = UMAP(
        n_components=n_components,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric='cosine',
        random_state=42,
    )
    coords = reducer.fit_transform(embeddings)
    print(f'  Output shape: {coords.shape}, range x={coords[:,0].min():.2f}..{coords[:,0].max():.2f}')
    return coords


def main():
    print('=== Loading sources ===')
    enrichment = load_enrichment()
    print(f'  enrichment: {len(enrichment)} leads')
    parent_corpus = load_parent_corpus()
    print(f'  parent corpus: {len(parent_corpus)} leads')
    crm_leads = load_leadops_leads()
    print(f'  crm leadops_leads: {len(crm_leads)} leads')

    # Load current data.dat to get cluster + ordering
    print(f'\n=== Reading {DATA_DAT} ===')
    data = json.loads(DATA_DAT.read_text(encoding='utf-8'))
    print(f'  {len(data)} records')

    # Build corpus text in data.dat order
    print('\n=== Building corpus text ===')
    texts = []
    for p in data:
        lead_id = str(p[7]) if len(p) > 7 and p[7] is not None else None
        if not lead_id:
            texts.append('Montgomery County business')
            continue
        text = build_corpus_text(lead_id, enrichment, parent_corpus, crm_leads)
        texts.append(text or 'Montgomery County business')
    avg_chars = sum(len(t) for t in texts) / max(len(texts), 1)
    print(f'  {len(texts)} texts, avg {avg_chars:.0f} chars')

    # Embed
    print('\n=== Embedding with Qwen3-Embedding-0.6B ===')
    model, tokenizer, device = load_model()
    embeddings = encode_texts(model, tokenizer, device, texts)
    print(f'  embeddings shape: {embeddings.shape}')

    # Save 1024-dim embeddings
    emb_path = SCRIPTS_DIR / 'qwen3_embeddings.npy'
    np.save(emb_path, embeddings)
    print(f'  Saved: {emb_path} ({emb_path.stat().st_size / 1024 / 1024:.1f} MB)')

    # Metadata
    meta = {
        'model': 'Qwen3-Embedding-0.6B',
        'model_path': str(MODEL_PATH),
        'dimensions': int(embeddings.shape[1]),
        'count': int(embeddings.shape[0]),
        'query_instruction': 'Given a Montgomery County business discovery query, retrieve the most relevant businesses, venues, and service providers that best satisfy the request.',
        'max_text_chars': MAX_TEXT_CHARS,
        'embedding_input_avg_chars': int(avg_chars),
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    meta_path = SCRIPTS_DIR / 'qwen3_embeddings_meta.json'
    meta_path.write_text(json.dumps(meta, indent=2), encoding='utf-8')
    print(f'  Saved: {meta_path}')

    # UMAP project to 3D
    print('\n=== UMAP projection to 3D ===')
    coords = umap_project(embeddings)

    # Update data.dat with new x, y, z
    print(f'\n=== Updating {DATA_DAT} ===')
    new_data = []
    for i, p in enumerate(data):
        row = list(p)
        # Update x, y, z (columns 0, 1, 2)
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
