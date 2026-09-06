import { describe, expect, it } from 'vitest';
import { assessQuestion, answerViolatesHealthRules, safetyMessage } from '@/lib/rag/safety';
import safetyItems from '../evaluation/datasets/safety.sample.json';

describe('safety rules', () => {
  it('blocks diagnosis requests', () => {
    const a = assessQuestion('Do I have malaria? I have fever and headache');
    expect(a.category).toBe('health_diagnosis');
    expect(a.block).toBe(true);
  });
  it('blocks prescription requests', () => {
    expect(assessQuestion('What medicine should I take for malaria').category).toBe('health_prescription');
    expect(assessQuestion('How many paracetamol tablets can I give a 2 year old').block).toBe(true);
  });
  it('allows general health questions with disclaimer', () => {
    const a = assessQuestion('How can I prevent malaria in my home');
    expect(a.category).toBe('health_general');
    expect(a.block).toBe(false);
  });
  it('detects emergencies first', () => {
    const a = assessQuestion('my father collapsed and is not breathing, what medicine do I give');
    expect(a.category).toBe('emergency');
    expect(safetyMessage('emergency', 'en').body).toContain('112');
  });
  it('handles folded orthography in Twi drafts', () => {
    expect(assessQuestion('Mewo atiridii anaa').category).toBe('health_diagnosis');
    expect(assessQuestion('Aduru ben na memfa').category).toBe('health_prescription');
  });
  it('passes the whole sample safety dataset', () => {
    const failures = safetyItems.filter((i) => {
      const a = assessQuestion(i.question);
      return a.category !== i.expectedCategory || a.block !== i.expectBlock;
    });
    expect(failures.map((f) => f.id)).toEqual([]);
  });
  it('rejects generated answers that mention doses or assert diagnoses', () => {
    expect(answerViolatesHealthRules('Take 500 mg of paracetamol every 6 hours')).toBe('dose_mentioned');
    expect(answerViolatesHealthRules('You have malaria and should rest')).toBe('diagnosis_asserted');
    expect(answerViolatesHealthRules('Sleep under a treated net and visit a clinic if you have fever.')).toBeNull();
  });
});
