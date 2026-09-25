/**
 * ★★ AP3.5 — RÉGÉNÈRE `src/bakasha/agreementShipped.ts` DEPUIS `he.json`.
 *
 * Le texte livré de « הסכם התנדבות- ארצנו » a UNE source :
 * `settings.agreementDoc.defaultTemplate`. La page publique ne peut pas
 * importer `he.json` (124 ko de libellés qu'elle n'affiche jamais), donc elle
 * en porte une extraction — engendrée ici, jamais tapée, et comparée par
 * `bun run appass`.
 *
 *   bun run scripts/apshipped.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LOCALE = fileURLToPath(new URL('../src/locales/he.json', import.meta.url))
const OUT = fileURLToPath(new URL('../src/bakasha/agreementShipped.ts', import.meta.url))

export function shippedAgreementTemplate(): string {
  const json = JSON.parse(readFileSync(LOCALE, 'utf8')) as {
    settings: { agreementDoc: { defaultTemplate: string } }
  }
  return json.settings.agreementDoc.defaultTemplate
}

export const HEADER = `/**
 * ★★ AP3.5 — LE TEXTE LIVRÉ DE « הסכם התנדבות- ארצנו », EXTRAIT DE \`he.json\`.
 *
 * ⚠️ CE FICHIER EST ENGENDRÉ, PAS ÉCRIT. Il porte mot pour mot
 *    \`settings.agreementDoc.defaultTemplate\` de \`src/locales/he.json\` — le
 *    fichier que lit l'application — et \`bun run appass\` échoue si les deux
 *    divergent d'un caractère. C'est ce qui fait de « une seule source » (AH5)
 *    une chose mesurable et non une intention.
 *
 * ⚠️ POURQUOI NE PAS IMPORTER \`he.json\` DIRECTEMENT : il pèse 124 ko et porte
 *    les deux mille libellés de l'application, que cette page n'affiche
 *    jamais. Le lecteur type est « sur son téléphone, entre deux tâches ».
 *
 * Régénérer : \`bun run scripts/apshipped.ts\`
 */
export default `

if (import.meta.main) {
  const text = shippedAgreementTemplate()
  writeFileSync(OUT, `${HEADER}${JSON.stringify(text)}\n`, 'utf8')
  console.log(`écrit dans src/bakasha/agreementShipped.ts (${text.length} caractères)`)
}
