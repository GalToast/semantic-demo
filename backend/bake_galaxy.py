import sqlite3
import pandas as pd
import numpy as np
import struct
import umap
from pathlib import Path
import time

REPO_ROOT = Path(__file__).resolve().parent
DB_PATH = REPO_ROOT / "crm.sqlite"

def blob_to_vector(blob, dim):
    return np.array(struct.unpack(f'{dim}f', blob), dtype=np.float32)

def bake_model_galaxy(model_name_query, suffix):
    print(f"\n🚀 Baking Galaxy for: {model_name_query} ({suffix})...")
    cache_path = REPO_ROOT / f"galaxy_cache_{suffix}.parquet"
    
    conn = sqlite3.connect(DB_PATH)
    # Find the specific model key
    model_key_row = pd.read_sql_query("SELECT embedding_model FROM leadops_vector_embeddings WHERE embedding_model LIKE ? LIMIT 1", conn, params=[f"%{model_name_query}%"])
    
    if model_key_row.empty:
        print(f"⚠️ No embeddings found for {model_name_query}. Skipping.")
        conn.close()
        return
    
    model_key = model_key_row.iloc[0]['embedding_model']
    print(f"📊 Found model: {model_key}")
    
    print(f"⏳ Extracting vectors...")
    df = pd.read_sql_query("""
        SELECT e.lead_id, e.vector_blob, e.embedding_dim,
               l.name, l.status, l.outreach_status,
               COALESCE(a.audience_family, 'unknown') as audience_family,
               COALESCE(a.audience_type, 'unknown') as audience_type
        FROM leadops_vector_embeddings e
        JOIN leadops_leads l ON e.lead_id = l.lead_id
        LEFT JOIN leadops_v_audience_classification a ON l.lead_id = a.lead_id
        WHERE e.doc_type = 'profile_markdown' AND e.embedding_model = ?
        ORDER BY e.lead_id ASC
    """, conn, params=[model_key])
    conn.close()
    
    if df.empty:
        print("⚠️ No profile embeddings found. Skipping.")
        return
        
    print(f"✅ Extracted {len(df)} leads.")

    dim = df.iloc[0]['embedding_dim']
    vectors = [blob_to_vector(blob, dim) for blob in df['vector_blob']]
    vectors_arr = np.vstack(vectors)
    
    print(f"🌌 Crushing {dim} dimensions down to 2D using UMAP...")
    start_time = time.time()
    reducer = umap.UMAP(n_neighbors=15, min_dist=0.1, metric='cosine', random_state=42)
    umap_coords = reducer.fit_transform(vectors_arr)
    print(f"✅ UMAP complete in {time.time() - start_time:.2f}s.")

    df['umap_x'] = umap_coords[:, 0]
    df['umap_y'] = umap_coords[:, 1]
    
    export_df = df[['lead_id', 'name', 'status', 'outreach_status', 'audience_family', 'audience_type', 'umap_x', 'umap_y']]
    export_df.to_parquet(cache_path)
    print(f"💾 Galaxy baked and saved to {cache_path}!")

def main():
    # Bake BOTH universes
    bake_model_galaxy("0.6B", "0.6B")
    bake_model_galaxy("4B", "4B")
    print("\n✨ Dual-Universe Baking Complete!")

if __name__ == "__main__":
    main()
