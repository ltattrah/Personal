import publicService from './public-service.json';
import education from './education.json';
import agriculture from './agriculture.json';
import health from './health.json';
import glossary from '../glossary.json';
import { parseEntries, parseGlossary } from '@/lib/kb/load-content';

/** All curated entries bundled with the repo (used in demo mode, tests and offline pack builds). */
export function loadBundledEntries() {
  return parseEntries([...publicService, ...education, ...agriculture, ...health]);
}

export function loadBundledGlossary() {
  return parseGlossary(glossary);
}
