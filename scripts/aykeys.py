"""AY — les clés de traduction appelées par le code et absentes d'une langue.
   python3 scripts/aykeys.py [fichiers…]  (par défaut : tout src/ui)"""
import json, re, sys, pathlib
files = sys.argv[1:] or [str(p) for p in pathlib.Path('src/ui').rglob('*.tsx')]
# L'application est en hébreu ; en/fr sont partiels depuis longtemps (seul `he` fait foi).
langs = {l: json.load(open(f'src/locales/{l}.json', encoding='utf-8')) for l in ('he',)}
def has(d, k):
    for part in k.split('.'):
        if not isinstance(d, dict):
            return False
        if part in d:
            d = d[part]; continue
        if any(x.startswith(part + '_') for x in d):  # pluriels
            return True
        return False
    return True
missing = {}
for f in files:
    src = open(f, encoding='utf-8').read()
    for k in re.findall(r"\bt\(\s*'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'", src):
        for l, d in langs.items():
            if not has(d, k):
                missing.setdefault(k, set()).add(l)
for k, ls in sorted(missing.items()):
    print(f'{k}  ← manque en {",".join(sorted(ls))}')
print(f'{len(missing)} clé(s) manquante(s)')
sys.exit(1 if missing else 0)
