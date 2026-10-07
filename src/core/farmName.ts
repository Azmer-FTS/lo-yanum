/**
 * ★★ AT6.3 — LA RÈGLE DU NOM CORRIGÉ À LA SIGNATURE, PURE : partagée par la
 * fiche (`correctFarmName`) et par l'édition (brouillon). La faute est dans ce
 * que le document imprime (« שם החווה » = `farmName`, sinon `name`) ; la
 * correction va dans ce champ, et dans le nom de la fiche s'il portait la
 * même faute.
 */
export function correctedNames(name: string, farmName: string | undefined, next: string): { name: string; farmName: string | undefined } {
  const printed = (farmName ?? '').trim() || name.trim()
  let outName = name
  let outFarm = farmName
  let done = false
  if ((farmName ?? '').trim() !== '' && (farmName ?? '').trim() === printed) {
    outFarm = next
    done = true
  }
  if (name.trim() === printed) {
    outName = next
    done = true
  }
  if (!done) outFarm = next
  return { name: outName, farmName: outFarm }
}
