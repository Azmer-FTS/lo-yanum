import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { homeRouteFor, listSessionPresets } from '@core/index'
import type { Role, SessionPreset } from '@core/index'

import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Callout, FilterPill, Section } from '../components/primitives'
import { useCoreValue } from '../hooks/useCore'
import { stopViewAs, useViewAs, viewAs } from './viewAs'

/**
 * ★★ Y13 (2026-09-04) — "מצב תצוגה", THE COORDINATOR'S OWN TEST DOOR.
 *
 * See `viewAs.ts` for why this is safe — and, since AG1, why it is no longer
 * demo-only. What is here is the choosing: a role, then the person.
 *
 * ⚠️ ET LA PERSONNE N'EST PAS FACULTATIVE EN PRATIQUE, MÊME SI LE BRIEF DIT
 *    « optionnellement ». Un écran d'agriculteur EST l'écran d'un agriculteur :
 *    sans personne, `getMyFarm()` rend `null` et les trois onglets sont vides.
 *    Ce qui est fait à la place est de rendre le choix immédiat — la pastille
 *    du rôle ouvre SA liste, chaque nom est une tuile, et le compte sur la
 *    pastille dit d'avance s'il y a quelqu'un à regarder.
 *
 * ★ THE PEOPLE ARE THE APP'S OWN, NOT A LIST TYPED HERE. `listSessionPresets`
 *   already answers "whose screen is worth looking at" — a farmer whose farm
 *   has guards, a volunteer who carries a group phone, a driver with a trip —
 *   because the landing screen has asked it since the POC. Reusing it means
 *   the product owner cannot land on an empty screen and think the interface
 *   is broken when it is the fixture that is.
 */
const ROLES: Role[] = ['farmer', 'volunteer', 'driver']

export function ViewAsSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const presets = useCoreValue(listSessionPresets)
  const active = useViewAs()
  const [role, setRole] = useState<Role>('farmer')
  /** The role actually in force — `null` means the coordinator's own. */
  const activeRole: Role | null = active?.role ?? null

  const people = useMemo(
    () => presets.filter((p) => p.role === role),
    [presets, role],
  )

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ★★ AG1 (2026-09-09) — IL SE REND MAINTENANT DANS LES DEUX BUILDS, ET LA
   *    RAISON POUR LAQUELLE IL NE SE RENDAIT PAS ÉTAIT UNE ERREUR DE
   *    RAISONNEMENT, PAS UNE PRÉCAUTION.
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * AF6 avait rendu l'absence PARLANTE — un encadré qui dit « va voir sur le
   * jumeau ». Le PO a répondu ce qu'il fallait répondre : il ne veut pas
   * travailler sur une autre plateforme, il veut voir SES données.
   *
   * L'argument qui fermait la porte était : « avec Supabase, chaque lecture
   * est filtrée côté serveur, donc échanger la session côté client montrerait
   * un écran que le serveur ne servirait jamais ». La prémisse est fausse pour
   * CETTE application : `data/store.ts` hydrate le magasin UNE fois, sous
   * l'identité du coordinateur, et les 52 accesseurs d'`access.ts` lisent
   * ensuite cette mémoire — synchrones, jamais des promesses (c'est la
   * contrainte fondatrice écrite dans core/backend.ts). Il n'y a donc pas de
   * requête par écran à laquelle une identité pourrait être attachée.
   *
   * Le raisonnement complet, avec ce qu'il ne prouve PAS, est dans `viewAs.ts`.
   * Ce qui se passe ici est le CHOIX ; ce qui rend le choix sûr est le verrou
   * de `setReadOnly`, posé par `viewAs()` et vérifié par A140 dans le magasin
   * plutôt que sur les boutons.
   */
  const step = (preset: SessionPreset): void => {
    viewAs(preset)
    navigate(homeRouteFor(preset.role))
  }

  return (
    <Section
      title={t('viewAs.title')}
      /* ★★ AB5b — FIRST BLOCK ON THE SCREEN, AND FLUSH WITH ITS TOP. See the
         note on the call site in `SettingsScreen`: measured at 2630 px down a
         3260 px page on the deployed twin, which is three phone screens of
         scrolling to find the one control he was looking for. */
      flush
      collapseKey="settings-viewas"
      summary={active ? `${t(`roles.${active.role}`)} · ${active.name}` : undefined}
    >
      {/* ★ AG1.2 — CE QUE LE MODE FAIT ET CE QU'IL NE FAIT PAS, DIT AVANT
          D'Y ENTRER. « Lecture seule » écrit après coup dans un bandeau est
          une découverte ; écrit ici, c'est une promesse. */}
      <Callout tone="info" title={t('viewAs.title')}>
        {t('viewAs.hint')}
      </Callout>

      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card bg-accent/10 p-3">
          <Icon name="users" size={16} className="text-accent-ink" />
          <span className="text-caption text-content-primary">
            {t('viewAs.current', {
              role: t(`roles.${active.role}`),
              name: active.name,
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              stopViewAs()
              navigate('/coordinator')
            }}
            data-testid="view-as-stop"
            className="btn-secondary ms-auto py-1.5 text-micro"
          >
            <Icon name="close" size={13} />
            {t('viewAs.back')}
          </button>
        </div>
      )}

      {/**
        * ★★ Y3.2 (2026-09-06) — THE FOUR ROLES, AND רכז IS ONE OF THEM.
        *
        *    "La bascule de rôle est introuvable aujourd'hui. Créer une entrée
        *     claire « מצב תצוגה » listant les quatre rôles (רכז, חקלאי,
        *     מתנדב, נהג), avec le rôle actif marqué et un retour immédiat au
        *     rôle coordinateur."
        *
        * ★ Y13 built this as a chooser of PEOPLE TO IMPERSONATE, so רכז was
        *   not in the row: there is nobody to impersonate, it is who you are.
        *   Which is exactly why it was not findable — a coordinator looking
        *   for "where do I switch roles" was looking for a row of four and
        *   finding a row of three that did not contain his own.
        *
        *   רכז is the first pill now, it is MARKED when no simulation is
        *   running, and pressing it is the way back — the same one the banner
        *   offers, in the place the eye looks for it.
        */}
      <div className="mt-3" data-testid="role-switch">
        {/* ★★ AB5b (2026-09-08) — A PILL ROW, AND NOT A `FilterRow` ANY MORE.
            These four are not filters and never were; they were borrowing the
            component because it drew the row. AB2 makes that borrowing wrong
            as well as inaccurate: a `FilterRow` now FOLDS itself behind
            « סינון » when its pills would take two lines, and the one control
            the product owner could not find would have hidden itself behind a
            button called "filter". `.pill-row` is the shared geometry — the
            10 px / 20 px AA1.2 measured — with none of the behaviour. */}
        <div className="pill-row">
          <FilterPill
            active={active === null}
            onClick={() => {
              stopViewAs()
              navigate('/coordinator')
            }}
          >
            <Icon name="shield" size={11} />
            {t('roles.coordinator')}
            {active === null && <Icon name="check" size={11} />}
          </FilterPill>
          {ROLES.map((r) => (
            /**
              * ★★ AB5b.2 — « LE RÔLE ACTIF MARQUÉ », AND THE ACCENT SKIN IS
              *    NOW THAT AND ONLY THAT.
              *
              * Y3.2 gave the skin to « which list is open below », so on a
              * fresh settings screen BOTH רכז and חקלאי were drawn as on —
              * measured, both `aria-pressed="true"` — and neither of them was
              * the answer to "which role am I in". The two facts are still
              * both shown, but the loud one is the one the sentence asks for:
              * the accent means IN FORCE, the chevron means "this is the list
              * you are looking at".
              */
            <FilterPill
              key={r}
              active={activeRole === r}
              dot={role === r ? <Icon name="chevronDown" size={11} /> : undefined}
              onClick={() => setRole(r)}
              count={presets.filter((p) => p.role === r).length}
            >
              {t(`roles.${r}`)}
              {activeRole === r && <Icon name="check" size={11} />}
            </FilterPill>
          ))}
        </div>
      </div>

      {people.length === 0 ? (
        <p className="muted">{t('viewAs.nobody')}</p>
      ) : (<>
        <p className="muted mb-1.5">{t('viewAs.pick')}</p>
        <ul
          data-testid="view-as-people"
          className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]"
        >
          {people.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => step(preset)}
                data-testid="view-as-person"
                className="tile-interactive flex w-full items-center gap-2.5 px-3 py-2 text-start"
              >
                <Avatar photo={null} name={preset.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption font-medium text-content-primary">
                    {preset.name}
                  </span>
                  <span className="muted block truncate">{preset.detail}</span>
                </span>
                <Icon name="chevron" size={14} className="shrink-0 rtl:-scale-x-100 text-content-muted" />
              </button>
            </li>
          ))}
        </ul>
      </>)}
    </Section>
  )
}
