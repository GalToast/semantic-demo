import json

with open('package.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Properly escaped single-line JS string
data['scripts']['test:help'] = 'node -e "console.log([\\'test\\',\\'test:fast\\',\\'test:unit\\',\\'test:contract\\',\\'test:ci\\',\\'test:all\\',\\'test:stress\\',\\'test:smoke\\'].join(\\'\\\\n\\'))"'

with open('package.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=8, ensure_ascii=False)

print('Fixed test:help')
