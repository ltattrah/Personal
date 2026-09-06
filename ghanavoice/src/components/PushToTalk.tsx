'use client';
import type { LanguageCode } from '@/lib/i18n/languages';
import { t } from '@/lib/i18n/strings';

interface Props {
  language: LanguageCode;
  recording: boolean;
  seconds: number;
  disabled?: boolean;
  onPressStart: () => void;
  onPressEnd: () => void;
}

/** Large hold-to-talk button; works with touch, mouse and keyboard (space/enter held). */
export function PushToTalk({ language, recording, seconds, disabled, onPressStart, onPressEnd }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={recording}
      aria-label={recording ? t(language, 'ask.release') : t(language, 'ask.holdToTalk')}
      onPointerDown={(e) => {
        e.preventDefault();
        onPressStart();
      }}
      onPointerUp={onPressEnd}
      onPointerLeave={() => recording && onPressEnd()}
      onPointerCancel={() => recording && onPressEnd()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !recording) {
          e.preventDefault();
          onPressStart();
        }
      }}
      onKeyUp={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && recording) {
          e.preventDefault();
          onPressEnd();
        }
      }}
      className={`flex h-20 w-20 shrink-0 select-none touch-none flex-col items-center justify-center rounded-full text-white shadow-lg transition ${
        recording ? 'animate-pulse bg-clay-500' : 'bg-forest-500 hover:bg-forest-700'
      } disabled:opacity-50`}
    >
      <span aria-hidden className="text-2xl">
        {recording ? '●' : '🎤'}
      </span>
      <span className="text-[10px] leading-tight">{recording ? `${seconds}s` : t(language, 'ask.holdToTalk')}</span>
    </button>
  );
}
