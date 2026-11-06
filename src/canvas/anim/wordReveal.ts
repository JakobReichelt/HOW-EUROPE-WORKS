import { clamp01 } from './tween';

/**
 * Per-word opacity for a staggered reveal.
 * Word i starts fading in at `i * staggerMs` and reaches 1 after `fadeMs`.
 */
export function wordAlphas(
  wordCount: number,
  elapsedMs: number,
  staggerMs: number,
  fadeMs: number,
): number[] {
  if (wordCount <= 0) return [];
  if (fadeMs <= 0 && staggerMs <= 0) return Array.from({ length: wordCount }, () => 1);
  return Array.from({ length: wordCount }, (_, i) => {
    const start = i * staggerMs;
    if (elapsedMs <= start) return 0;
    if (fadeMs <= 0) return 1;
    return clamp01((elapsedMs - start) / fadeMs);
  });
}
