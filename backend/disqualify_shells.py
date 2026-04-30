import os
import shutil

# List of Lead IDs to disqualify as property shells/holding companies or no public presence
DQ_LEAD_IDS = [
    4, 7, 8, 11, 13, 14, 16, 17, 18, 19, 21, 24, 25, 26, 28, 29,  # Batch 1
    167, 168, 171, 194,                                         # Batch 2
    766, 767,                                                   # Batch 8
    901, 905, 907, 909, 910, 914, 916, 930, 938, 939, 946, 949, 951, 956, 958, 960, 961, 962, 973, 974, # Batch 10 shells
    911, 920, 921, 923, 925, 928, 931, 933, 935, 936, 940, 942, 943, 944, 945, 947, 950, 952, 953, 955, 957, 959, 965, 966, 968, 972, 975, 976, 902, 903, 904, 908, 912, 913, 915, 917, 919, # Batch 10 no presence
    169, 514, 686, 698, 773, 783, 922, 926, 929, 932, 500 # Final 11
]

BASE_DIR = r"C:\Users\HP\Desktop\Temp while my comp is at the shop"
PROFILES_DIR = os.path.join(BASE_DIR, "leads", "profiles")
DISQUALIFIED_DIR = os.path.join(BASE_DIR, "leads", "disqualified")

def disqualify_lead(lead_id):
    # Find the lead folder
    found_folder = None
    for root, dirs, files in os.walk(PROFILES_DIR):
        # Skip range folders like 500-599 when looking for specific IDs
        # unless we are looking for the ID 500 specifically, but even then
        # lead folders are usually id-slug.
        for d in dirs:
            # Match exactly "id-slug" or just "id"
            if d.startswith(f"{lead_id}-") or d == str(lead_id) or d.startswith(f"0{lead_id}-"):
                # Ensure it's not a range folder like "500-599"
                if "-" in d:
                    parts = d.split("-")
                    if parts[0].isdigit() and parts[1].isdigit() and len(parts[1]) == 3:
                        # This is likely a range folder, skip it
                        continue
                found_folder = os.path.join(root, d)
                break
        if found_folder:
            break
    
    if not found_folder:
        # Check if already in disqualified
        return

    profile_path = os.path.join(found_folder, "profile.md")
    if os.path.exists(profile_path):
        with open(profile_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Update status and notes
        new_content = content.replace("Status: new", "Status: disqualified")
        new_content = new_content.replace("Status: ready", "Status: disqualified")
        new_content = new_content.replace("Contact search: not started", "Contact search: checked 2026-02-05")
        
        # Add DQ reason if not already there
        if "## Snapshot" in new_content and "Disqualified:" not in new_content:
            new_content = new_content.replace("## Snapshot", "## Snapshot\n- Disqualified: No public business presence identified or entity is a non-operational holding/shell.")
        
        with open(profile_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        # Determine destination range folder
        range_folder = os.path.basename(os.path.dirname(found_folder))
        dest_range_dir = os.path.join(DISQUALIFIED_DIR, range_folder)
        os.makedirs(dest_range_dir, exist_ok=True)
        
        # Move the folder
        dest_path = os.path.join(dest_range_dir, os.path.basename(found_folder))
        if os.path.exists(dest_path):
            shutil.rmtree(dest_path)
        shutil.move(found_folder, dest_path)
        print(f"Disqualified and moved Lead {lead_id}: {os.path.basename(found_folder)}")
    else:
        print(f"Profile for Lead {lead_id} not found at {profile_path}")

if __name__ == "__main__":
    for lead_id in DQ_LEAD_IDS:
        disqualify_lead(lead_id)
