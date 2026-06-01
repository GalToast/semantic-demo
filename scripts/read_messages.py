import json
import sys

transcript_path = r"C:\Users\HP\.gemini\antigravity\brain\40f6a4a8-1a4f-4edd-a70c-f588823e827b\.system_generated\logs\transcript.jsonl"

try:
    with open(transcript_path, 'r', encoding='utf-8') as f:
        for line in f:
            data = json.loads(line)
            content = data.get("content", "")
            if isinstance(content, str) and "[Message]" in content and "sender=" in content:
                print("-" * 40)
                print(content.encode('utf-8', 'replace').decode('utf-8', 'replace'))
except Exception as e:
    print(f"Error: {e}")
