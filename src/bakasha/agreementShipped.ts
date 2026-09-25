/**
 * ★★ AP3.5 — LE TEXTE LIVRÉ DE « הסכם התנדבות- ארצנו », EXTRAIT DE `he.json`.
 *
 * ⚠️ CE FICHIER EST ENGENDRÉ, PAS ÉCRIT. Il porte mot pour mot
 *    `settings.agreementDoc.defaultTemplate` de `src/locales/he.json` — le
 *    fichier que lit l'application — et `bun run appass` échoue si les deux
 *    divergent d'un caractère. C'est ce qui fait de « une seule source » (AH5)
 *    une chose mesurable et non une intention.
 *
 * ⚠️ POURQUOI NE PAS IMPORTER `he.json` DIRECTEMENT : il pèse 124 ko et porte
 *    les deux mille libellés de l'application, que cette page n'affiche
 *    jamais. Le lecteur type est « sur son téléphone, entre deux tâches ».
 *
 * Régénérer : `bun run scripts/apshipped.ts`
 */
export default "## הסכם התנדבות- ארצנו\n\nשם החקלאי: {{שם_החקלאי}}\nת״ז / ח״פ: {{תז_חפ}}\nנייד: {{נייד}}\nשם החווה: {{שם_החווה}}\nיישוב: {{יישוב}}\n\n## הצהרה ואישור\n\nמאשר כי בשנת {{שנה}} מתבצעת בשטחים החקלאיים שבהחזקתי פעילות של מתנדבי **ארגון \"ארצנו\" מבית עמותת שיבת ציון לרגבי אדמתה**, במסגרת פרויקט מתנדבים בחקלאות של משרד החקלאות וביטחון המזון.\nמתנדבי העמותה מסייעים לפחות באחד מהתחומים הבאים: **שמירה, חקלאות ומרעה.**"
