"""AX4 (2) — même règle qu'axsweep.py, pour une balise <Section …> écrite sur plusieurs lignes."""
import re, sys
PAR = re.compile(r'^\s*<p className="muted(?: [a-z0-9\- ]+)?">\{(t\([^{}]*\))\}</p>\s*$')
total = 0
for path in sys.argv[1:]:
    lines = open(path).read().split('\n')
    out = []; i = 0; n = 0
    while i < len(lines):
        if re.match(r'^\s*<Section\s*$', lines[i]) or (re.match(r'^\s*<Section\b', lines[i]) and not lines[i].rstrip().endswith('>')):
            j = i
            while j < len(lines) and not re.match(r'^\s*>\s*$', lines[j]) and not lines[j].rstrip().endswith('>'):
                j += 1
            block = lines[i:j+1]
            if j + 1 < len(lines) and not any('info=' in b for b in block) and not lines[j].rstrip().endswith('/>'):
                p = PAR.match(lines[j + 1])
                if p:
                    indent = re.match(r'^(\s*)', lines[i+1] if i+1 <= j else lines[i]).group(1)
                    if re.match(r'^\s*>\s*$', lines[j]):
                        out.extend(lines[i:j]); out.append(f'{indent}info={{{p.group(1)}}}'); out.append(lines[j])
                    else:
                        out.extend(lines[i:j]); out.append(lines[j][:-1].rstrip() + f' info={{{p.group(1)}}}>')
                    i = j + 2; n += 1; continue
            out.extend(block); i = j + 1; continue
        out.append(lines[i]); i += 1
    if n:
        open(path, 'w').write('\n'.join(out)); print(f'  {n:3d}  {path}'); total += n
print(f'  {total} paragraphes rangés derrière ⓘ')
