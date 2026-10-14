import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { getFarmInstitutionLinks, getInstitutions, institutionsOfFarm, linkFarmToInstitution, planLink, unlinkFarmFromInstitution } from '@core/index'
import type { Farm, Institution, LinkChoice } from '@core/index'

import { Icon } from '../components/Icon'
import { Modal } from '../components/primitives'
import { useCoreValue } from '../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BG (2026-10-14) — LE CHAÎNON, ET LA BOÎTE QUI GARDE LE PARRAINAGE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Au bout de chaque ligne de ferme de la fiche d'une institution :
 *   · chaînon FERMÉ (plein, teinté) = liée à CETTE institution ;
 *   · chaînon OUVERT (au trait, coupé) = pas liée à elle.
 * L'état se lit d'un coup d'œil (forme ET couleur), pas au survol.
 *
 *   ouvert → lier. Ferme liée à personne : le lien se crée.
 *            Ferme DÉJÀ liée ailleurs : RIEN ne se fait en silence — une boîte
 *            NOMME l'institution en place et propose, dans cet ordre :
 *            « להחליף » (en avant, le plus fréquent), « להוסיף », « ביטול ».
 *   fermé  → délier, après une confirmation brève.
 */

type Pending =
  | { kind: 'conflict'; farm: Farm; inst: Institution; others: Institution[] }
  | { kind: 'unlink'; farm: Farm; inst: Institution }

export function useFarmLinking(): { toggle: (farm: Farm, inst: Institution) => void; dialog: JSX.Element | null } {
  const { t } = useTranslation()
  const [pending, setPending] = useState<Pending | null>(null)

  const toggle = (farm: Farm, inst: Institution) => {
    const links = getFarmInstitutionLinks()
    const plan = planLink(links, farm.id, inst.id)
    if (plan.kind === 'already') {
      setPending({ kind: 'unlink', farm, inst })
      return
    }
    if (plan.kind === 'create') {
      linkFarmToInstitution(farm.id, inst.id)
      return
    }
    const all = getInstitutions()
    const others = plan.others.map((id) => all.find((i) => i.id === id)).filter((i): i is Institution => !!i)
    setPending({ kind: 'conflict', farm, inst, others })
  }

  const choose = (choice: LinkChoice) => {
    if (pending?.kind === 'conflict' && choice !== 'cancel') linkFarmToInstitution(pending.farm.id, pending.inst.id, choice)
    setPending(null)
  }

  const dialog =
    pending === null ? null : pending.kind === 'conflict' ? (
      <Modal title={t('sponsor.conflictTitle')} onClose={() => choose('cancel')} testId="link-conflict">
        <p className="text-body text-content-primary" data-testid="link-conflict-text">
          {t('sponsor.conflictBody', { farm: pending.farm.name })}
        </p>
        {/* ★ 5.3 — À QUI la ferme est déjà liée : le point important. */}
        <ul className="mt-2 flex flex-col gap-1" data-testid="link-conflict-current">
          {pending.others.map((o) => (
            <li key={o.id} className="flex min-h-11 items-center gap-2 rounded-field bg-status-warn/15 px-3 text-label font-bold text-status-warn-ink" data-inst={o.id}>
              <Icon name="link" size={16} />
              {o.name}
            </li>
          ))}
        </ul>
        <p className="muted mt-2 text-caption">{t('sponsor.conflictAsk', { inst: pending.inst.name })}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row" data-testid="link-conflict-choices">
          <button type="button" className="btn-primary min-h-11 flex-1" onClick={() => choose('replace')} data-testid="link-choice-replace" data-choice="replace">
            {t('sponsor.replace')}
          </button>
          <button type="button" className="btn-secondary min-h-11 flex-1" onClick={() => choose('add')} data-testid="link-choice-add" data-choice="add">
            {t('sponsor.add')}
          </button>
          <button type="button" className="btn-ghost min-h-11 flex-1" onClick={() => choose('cancel')} data-testid="link-choice-cancel" data-choice="cancel">
            {t('common.cancel')}
          </button>
        </div>
        <p className="muted mt-2 text-micro">{t('sponsor.replaceHint')}</p>
      </Modal>
    ) : (
      <Modal title={t('sponsor.unlinkTitle')} onClose={() => setPending(null)} testId="link-unlink">
        <p className="text-body text-content-primary">{t('sponsor.unlinkBody', { farm: pending.farm.name, inst: pending.inst.name })}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary min-h-11" onClick={() => setPending(null)} data-testid="link-unlink-cancel">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-danger min-h-11"
            data-testid="link-unlink-confirm"
            onClick={() => {
              unlinkFarmFromInstitution(pending.farm.id, pending.inst.id)
              setPending(null)
            }}
          >
            <Icon name="unlink" size={16} />
            {t('sponsor.unlink')}
          </button>
        </div>
      </Modal>
    )

  return { toggle, dialog }
}

/** Le chaînon : 44 px, fermé et teinté si la ferme est liée à CETTE institution. */
export function ChainButton({ linked, farmName, instName, onClick, testId }: { linked: boolean; farmName: string; instName: string; onClick: () => void; testId?: string }) {
  const { t } = useTranslation()
  const label = linked ? t('sponsor.unlinkAria', { farm: farmName, inst: instName }) : t('sponsor.linkAria', { farm: farmName, inst: instName })
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={linked}
      aria-label={label}
      title={label}
      data-testid={testId}
      data-linked={linked ? 'true' : 'false'}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-field border transition-colors duration-fast ${
        linked ? 'border-accent bg-accent text-content-on-accent hover:bg-accent/85' : 'border-dashed border-edge-strong bg-surface-raised text-content-muted hover:bg-surface-high hover:text-content-primary'
      }`}
    >
      <Icon name={linked ? 'link' : 'unlink'} size={18} />
    </button>
  )
}

/**
 * ★★ BG 5.4 — DANS LA FICHE DE LA FERME : à quelle(s) institution(s) elle est
 * liée. Une seule : une ligne discrète. Plus d'une : la même ligne, en teinte
 * d'avertissement — ce n'est pas une erreur, c'est l'exception à repérer.
 */
export function FarmSponsorLine({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const links = useCoreValue(() => getFarmInstitutionLinks())
  const all = useCoreValue(() => getInstitutions())
  const ids = institutionsOfFarm(links, farm.id)
  if (ids.length === 0) return null
  const insts = ids.map((id) => all.find((i) => i.id === id)).filter((i): i is Institution => !!i)
  const multi = insts.length > 1
  return (
    <p
      className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption ${multi ? 'font-semibold text-status-warn-ink' : 'text-content-secondary'}`}
      data-testid="farm-sponsor"
      data-count={insts.length}
    >
      <Icon name="link" size={14} />
      <span>{multi ? t('sponsor.multiShort', { count: insts.length }) : t('sponsor.label')}</span>
      {insts.map((i) => (
        <Link key={i.id} to={`/coordinator/coverage?inst=${i.id}`} className="inline-flex min-h-11 items-center underline-offset-2 hover:underline">
          {i.name}
        </Link>
      ))}
    </p>
  )
}
