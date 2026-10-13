# BD — portes au rendu sur le DÉPLOYÉ d32390d (2026-10-13)

`version.json` = d32390d (builtAt 2026-10-13T00:13:57Z) ; portes du déploiement (workflow) toutes vertes.
Jumeau : https://azmer-fts.github.io/lo-yanum/demo · Application : https://azmer-fts.github.io/lo-yanum (base factice, rien d'écrit en production).

- bcmobile (jumeau) exit=0 165s   246 PASS · 0 FAIL
- aymobile (jumeau) exit=0 223s   48 PASS, 0 FAIL  (48 écrans à 402 px) → docs/ay/ay2-mobile-deploye.json
- aitheme (jumeau) exit=0 32s   18 passed · 0 failed
- bdui (app) exit=0 193s   76 PASS, 0 FAIL
- bbui (app) exit=0 118s   82 PASS, 0 FAIL
- ayscreens (app) exit=0 184s   57 PASS, 0 FAIL
- ayui (app) exit=0 495s   105 PASS, 0 FAIL
- azui (app) exit=0 348s   125 PASS, 0 FAIL
- az5ui (app) exit=0 24s   21 PASS, 0 FAIL
- axui (app) exit=0 291s   116 PASS, 0 FAIL
- baui (app) exit=0 64s   45 PASS, 0 FAIL
- avui (app) exit=0 248s   51 PASS, 0 FAIL
- auui (app) exit=0 235s   60 PASS, 0 FAIL
- awui (app) exit=0 244s   57 PASS, 0 FAIL
- amui (app) exit=0 458s   77 passed, 0 failed
- aqui (app) exit=0 304s   107 passed, 0 failed
- arfiche (app) exit=0 235s   144 passed, 0 failed
- assettings (app) exit=0 69s   All 20 checks passed.

Non rejouées ici : `anui`, `atui` (rouges d'avant BC, à l'identique en local : 148/2 et 124/15).
