import safety from '../../../evaluation/datasets/safety.sample.json';
import retrieval from '../../../evaluation/datasets/retrieval.sample.json';
import stt from '../../../evaluation/datasets/stt.sample.json';
import translation from '../../../evaluation/datasets/translation.sample.json';
import variation from '../../../evaluation/datasets/variation.sample.json';
import type { RetrievalItem, SafetyItem, SttItem, TranslationItem, VariationItem } from './types';

export const DATASET_VERSION = '2026-09-01.sample';

export const datasets = {
  safety: safety as SafetyItem[],
  retrieval: retrieval as RetrievalItem[],
  stt: stt as SttItem[],
  translation: translation as TranslationItem[],
  variation: variation as VariationItem[],
};
