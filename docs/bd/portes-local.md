# BD — portes rejouées en local (2026-10-13)

Bilans seuls ; journaux complets dans `private/bd/logs/` (jamais dans `docs/`).

## Pures (code final)
- tokens : A28, A29 and A57 hold across src/.
- contrast : surface-high vs surface-raised (hover row)        1.22  1.04  PASS
- bdpass : 66 passed, 0 failed
- bcpass : 75 PASS · 0 FAIL
- bbpass : 51 PASS · 0 FAIL
- bapass : 38 PASS · 0 FAIL
- az5pass : 18 passed · 0 failed
- aypass : 25 PASS, 0 FAIL
- axpass : 40 PASS, 0 FAIL
- awpass : 60 PASS, 0 FAIL
- avpass : 15 PASS, 0 FAIL
- aupass : 48 PASS, 0 FAIL
- aopass : 113 passed, 0 failed
- aspass : All 84 checks passed.
- persist : All 148 checks passed.
- mapping : All 36 checks passed.
- deletion : All 61 checks passed.
- assoc : 42 passed, 0 failed
- acpass : 52 passed, 0 failed
- akpass : 56 passed, 0 failed
- ampass : 50 passed, 0 failed
- alpass : 40 passed, 0 failed
- anpass : 27 passed, 0 failed

## Au rendu — batterie complète
- bdui exit=0 209s   76 PASS, 0 FAIL
- bbui exit=1 148s   77 PASS, 5 FAIL
- aymobile exit=0 227s   48 PASS, 0 FAIL  (48 écrans à 402 px) → docs/ay/ay2-mobile-local.json
- bcmobile exit=1 182s   245 PASS · 2 FAIL  → docs/bc/bcmobile-local.json
- ayscreens exit=0 200s   57 PASS, 0 FAIL
- ayui exit=0 486s   105 PASS, 0 FAIL
- azui exit=0 360s   125 PASS, 0 FAIL
- az5ui exit=0 43s   21 PASS, 0 FAIL
- axui exit=1 294s   115 PASS, 1 FAIL
- baui exit=0 79s   45 PASS, 0 FAIL
- avui exit=0 267s   51 PASS, 0 FAIL
- auui exit=1 243s   59 PASS, 1 FAIL
- awui exit=0 263s   57 PASS, 0 FAIL
- amui exit=1 482s   73 passed, 4 failed
- aqui exit=1 316s   104 passed, 3 failed
- arfiche exit=0 250s   144 passed, 0 failed
- assettings exit=0 86s 
- aitheme exit=0 48s 
- ajupdate exit=0 91s   38 passed, 0 failed
- anui exit=1 333s   148 passed, 2 failed
- atui exit=1 319s   atui : 124 PASS · 15 FAIL

## Au rendu — portes adaptées puis rejouées (code final)
- bdui exit=0 207s   76 PASS, 0 FAIL
- bbui exit=0 132s   82 PASS, 0 FAIL
- bcmobile exit=0 179s   246 PASS · 0 FAIL  → docs/bc/bcmobile-local.json
- axui exit=0 296s   116 PASS, 0 FAIL
- auui exit=1 245s   59 PASS, 1 FAIL
- amui exit=0 483s   77 passed, 0 failed
- aqui exit=0 315s   107 passed, 0 failed
- auui exit=0 247s   60 PASS, 0 FAIL
- bdui exit=0 205s   76 PASS, 0 FAIL

Rouges ANTÉRIEURS à BD, à l'identique de BC : `anui` A236 (2), `atui` (15 : salle d'attente, AT4.4, A306, A301).
