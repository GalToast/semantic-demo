import sqlite3
import json

DB_PATH = 'crm.sqlite'

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Check business_overview field population
    cur.execute("""
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN business_overview IS NOT NULL AND TRIM(business_overview) != '' THEN 1 ELSE 0 END) as has_business_overview
        FROM leadops_profiles
    """)
    row = cur.fetchone()
    print(f"Total profiles: {row['total']}")
    print(f"Profiles with business_overview: {row['has_business_overview']}")
    print(f"Missing: {row['total'] - row['has_business_overview']}")
    
    # Sample profiles with sections_json to find business overview content
    cur.execute("""
        SELECT lead_id, sections_json 
        FROM leadops_profiles 
        WHERE sections_json IS NOT NULL AND TRIM(sections_json) != ''
        LIMIT 10
    """)
    print("\nSample sections_json (first 10):")
    for row in cur.fetchall():
        try:
            sections = json.loads(row['sections_json'])
            if 'Business overview' in sections or 'Snapshot' in sections or 'Business Overview' in sections:
                print(f"\nLead {row['lead_id']}:")
                for k, v in sections.items():
                    if 'business' in k.lower() or 'snapshot' in k.lower() or 'overview' in k.lower():
                        print(f"  {k}: {v[:200] if v else 'empty'}...")
        except:
            pass
    
    conn.close()

if __name__ == '__main__':
    main()
