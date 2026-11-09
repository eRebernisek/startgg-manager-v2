import type { I18nKey } from './en';
import type { TranslateFn } from './i18n.service';

/**
 * Exact start.gg round labels we know how to translate. Longer phrases first so
 * "Grand Final Reset" wins over "Grand Final".
 */
const EXACT: readonly { match: string; key: I18nKey }[] = [
  { match: 'Grand Final Reset', key: 'round.grandFinalReset' },
  { match: 'Winners Quarter-Final', key: 'round.winnersQuarterFinal' },
  { match: 'Winners Semi-Final', key: 'round.winnersSemiFinal' },
  { match: 'Losers Quarter-Final', key: 'round.losersQuarterFinal' },
  { match: 'Losers Semi-Final', key: 'round.losersSemiFinal' },
  { match: 'Winners Final', key: 'round.winnersFinal' },
  { match: 'Losers Final', key: 'round.losersFinal' },
  { match: 'Grand Final', key: 'round.grandFinal' },
  { match: 'Quarter-Final', key: 'round.quarterFinal' },
  { match: 'Semi-Final', key: 'round.semiFinal' },
  { match: 'Final', key: 'round.final' },
];

/** Maps known start.gg `fullRoundText` values; unknown strings stay as-is. */
export function translateRoundName(text: string | null | undefined, t: TranslateFn): string {
  if (!text) return '';
  const trimmed = text.trim();
  for (const { match, key } of EXACT) {
    if (trimmed === match) return t(key);
  }

  // "Winners Round 1", "Losers Round 3", "Round 2"
  const winnersRound = /^Winners Round (\d+)$/i.exec(trimmed);
  if (winnersRound) return `${t('round.winners')} ${t('round.round')} ${winnersRound[1]}`;
  const losersRound = /^Losers Round (\d+)$/i.exec(trimmed);
  if (losersRound) return `${t('round.losers')} ${t('round.round')} ${losersRound[1]}`;
  const plainRound = /^Round (\d+)$/i.exec(trimmed);
  if (plainRound) return `${t('round.round')} ${plainRound[1]}`;

  // "Winners Top 8", "Losers Top 16", "Top 8"
  const winnersTop = /^Winners Top (\d+)$/i.exec(trimmed);
  if (winnersTop) return `${t('round.winners')} ${t('round.top')} ${winnersTop[1]}`;
  const losersTop = /^Losers Top (\d+)$/i.exec(trimmed);
  if (losersTop) return `${t('round.losers')} ${t('round.top')} ${losersTop[1]}`;
  const plainTop = /^Top (\d+)$/i.exec(trimmed);
  if (plainTop) return `${t('round.top')} ${plainTop[1]}`;

  return trimmed;
}
