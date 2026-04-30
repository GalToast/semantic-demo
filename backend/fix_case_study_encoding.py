import os

def fix_file(path):
    print(f"Fixing {path}...")
    try:
        # Try reading with utf-8 first
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        # Fallback for weird encoding issues
        with open(path, 'r', encoding='latin-1') as f:
            content = f.read()

    # Define all bad/good pairs
    replacements = {
        'architectureâ€”delivering': 'architecture - delivering',
        'architecture - æždelivering': 'architecture - delivering',
        'architectureâ\x80\x94delivering': 'architecture - delivering',
        'â\x80\x94': ' - ',
        'â\x9c\x93': '✓',
        'â\x9c\x94': '✓',
        'â\x98\x85': '★',
        '—': ' - ',
        '极': '',
        'æž': '',
        'â˜…': '★',
        'âœ“': '✓'
    }

    for bad, good in replacements.items():
        content = content.replace(bad, good)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('mockups/ares-bento-case-study.html')
fix_file('mockups/ares-case-study-kyle-q7x9/index.html')
print("Done.")
