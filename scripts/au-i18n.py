import json, sys
# AU — ajoute des clés aux trois fichiers de langue sans toucher au format.
def put(lang, path, value):
    p = f'src/locales/{lang}.json'
    d = json.load(open(p))
    node = d
    keys = path.split('.')
    for k in keys[:-1]:
        node = node.setdefault(k, {})
    node[keys[-1]] = value
    open(p, 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
spec = json.load(open(sys.argv[1]))
for path, by in spec.items():
    for lang, v in by.items():
        put(lang, path, v)
