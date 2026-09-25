/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP1.2 (2026-09-25) — LES TEXTES, REPRIS DE artzenu.org.il.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Reprends aussi SES TEXTES. La page d'accueil parle déjà de ce que fait
 *     l'association — pars de ses formulations plutôt que d'en inventer. »
 *
 * ★ CE QUI VIENT MOT POUR MOT DE LEUR SITE, et d'où :
 *
 *   · « מציאות החיים בחווה הינה תובענית ומאתגרת — מסביב לשעון בתנאים
 *     חלוציים » — page התנדבות, en tête.
 *   · « מסייעים לפעילות השוטפת בחוות … ומקלים על החוואי ובני משפחתו באתגרי
 *     היומיום » — même page. Seul « החוואי » devient « החקלאי » : cette
 *     page-ci s'adresse aussi aux cultivateurs, pas seulement aux éleveurs.
 *   · « שמירה על אדמות באמצעות עיבוד חקלאי » et « ארצנו פועלת בשיתוף עם
 *     חקלאים ומתנדבים » — page חקלאות.
 *   · « בואו להיות שותפים », « קדימה להתנדבות » — leur façon d'appeler à
 *     l'action, toujours à l'impératif pluriel et toujours chaleureuse. C'est
 *     d'elle qu'est tiré « אני רוצה לקבל עזרה » (voir `CTA` ci-dessous).
 *
 * ⚠️ TOUT EST EN HÉBREU ÉCRIT EN DUR, SANS `t()`, ET C'EST LA DÉCISION AO N°8 :
 *    « la langue d'une SORTIE est une propriété de son destinataire ». Cette
 *    page n'a qu'un lecteur et il lit l'hébreu ; un dictionnaire de traduction
 *    ajouterait i18next au bundle d'un téléphone pour une langue.
 */

/**
 * ★★ LE BOUTON UNIQUE DE L'ACCUEIL, ET POURQUOI CETTE FORMULATION-LÀ.
 *
 * Le brief en proposait deux : « אני רוצה לקבל עזרה » ou « להצטרף למשפחת
 * ארצנו ». La seconde est plus proche du ton du site — mais elle demande à
 * l'agriculteur de s'engager envers une organisation, alors que ce qu'il fait
 * en touchant ce bouton est DEMANDER quelque chose pour lui. Le site lui-même
 * sépare les deux registres : « בואו להיות שותפים » pour qui donne,
 * « קדימה להתנדבות » pour qui aide. Il n'y avait pas encore de formule pour
 * qui REÇOIT. C'est donc la première, à l'impératif de la première personne
 * — la voix de l'agriculteur, pas celle de l'association.
 */
export const CTA = 'אני רוצה לקבל עזרה'

export const T = {
  org: 'ארצנו',
  pageTitle: 'בקשת סיוע',

  /* --- l'accueil (AP2) --------------------------------------------------- */
  heroAlt: 'מתנדבי ארצנו בשטח',
  lede: 'מציאות החיים בחווה תובענית ומאתגרת — מסביב לשעון, בתנאים חלוציים.',
  body1:
    'אנחנו בארצנו מגייסים מתנדבים, פרטיים ומאורגנים, שמסייעים לפעילות השוטפת בחוות ובשדות — שמירה על השטח ועזרה בעבודה החקלאית — ומקלים על החקלאי ובני משפחתו באתגרי היומיום.',
  body2:
    'ספרו לנו מה אתם צריכים, ואנחנו נעשה כל שביכולתנו כדי להקל עליכם.',
  ctaNote: 'כמה שאלות קצרות. אפשר גם בלי מסמכים — נסדר את זה יחד.',

  /* --- la navigation ----------------------------------------------------- */
  back: 'חזרה',
  next: 'המשך',
  skip: 'אני אשלח בהמשך',
  skipAppointment: 'אקבע מועד בהמשך',
  stepOf: (n: number, total: number) => `שלב ${n} מתוך ${total}`,

  /* --- étape 1 ----------------------------------------------------------- */
  q1: 'מה אתם מחפשים?',
  need: {
    guarding: 'שמירה',
    farm_work: 'עזרה בעבודה חקלאית',
    both: 'שניהם',
  },
  needNote: {
    guarding: 'מתנדבים ששומרים על השטח',
    farm_work: 'ידיים עובדות בשדה ובחווה',
    both: '',
  },

  /* --- étape 2 ----------------------------------------------------------- */
  q2: 'מה יש לכם בשטח?',
  q2Hint: 'לפי זה נדע אילו מסמכים לבקש מכם.',
  land: {
    crops: 'חקלאות',
    grazing: 'מרעה',
    both: 'שניהם',
  },

  /* --- étape 3 ----------------------------------------------------------- */
  q3: 'מי אתם?',
  q3Hint: 'רק מה שצריך כדי לחזור אליכם.',
  farmName: 'שם החווה או המקום',
  farmNamePlaceholder: 'איך קוראים למקום שלכם',
  fullName: 'שם מלא',
  idNumber: 'ת״ז או ח״פ',
  phone: 'נייד',
  email: 'מייל',
  optional: '(לא חובה)',
  locality: 'יישוב או אזור',

  /* --- étape 4 ----------------------------------------------------------- */
  q4: 'מסמכים',
  q4Hint:
    'מסמך שמראה את הזכות שלכם בקרקע. אפשר לצלם אותו עכשיו — נכין מזה קובץ. אם הוא לא איתכם, אפשר לדלג ולשלוח בהמשך.',
  doc: {
    crops: 'מסמך זכות בקרקע — שטחי עיבוד',
    grazing: 'מסמך זכות בקרקע — שטחי מרעה',
  },
  docMissing: 'עוד לא צורף',
  docReady: (name: string) => `צורף · ${name}`,
  docPhoto: 'צילום המסמך',
  docFile: 'קובץ PDF',
  docRemove: 'הסרה',
  docBuilding: 'מכין את הקובץ…',

  /* --- étape 5 ----------------------------------------------------------- */
  q5: 'הסכם התנדבות- ארצנו',
  q5Hint: 'קראו וחתמו באצבע. אפשר למחוק ולחתום שוב.',
  signHere: 'חתימה כאן',
  signClear: 'מחיקה',
  signMissing: 'עוד לא נחתם',

  /* --- étape 6 ----------------------------------------------------------- */
  q6: 'מתי נוח לכם שניפגש?',
  q6Hint: 'המועדים שמוצגים פנויים ביומן. המועד שתבחרו ממתין לאישור שלנו.',
  slotsLoading: 'בודקים מה פנוי…',
  slotsNone: 'אין כרגע מועדים פנויים. נתאם איתכם בטלפון.',
  slotsOffline: 'לא הצלחנו לטעון את היומן. אפשר להמשיך — נתאם איתכם בטלפון.',

  /* --- étape 7 ----------------------------------------------------------- */
  doneTitle: 'הבקשה התקבלה. תודה.',
  doneWhat: 'מה עכשיו?',
  doneSteps: [
    'הבקשה שלכם כבר אצלנו.',
    'דובי יחזור אליכם בימים הקרובים בטלפון שהשארתם.',
    'אם בחרתם מועד — הוא נשמר ביומן וממתין לאישור שלנו.',
  ],
  doneRef: 'מספר האסמכתא שלכם',
  doneContactTitle: 'רוצים לדבר עכשיו?',
  doneContactName: 'דובי בן שושן',
  doneContactPhone: '052-5274774',
  doneContactEmail: 'dovbensoussan@gmail.com',
  doneDemo:
    'זהו עמוד הדגמה — הבקשה לא נשלחה לשום מקום.',

  /* --- les refus --------------------------------------------------------- */
  err: {
    need: 'בחרו מה אתם מחפשים.',
    landKind: 'בחרו מה יש לכם בשטח.',
    farmName: 'צריך שם למקום.',
    fullName: 'צריך שם מלא.',
    phoneMissing: 'צריך מספר נייד כדי שנוכל לחזור אליכם.',
    phoneImpossible: 'המספר לא נראה תקין.',
    emailImpossible: 'הכתובת לא נראית תקינה. אפשר גם להשאיר ריק.',
    tooBig: 'הקובץ גדול מדי. אפשר לצלם אותו במקום.',
    wrongType: 'אפשר רק PDF או תמונה.',
    appointmentTaken: 'המועד הזה כבר נתפס. בחרו מועד אחר.',
    tooMany: 'כבר קיבלנו מכם בקשה היום. נחזור אליכם.',
    generic: 'משהו השתבש. נסו שוב בעוד רגע.',
    offline: 'אין חיבור לאינטרנט. הבקשה לא נשלחה — נסו שוב כשיהיה קליטה.',
  },

  sending: 'שולחים…',
  send: 'שליחת הבקשה',

  credit: '© ארצנו — התיישבות · חקלאות · ציונות',
} as const

/**
 * Le message de refus, à partir du mot que la base a levé. Un mot inconnu rend
 * le message général plutôt que le mot brut : l'agriculteur n'a pas à lire
 * `documentSize`.
 */
export function refusalText(code: string): string {
  switch (code) {
    case 'phone':
      return T.err.phoneImpossible
    case 'email':
      return T.err.emailImpossible
    case 'documentSize':
      return T.err.tooBig
    case 'documentType':
      return T.err.wrongType
    case 'appointmentTaken':
    case 'appointment':
      return T.err.appointmentTaken
    case 'tooMany':
      return T.err.tooMany
    default:
      return T.err.generic
  }
}

/** « ראשון 28 בספטמבר » — le jour, comme un lecteur hébreu le dit. */
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const MONTHS = [
  'בינואר',
  'בפברואר',
  'במרץ',
  'באפריל',
  'במאי',
  'ביוני',
  'ביולי',
  'באוגוסט',
  'בספטמבר',
  'באוקטובר',
  'בנובמבר',
  'בדצמבר',
]

export function hebrewDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d, 12))
  return `יום ${DAY_NAMES[at.getUTCDay()]} · ${d} ${MONTHS[m - 1]}`
}
