/**
 * ★★ AN7.3 (2026-09-16) — LES MOUAATSOT AZORIOT, DEPUIS LE FICHIER DU למ״ס.
 *
 *   bun run scripts/councils.ts            # régénère src/core/councils.json
 *
 * `docs/data/cbs-bycode2021.xlsx` (« קובץ יישובים 2021 ») porte, pour chaque
 * localité, son « מעמד מונציפאלי » : le nom de la מועצה אזורית à laquelle elle
 * appartient, ou « עירייה » / « מועצה מקומית » / « חסר מעמד ». On en tire :
 *   · la liste COMPLÈTE des conseils régionaux (53 en 2021), triée ;
 *   · pour chaque סמל יישוב, l'index de son conseil.
 * Les villes et conseils locaux n'ont pas de מועצה אזורית : ils ne sont pas
 * dans la table, et une ferme rattachée à eux ne se voit rien proposer.
 */
const CBS = 'docs/data/cbs-bycode2021.xlsx'
const XLSX = await import('xlsx')
const wb = XLSX.read(new Uint8Array(await Bun.file(CBS).arrayBuffer()))
const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][]
const head = sheet[0] as string[]
const SEMEL = head.indexOf('סמל יישוב')
const STATUS = head.indexOf('שם מעמד מונציפאלי')
const PREFIX = 'מועצה אזורית '
const byName = new Map<string, number[]>()
for (const line of sheet.slice(1)) {
  const status = String(line[STATUS] ?? '').trim()
  const code = Number(line[SEMEL])
  if (!status.startsWith(PREFIX) || !Number.isInteger(code)) continue
  const name = status.slice(PREFIX.length).trim()
  byName.set(name, [...(byName.get(name) ?? []), code])
}
const names = [...byName.keys()].sort((a, b) => a.localeCompare(b, 'he'))
const byCode: Record<string, number> = {}
names.forEach((n, i) => {
  for (const code of byName.get(n) ?? []) byCode[String(code)] = i
})
await Bun.write('src/core/councils.json', JSON.stringify({ source: 'CBS bycode2021', names, byCode }) + '\n')
console.log(`${names.length} מועצות אזוריות, ${Object.keys(byCode).length} יישובים`)
