import json, sys

art_id = sys.argv[1] if len(sys.argv) > 1 else 'art-012'
art_file = sys.argv[2] if len(sys.argv) > 2 else f'/tmp/{art_id}.json'

with open('/var/www/ksef-guide/content/articles.json') as f:
    data = json.load(f)
with open(art_file) as f:
    new_art = json.load(f)
data = [a for a in data if a['id'] != art_id]
data.append(new_art)
with open('/var/www/ksef-guide/content/articles.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f'OK - injected {art_id}, total articles:', len(data))
