/**
 * Validate /content JSON against the schema and print a coverage summary.
 * Usage: npm run kb:validate
 */
import { loadBundledEntries, loadBundledGlossary } from '../content/kb/index';
import { LANGUAGE_CODES } from '../src/lib/i18n/languages';

const entries = loadBundledEntries();
const glossary = loadBundledGlossary();
console.log(`✔ ${entries.length} entries, ${glossary.length} glossary terms validated`);
for (const code of LANGUAGE_CODES) {
  const r = entries.flatMap((e) => e.renderings.filter((x) => x.language === code));
  const reviewed = r.filter((x) => x.nativeReviewed).length;
  console.log(`  ${code.padEnd(11)} renderings=${String(r.length).padStart(2)} nativeReviewed=${reviewed}`);
}
const overdue = entries.filter((e) => new Date(e.reviewBy) < new Date());
if (overdue.length) {
  console.warn(`⚠ ${overdue.length} entries past review-by date: ${overdue.map((e) => e.id).join(', ')}`);
  process.exitCode = 2;
}
