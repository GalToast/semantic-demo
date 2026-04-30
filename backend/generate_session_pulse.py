import os
import json
import glob
from collections import defaultdict
from datetime import datetime

TRACKER_DIR = ".tracker/tasks"

def generate_pulse():
    print("Generating Session Pulse...")
    
    if not os.path.exists(TRACKER_DIR):
        print(f"Directory {TRACKER_DIR} not found.")
        return

    task_files = glob.glob(os.path.join(TRACKER_DIR, "*.json"))
    
    stats = {
        "total_tasks": len(task_files),
        "status_counts": defaultdict(int),
        "type_counts": defaultdict(int),
        "stale_tasks": [],
        "recent_activity": []
    }
    
    now = datetime.now().timestamp() * 1000

    for file in task_files:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                status = data.get("status", "unknown")
                task_type = data.get("type", "unknown")
                
                stats["status_counts"][status] += 1
                stats["type_counts"][task_type] += 1
                
                updated_at = data.get("metadata", {}).get("updatedAt", 0)
                
                # Check if stale (no updates in > 7 days)
                if status == "open" and (now - updated_at) > 7 * 24 * 60 * 60 * 1000:
                    stats["stale_tasks"].append({
                        "id": data.get("id"),
                        "title": data.get("title")
                    })
                    
        except Exception as e:
            print(f"Error parsing {file}: {e}")
            
    print("\n=== SESSION PULSE ===")
    print(f"Total Tracked Entities: {stats['total_tasks']}")
    
    print("\nStatus Breakdown:")
    for k, v in stats['status_counts'].items():
        print(f"  - {k}: {v}")
        
    print("\nType Breakdown:")
    for k, v in stats['type_counts'].items():
        print(f"  - {k}: {v}")
        
    if stats["stale_tasks"]:
        print(f"\nWarning: Found {len(stats['stale_tasks'])} stale open tasks (inactive > 7 days):")
        for task in stats["stale_tasks"][:5]:
            print(f"  - [{task['id']}] {task['title']}")
        if len(stats['stale_tasks']) > 5:
            print("  - ...")

if __name__ == "__main__":
    generate_pulse()
