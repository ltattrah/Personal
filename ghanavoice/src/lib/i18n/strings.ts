import type { LanguageCode } from './languages';

/**
 * UI strings. IMPORTANT: The Twi, Ewe and Ga strings below were drafted by the
 * engineering team, not by validated native speakers. They are marked
 * `draft: true` in the glossary and must go through the review workflow
 * (docs/07) before the language is marked "evaluated". English is the source.
 */
export type StringKey =
  | 'app.name'
  | 'app.tagline'
  | 'ask.placeholder'
  | 'ask.send'
  | 'ask.holdToTalk'
  | 'ask.release'
  | 'ask.listening'
  | 'language.label'
  | 'language.suggested'
  | 'language.switch'
  | 'language.keep'
  | 'confidence.high'
  | 'confidence.medium'
  | 'confidence.low'
  | 'answer.notCertain'
  | 'answer.sources'
  | 'answer.updated'
  | 'answer.escalate'
  | 'answer.play'
  | 'answer.stop'
  | 'feedback.helpful'
  | 'feedback.notHelpful'
  | 'feedback.translation'
  | 'disclaimer.short'
  | 'disclaimer.emergency'
  | 'consent.audioTitle'
  | 'consent.audioBody'
  | 'consent.accept'
  | 'consent.decline'
  | 'history.title'
  | 'history.clear'
  | 'offline.title'
  | 'offline.download'
  | 'offline.downloaded'
  | 'offline.banner'
  | 'nav.ask'
  | 'nav.offline'
  | 'nav.history'
  | 'nav.settings';

type Table = Record<StringKey, string>;

const en: Table = {
  'app.name': 'GhanaVoice',
  'app.tagline': 'Public information in your language',
  'ask.placeholder': 'Type your question…',
  'ask.send': 'Send',
  'ask.holdToTalk': 'Hold to talk',
  'ask.release': 'Release to send',
  'ask.listening': 'Listening…',
  'language.label': 'Language',
  'language.suggested': 'This looks like {lang}. Switch?',
  'language.switch': 'Switch',
  'language.keep': 'Keep',
  'confidence.high': 'High confidence',
  'confidence.medium': 'Medium confidence',
  'confidence.low': 'Low confidence',
  'answer.notCertain': 'I am not certain about this. Please check the sources or ask a person.',
  'answer.sources': 'Sources',
  'answer.updated': 'Updated',
  'answer.escalate': 'Ask a person',
  'answer.play': 'Play audio',
  'answer.stop': 'Stop',
  'feedback.helpful': 'Helpful',
  'feedback.notHelpful': 'Not helpful',
  'feedback.translation': 'Report translation problem',
  'disclaimer.short':
    'GhanaVoice gives general information only. It is not medical, legal or financial advice. In an emergency call 112.',
  'disclaimer.emergency': 'If someone is in danger, call 112 (national emergency), 191 (police), 192 (fire) or 193 (ambulance) now.',
  'consent.audioTitle': 'Store your voice recording?',
  'consent.audioBody':
    'We can keep your recording to improve speech recognition for Ghanaian languages. It will be deleted automatically after the period you choose. You can say no and still use voice.',
  'consent.accept': 'Yes, store it',
  'consent.decline': 'No, do not store',
  'history.title': 'Your conversations',
  'history.clear': 'Delete all history',
  'offline.title': 'Offline information packs',
  'offline.download': 'Download',
  'offline.downloaded': 'Saved on this device',
  'offline.banner': 'You are offline. Showing saved information only.',
  'nav.ask': 'Ask',
  'nav.offline': 'Offline',
  'nav.history': 'History',
  'nav.settings': 'Settings',
};

// Draft translations: see note at top of file.
const akAsante: Partial<Table> = {
  'app.tagline': 'Amanaman nsɛm wɔ wo kasa mu',
  'ask.placeholder': 'Kyerɛw w’asɛmmisa…',
  'ask.send': 'Mane',
  'ask.holdToTalk': 'Mia so kasa',
  'ask.release': 'Gyae na mane',
  'ask.listening': 'Meretie…',
  'language.label': 'Kasa',
  'answer.notCertain': 'Minnim yiye. Yɛsrɛ wo hwɛ nsɛm no fibea anaa bisa onipa.',
  'answer.sources': 'Nsɛm fibea',
  'answer.escalate': 'Bisa onipa',
  'feedback.helpful': 'Ɛboa',
  'feedback.notHelpful': 'Ɛmmoa',
  'history.title': 'Wo nkɔmmɔ',
  'nav.ask': 'Bisa',
  'nav.history': 'Abakɔsɛm',
};

const akAkuapem: Partial<Table> = {
  ...akAsante,
  'ask.placeholder': 'Kyerɛw w’asɛmmisa…',
  'answer.notCertain': 'Minnim yiye. Yɛsrɛ wo hwɛ nsɛm no fibea anaasɛ bisa onipa.',
};

const ee: Partial<Table> = {
  'app.tagline': 'Dukɔa ƒe nyatakakawo le wò gbe me',
  'ask.placeholder': 'Ŋlɔ wò biabia…',
  'ask.send': 'Ɖo ɖa',
  'ask.holdToTalk': 'Lé ɖe asi nàƒo nu',
  'ask.listening': 'Mele to ɖom…',
  'language.label': 'Gbe',
  'answer.notCertain': 'Nyemeka ɖe edzi o. Taflatse kpɔ nyatakakawo ƒe dzɔtsoƒe alo bia ame aɖe.',
  'answer.sources': 'Dzɔtsoƒewo',
  'answer.escalate': 'Bia ame aɖe',
  'feedback.helpful': 'Ekpe ɖe ŋunye',
  'feedback.notHelpful': 'Mekpe ɖe ŋunye o',
  'nav.ask': 'Bia',
};

const gaa: Partial<Table> = {
  'app.tagline': 'Maŋ saji yɛ owiemɔ mli',
  'ask.placeholder': 'Ŋmaa osanebimɔ…',
  'ask.send': 'Maa',
  'ask.holdToTalk': 'Mɔmɔ ni owie',
  'ask.listening': 'Miibo toi…',
  'language.label': 'Wiemɔ',
  'answer.notCertain': 'Miyeee jogbaŋŋ. Ofainɛ kwɛmɔ saji lɛ ajɛɛhe loo bi mɔ ko.',
  'answer.sources': 'Ajɛɛhe',
  'answer.escalate': 'Bi mɔ ko',
  'feedback.helpful': 'Eye ebua',
  'feedback.notHelpful': 'Eyeee ebua',
  'nav.ask': 'Bi',
};

const tables: Record<LanguageCode, Partial<Table>> = {
  en,
  'ak-asante': akAsante,
  'ak-akuapem': akAkuapem,
  ee,
  gaa,
};

export function t(lang: LanguageCode, key: StringKey, vars?: Record<string, string>): string {
  const raw = tables[lang][key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

/** Whether a key has a non-English translation (used by the evaluation dashboard for UI coverage). */
export function hasTranslation(lang: LanguageCode, key: StringKey): boolean {
  return lang === 'en' || key in tables[lang];
}

export function uiCoverage(lang: LanguageCode): { translated: number; total: number } {
  const keys = Object.keys(en) as StringKey[];
  return { translated: keys.filter((k) => hasTranslation(lang, k)).length, total: keys.length };
}
