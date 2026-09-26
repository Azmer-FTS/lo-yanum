import { useEffect, useMemo, useRef, useState } from 'react'

import {
  AID_NEEDS,
  AUTO_ADVANCE_DELAY_MS,
  AUTO_ADVANCE_STEPS,
  LAND_KINDS,
  REQUEST_STEPS,
  SKIPPABLE_STEPS,
  aidRequestProblems,
  canSubmit,
  documentsToSend,
  emptyAidRequest,
  stepProgress,
} from '@core/request'
import type { AidNeed, AidRequestDraft, LandKind, RequestStep } from '@core/request'
import { kindInputProps } from '@core/fieldKind'
import type { FieldKind } from '@core/fieldKind'
import type { Slot } from '@core/availability'

import { AppointmentStep } from './Appointment'
import { Agreement } from './Agreement'
import { DocumentsStep } from './Documents'
import { Signature } from './Signature'
import { CONFIGURED, RpcError, submitRequest } from './api'
import { CTA, T, refusalText } from './text'

/**
 * ⚠️ LES IMAGES SONT DES CHEMINS RELATIFS, PAS DES `import`. Elles vivent dans
 *    `bakasha/public/`, que Vite recopie tel quel ; et le build est en
 *    `base: './'`, donc `./artzenu-logo.png` se résout contre l'adresse de la
 *    page — `/lo-yanum/bakasha/` en production, `/` en local. Un chemin absolu
 *    marcherait en local et donnerait un 404 une fois déployé.
 */
const LOGO = './artzenu-logo.png'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP2 · AP3 (2026-09-25) — L'ACCUEIL, PUIS UNE QUESTION PAR ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « ⚠️ LE LECTEUR TYPE : un agriculteur, sur son téléphone, entre deux
 *     tâches, qui n'a pas d'ordinateur et peu l'habitude des formulaires en
 *     ligne. Le téléphone n'est pas un cas à supporter, c'est le cas
 *     principal. Chaque écran de trop est un abandon. »
 *
 * ★★ CE QUE CETTE PHRASE DÉCIDE, ÉCRAN PAR ÉCRAN :
 *
 *    · L'accueil ne porte RIEN d'autre qu'une photo, trois phrases et un
 *      bouton. Pas de menu, pas de liens (AP2.4) — un lien sur cette page est
 *      une sortie, et une sortie est un abandon.
 *    · Le bouton « המשך » est toujours au MÊME endroit, collé en bas, sur
 *      chaque écran OÙ IL SERT. Le pouce n'a jamais à le chercher.
 *    · ★ AR1 — sur les deux écrans à choix unique (`AUTO_ADVANCE_STEPS`), il
 *      n'y a PAS de bouton : le toucher est la réponse, la page montre la
 *      coche `AUTO_ADVANCE_DELAY_MS`, puis passe. Les écrans de SAISIE
 *      gardent leur bouton — c'est la personne qui dit quand elle a fini.
 *    · Le retour ne perd rien : l'état de la demande vit ICI, au-dessus des
 *      étapes, et aucune étape ne le remet à zéro en se démontant (AP3.6).
 *    · Les deux étapes facultatives le DISENT avec un bouton, jamais avec une
 *      croix : « aucune étape ne se saute par hasard, et aucune ne coince ».
 *
 * ⚠️ ET L'ÉTAT NE VIT PAS DANS UN ROUTEUR. Un HashRouter donnerait un retour
 *    navigateur qui remonte hors de la page à la première étape, ce qui est la
 *    dernière chose qu'on veut d'un lecteur qui hésite. Le retour est un
 *    bouton, visible, et il ramène à l'étape précédente.
 */
export default function App() {
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState<RequestStep>('need')
  const [draft, setDraft] = useState<AidRequestDraft>(emptyAidRequest)
  const [showProblems, setShowProblems] = useState(false)
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const top = useRef<HTMLDivElement | null>(null)
  /* ★ AR1 — l'avance automatique en attente. UNE seule à la fois : toucher
       une autre ligne pendant le délai la remplace (le dernier choix gagne),
       et « חזרה » l'annule. */
  const advance = useRef<number | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const cancelAdvance = () => {
    if (advance.current !== null) window.clearTimeout(advance.current)
    advance.current = null
    setAdvancing(false)
  }
  useEffect(() => cancelAdvance, [])

  const patch = (p: Partial<AidRequestDraft>) => setDraft((d) => ({ ...d, ...p }))

  const index = REQUEST_STEPS.indexOf(step)
  const problems = useMemo(() => aidRequestProblems(draft), [draft])
  const problemOf = (field: string) =>
    showProblems ? (problems.find((p) => p.field === field) ?? null) : null

  /* ★ CHAQUE ÉTAPE REPART DU HAUT. Sans cela, l'étape 4 s'ouvre au milieu
       parce que l'étape 3 était longue, et la question n'est pas lue. */
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' })
    window.scrollTo(0, 0)
    /* ★ AR1 — LE FOCUS VA À LA QUESTION. Le bouton touché (une ligne de choix)
       vient de disparaître avec son écran : sans cela, un lecteur d'écran et
       un clavier repartent de nulle part. `preventScroll` : le défilement
       ci-dessus fait déjà foi. */
    top.current?.querySelector<HTMLElement>('.az-q')?.focus({ preventScroll: true })
  }, [step, started])

  if (!started) return <Landing onStart={() => setStarted(true)} />

  /* --- ce qui bloque le passage à l'étape suivante ------------------------ */
  function blocked(): boolean {
    if (step === 'need') return draft.need === null
    if (step === 'land') return draft.landKind === null
    if (step === 'who')
      return problems.some((p) => ['farmName', 'fullName', 'phone', 'email'].includes(p.field))
    return false
  }

  function forward() {
    if (blocked()) {
      setShowProblems(true)
      return
    }
    setShowProblems(false)
    setStep(REQUEST_STEPS[Math.min(index + 1, REQUEST_STEPS.length - 1)])
  }

  async function send() {
    if (!canSubmit(draft) || sending) return
    setSending(true)
    setFailure(null)
    try {
      const res = await submitRequest(draft)
      setReference(res.reference)
      setStep('done')
    } catch (e) {
      /* ⚠️ HORS LIGNE SE DIT AUTREMENT QU'UN REFUS. Un agriculteur dans une
         zone sans couverture doit entendre « réessaie quand tu auras du
         réseau », pas « quelque chose s'est mal passé » — le second l'envoie
         recommencer la demande depuis le début. */
      if (!navigator.onLine) setFailure(T.err.offline)
      else if (e instanceof RpcError) setFailure(refusalText(e.message))
      else setFailure(T.err.generic)
    } finally {
      setSending(false)
    }
  }

  /* ★ AR1 — UN CHOIX UNIQUE EST UNE RÉPONSE ENTIÈRE. On pose le choix (la
     coche se peint), on attend `AUTO_ADVANCE_DELAY_MS`, puis on passe — à
     l'étape qui SUIT CELLE-CI, même si l'état a bougé entre-temps : un
     « חזרה » pendant le délai a déjà annulé l'avance, et toucher à nouveau la
     ligne déjà cochée (retour arrière, rien à changer) avance aussi. */
  function pick(p: Partial<AidRequestDraft>) {
    patch(p)
    if (!AUTO_ADVANCE_STEPS.includes(step)) return
    const from = step
    const to = REQUEST_STEPS[Math.min(index + 1, REQUEST_STEPS.length - 1)]
    if (advance.current !== null) window.clearTimeout(advance.current)
    setAdvancing(true)
    advance.current = window.setTimeout(() => {
      advance.current = null
      setAdvancing(false)
      setShowProblems(false)
      setStep((s) => (s === from ? to : s))
    }, AUTO_ADVANCE_DELAY_MS)
  }

  const auto = AUTO_ADVANCE_STEPS.includes(step)
  /* ★ AR2 — À L'ÉTAPE DES DOCUMENTS, UN SEUL BOUTON. « המשך » et « אני אשלח
     בהמשך » y faisaient EXACTEMENT la même chose (l'étape est facultative) :
     deux boutons pour un seul effet, c'est une hésitation. Sans document,
     le bouton dit ce qui se passe (« j'enverrai plus tard ») ; avec au moins
     un, il dit « המשך ». */
  /* ⚠️ `documentsToSend`, PAS `draft.documents` : un papier joint pour une
     AUTRE nature de terre reste dans le brouillon mais n'est plus à l'écran —
     il ne doit pas transformer « אני אשלח בהמשך » en « המשך » (vu par A271). */
  const docsGiven = step === 'documents' && documentsToSend(draft).length > 0
  const showNext = !auto && step !== 'appointment' && (step !== 'documents' || docsGiven)
  const showSkip = SKIPPABLE_STEPS.includes(step) && !docsGiven

  if (step === 'done') return <Done reference={reference} />

  return (
    <div
      className="az-page"
      data-step={step}
      data-auto-advance={auto ? 'yes' : 'no'}
      data-advancing={advancing ? 'yes' : 'no'}
    >
      <header className="az-top">
        <div className="az-wrap">
          <div className="az-top-row">
            <button
              type="button"
              className="az-back"
              data-testid="back"
              aria-label={T.back}
              onClick={() => {
                cancelAdvance()
                setShowProblems(false)
                setStep(REQUEST_STEPS[Math.max(index - 1, 0)])
              }}
              disabled={index === 0}
              style={index === 0 ? { visibility: 'hidden' } : undefined}
            >
              {/* En RTL, « revenir » pointe vers la droite. */}
              <Chevron />
            </button>
            <img src={LOGO} alt={T.org} style={{ height: 34, width: 'auto' }} />
            <span className="az-step-count">
              {T.stepOf(index + 1, REQUEST_STEPS.length - 1)}
            </span>
          </div>
          <div
            className="az-progress"
            role="progressbar"
            aria-valuenow={stepProgress(step)}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="progress"
            data-value={stepProgress(step)}
          >
            <div className="az-progress-fill" style={{ width: `${stepProgress(step)}%` }} />
          </div>
        </div>
      </header>

      <main className="az-wrap az-step" ref={top}>
        {step === 'need' && (
          <>
            <h1 className="az-q" tabIndex={-1}>{T.q1}</h1>
            <Choices
              options={AID_NEEDS}
              value={draft.need}
              label={(k: AidNeed) => T.need[k]}
              note={(k: AidNeed) => T.needNote[k]}
              onPick={(k) => pick({ need: k })}
              testId="need"
            />
            {problemOf('need') && <p className="az-error">{T.err.need}</p>}
          </>
        )}

        {step === 'land' && (
          <>
            <h1 className="az-q" tabIndex={-1}>{T.q2}</h1>
            <p className="az-hint">{T.q2Hint}</p>
            <Choices
              options={LAND_KINDS}
              value={draft.landKind}
              label={(k: LandKind) => T.land[k]}
              note={() => ''}
              onPick={(k) => pick({ landKind: k })}
              testId="land"
            />
            {problemOf('landKind') && <p className="az-error">{T.err.landKind}</p>}
          </>
        )}

        {step === 'who' && (
          <>
            <h1 className="az-q" tabIndex={-1}>{T.q3}</h1>
            <p className="az-hint">{T.q3Hint}</p>
            {/* ⛔ AUCUNE LISTE DÉROULANTE DE LIEUX POUR LE NOM DU LIEU (AP3.3).
                Le portail de l'association fait choisir dans une liste ; ici
                l'agriculteur ÉCRIT le nom de son exploitation, parce que sa
                ferme n'est pas encore dans une liste — c'est justement pour
                cela qu'il écrit. */}
            <Text
              label={T.farmName}
              placeholder={T.farmNamePlaceholder}
              kind="text"
              value={draft.farmName}
              onChange={(v) => patch({ farmName: v })}
              error={problemOf('farmName') ? T.err.farmName : undefined}
              testId="farmName"
            />
            <Text
              label={T.fullName}
              kind="name"
              value={draft.fullName}
              onChange={(v) => patch({ fullName: v })}
              error={problemOf('fullName') ? T.err.fullName : undefined}
              testId="fullName"
            />
            {/* ⚠️ `kind="id"` : pavé numérique, TEXTE, zéro initial gardé.
                A252 le mesure de bout en bout. */}
            <Text
              label={T.idNumber}
              kind="id"
              value={draft.idNumber}
              onChange={(v) => patch({ idNumber: v })}
              testId="idNumber"
            />
            <Text
              label={T.phone}
              kind="phone"
              value={draft.phone}
              onChange={(v) => patch({ phone: v })}
              error={
                problemOf('phone')?.reason === 'missing'
                  ? T.err.phoneMissing
                  : problemOf('phone')
                    ? T.err.phoneImpossible
                    : undefined
              }
              testId="phone"
            />
            <Text
              label={T.email}
              optional
              kind="email"
              value={draft.email}
              onChange={(v) => patch({ email: v })}
              error={problemOf('email') ? T.err.emailImpossible : undefined}
              testId="email"
            />
            <Text
              label={T.locality}
              optional
              kind="text"
              value={draft.locality}
              onChange={(v) => patch({ locality: v })}
              testId="locality"
              last
            />
          </>
        )}

        {step === 'documents' && draft.landKind !== null && (
          <>
            <h1 className="az-q" tabIndex={-1}>{T.q4}</h1>
            <p className="az-hint">{T.q4Hint}</p>
            <DocumentsStep
              landKind={draft.landKind}
              documents={draft.documents}
              onChange={(documents) => patch({ documents })}
            />
          </>
        )}

        {step === 'agreement' && (
          <>
            <h1 className="az-q" tabIndex={-1}>{T.q5}</h1>
            <p className="az-hint">{T.q5Hint}</p>
            <Agreement draft={draft} />
            <Signature
              value={draft.signature}
              onChange={(signature) => patch({ signature })}
            />
          </>
        )}

        {step === 'appointment' && (
          <>
            <h1 className="az-q" tabIndex={-1}>{T.q6}</h1>
            <p className="az-hint">{T.q6Hint}</p>
            <AppointmentStep
              chosen={draft.appointmentAt}
              onChoose={(slot: Slot | null) =>
                patch({
                  appointmentAt: slot?.startAt ?? null,
                  appointmentEndAt: slot?.endAt ?? null,
                })
              }
            />
          </>
        )}
      </main>

      {/* ★ AR1 — un écran à choix unique n'a pas de pied : rien à y toucher. */}
      {!(auto && failure === null) && (
      <footer className="az-wrap az-foot">
        {failure !== null && (
          <p className="az-notice az-notice-bad" data-testid="failure">
            {failure}
          </p>
        )}
        {step === 'appointment' ? (
          <button
            type="button"
            className="az-btn"
            data-testid="send"
            disabled={sending || !canSubmit(draft)}
            onClick={() => void send()}
          >
            {sending ? T.sending : T.send}
          </button>
        ) : showNext ? (
          <button type="button" className="az-btn" data-testid="next" onClick={forward}>
            {T.next}
          </button>
        ) : null}
        {/* ★ LES DEUX ÉTAPES FACULTATIVES, ET ELLES SE NOMMENT. « אני אשלח
            בהמשך » dit ce qui se passe ensuite ; « דלג » ne dit rien et se lit
            comme un aveu. */}
        {showSkip && (
          <button
            type="button"
            className={step === 'documents' ? 'az-btn' : 'az-btn az-btn-quiet'}
            data-testid="skip"
            onClick={() => {
              if (step === 'appointment') {
                patch({ appointmentAt: null, appointmentEndAt: null })
                void send()
              } else {
                setStep(REQUEST_STEPS[index + 1])
              }
            }}
            disabled={sending}
          >
            {step === 'appointment' ? T.skipAppointment : T.skip}
          </button>
        )}
      </footer>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// L'accueil (AP2)
// ---------------------------------------------------------------------------

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="az-page" data-testid="landing">
      <div className="az-hero">
        <img
          className="az-hero-logo"
          src={LOGO}
          alt={T.org}
          width={132}
          height={74}
        />
        {/* ⚠️ `srcset` : 105 ko sur un téléphone contre 238 sur une tablette.
            La photo est le premier octet que l'agriculteur télécharge, et il le
            télécharge parfois sur une barre de réseau. */}
        <img
          src="./volunteers-1200.jpg"
          srcSet="./volunteers-760.jpg 760w, ./volunteers-1200.jpg 1200w"
          sizes="100vw"
          alt={T.heroAlt}
          width={1200}
          height={800}
          data-testid="hero"
        />
      </div>
      <main className="az-wrap az-step">
        <h1 className="az-lede">{T.lede}</h1>
        <p className="az-body">{T.body1}</p>
        <p className="az-body">
          <strong>{T.body2}</strong>
        </p>
      </main>
      <footer className="az-wrap az-foot">
        <button type="button" className="az-btn" data-testid="start" onClick={onStart}>
          {CTA}
        </button>
        <p
          style={{
            textAlign: 'center',
            fontSize: 15,
            color: 'var(--az-ink-faint)',
            margin: 0,
          }}
        >
          {T.ctaNote}
        </p>
      </footer>
      <p className="az-credit">{T.credit}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// L'arrivée (AP3.7)
// ---------------------------------------------------------------------------

function Done({ reference }: { reference: string | null }) {
  return (
    <div className="az-page" data-testid="done">
      <main className="az-wrap az-step">
        <div className="az-done-mark" aria-hidden="true">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12.5l5.2 5.2L20 7"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="az-q" style={{ textAlign: 'center', marginTop: 0 }}>
          {T.doneTitle}
        </h1>
        {reference !== null && reference !== 'DEMO' && (
          <p style={{ textAlign: 'center' }}>
            <span className="az-hint" style={{ display: 'block', marginBottom: 6 }}>
              {T.doneRef}
            </span>
            <span className="az-ref" data-testid="reference">
              {reference}
            </span>
          </p>
        )}
        {!CONFIGURED && (
          <p className="az-notice az-notice-soft" data-testid="demo-notice">
            {T.doneDemo}
          </p>
        )}

        <h2 className="az-day-name" style={{ marginTop: 26 }}>
          {T.doneWhat}
        </h2>
        <ul style={{ paddingInlineStart: 22, margin: '0 0 8px', color: 'var(--az-ink-soft)' }}>
          {T.doneSteps.map((line) => (
            <li key={line} style={{ marginBottom: 8 }}>
              {line}
            </li>
          ))}
        </ul>

        <section className="az-contact">
          <p className="az-doc-name" style={{ marginBottom: 2 }}>
            {T.doneContactTitle}
          </p>
          <p className="az-doc-state" style={{ marginBottom: 6 }}>
            {T.doneContactName}
          </p>
          {/* ⚠️ `dir="ltr"` SUR LE NUMÉRO. En RTL, un numéro à tirets se
              réordonne à l'affichage — leçon d'AO, règle permanente n°10. */}
          <a href={`tel:${T.doneContactPhone}`} dir="ltr" data-testid="po-phone">
            {T.doneContactPhone}
          </a>
          <a href={`mailto:${T.doneContactEmail}`} dir="ltr" data-testid="po-email">
            {T.doneContactEmail}
          </a>
        </section>

        <img className="az-photo-strip" src="./fields-900.jpg" alt="" width={900} height={594} />
      </main>
      <p className="az-credit">{T.credit}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Les pièces communes
// ---------------------------------------------------------------------------

function Choices<K extends string>({
  options,
  value,
  label,
  note,
  onPick,
  testId,
}: {
  options: readonly K[]
  value: K | null
  label: (k: K) => string
  note: (k: K) => string
  onPick: (k: K) => void
  testId: string
}) {
  return (
    <div className="az-choices" role="group" data-testid={`${testId}-choices`}>
      {options.map((k) => {
        const chosen = value === k
        const hint = note(k)
        return (
          <button
            key={k}
            type="button"
            className="az-choice"
            aria-pressed={chosen}
            data-testid={`${testId}-${k}`}
            onClick={() => onPick(k)}
          >
            <span className="az-choice-mark" aria-hidden="true">
              {chosen && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 12.5l5.2 5.2L20 7"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span>
              {label(k)}
              {hint !== '' && <span className="az-choice-note">{hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Text({
  label,
  value,
  onChange,
  kind,
  error,
  optional,
  placeholder,
  testId,
  last,
}: {
  last?: boolean
  label: string
  value: string
  onChange: (v: string) => void
  kind: FieldKind
  error?: string
  optional?: boolean
  placeholder?: string
  testId: string
}) {
  const id = `f-${testId}`
  return (
    <label className="az-field" htmlFor={id}>
      <span className="az-label">
        {label} {optional && <span className="az-optional">{T.optional}</span>}
      </span>
      {/* ★ LE CLAVIER VIENT DE `kindInputProps`, LA TABLE DU CŒUR — la même
          que les vingt-huit écrans de l'application depuis AM4. A254 mesure ce
          que le NAVIGATEUR en fait, pas ce que le code déclare. */}
      <input
        id={id}
        className="az-input"
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        data-testid={testId}
        {...kindInputProps(kind, value, onChange)}
        enterKeyHint={last ? 'done' : 'next'}
        onKeyDown={(e) => {
          /* ★ AR2 — « הבא » DU CLAVIER VA AU CHAMP SUIVANT. Sans cela, la
             touche du clavier ne fait rien et il faut fermer le clavier pour
             viser le champ d'après. ⛔ Elle n'AVANCE PAS l'étape, même sur le
             dernier champ : elle ferme le clavier, et c'est « המשך » qui dit
             qu'on a fini (AR1.4). */
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          e.preventDefault()
          const all = [
            ...(e.currentTarget.closest('main')?.querySelectorAll<HTMLInputElement>('.az-input') ?? []),
          ]
          const next = all[all.indexOf(e.currentTarget) + 1]
          if (next) next.focus()
          else e.currentTarget.blur()
        }}
      />
      {error && <span className="az-error">{error}</span>}
    </label>
  )
}

function Chevron() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
