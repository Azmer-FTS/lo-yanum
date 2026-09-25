/**
 * ★★ AP5 — LE POINT D'ENTRÉE EST ICI PARCE QUE VITE SERT UNE RACINE.
 *
 * ⚠️ CE FICHIER NE CONTIENT RIEN, ET C'EST TOUT CE QU'IL DOIT FAIRE. La racine
 *    de ce build est `bakasha/` (voir `vite.bakasha.config.ts`) : un
 *    `<script src="../src/…">` dans l'`index.html` désigne un chemin HORS de
 *    la racine, que le serveur de développement rend en 404 — mesuré, pas
 *    supposé. Le code vit avec le reste du projet, sous `src/bakasha/` ; cette
 *    ligne est le pont entre les deux.
 */
import '../src/bakasha/main'
