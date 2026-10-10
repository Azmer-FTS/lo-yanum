"""AX4 — range les paragraphes d'explication d'ouverture de section derrière le ⓘ de `Section`.

Motif exact : `<Section …>` (une ligne) suivi d'une ligne `<p className="muted…">{t('clé')}</p>`
(sans autre attribut que la classe). Le paragraphe devient `info={t('clé')}` sur la Section.
Rien d'autre n'est touché. Usage : python3 scripts/axsweep.py fichiers…
"""
import re, sys
SEC = re.compile(r'^(\s*)<Section ((?:(?!>\s*$).)*)>\s*$')
PAR = re.compile(r'^\s*<p className="muted(?: [a-z0-9\- ]+)?">\{(t\([^{}]*\))\}</p>\s*$')
total = 0
for path in sys.argv[1:]:
    lines = open(path).read().split('\n')
    out = []
    i = 0
    n = 0
    while i < len(lines):
        m = SEC.match(lines[i])
        if m and i + 1 < len(lines) and 'info=' not in lines[i]:
            p = PAR.match(lines[i + 1])
            if p:
                out.append(f'{m.group(1)}<Section {m.group(2)} info={{{p.group(1)}}}>')
                i += 2
                n += 1
                continue
        out.append(lines[i])
        i += 1
    if n:
        open(path, 'w').write('\n'.join(out))
        print(f'  {n:3d}  {path}')
        total += n
print(f'  {total} paragraphes rangés derrière ⓘ')
