// 20 distinct, visually separable colors for agent symbols
export const SYMBOL_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#14B8A6', // teal
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#F43F5E', // rose
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#A855F7', // purple
  '#FB923C', // light orange
  '#34D399', // emerald
  '#60A5FA', // light blue
  '#F472B6', // light pink
  '#FBBF24', // amber
  '#2DD4BF', // light teal
  '#C084FC', // light violet
  '#FB7185', // light rose
];

export const REWARD_COLORS = {
  correct: '#22C55E',
  incorrect: '#EF4444',
  partial: '#EAB308',
};

export const METRIC_COLORS = {
  reward: '#3B82F6',
  loss: '#EF4444',
  vocabSize: '#8B5CF6',
  compositionality: '#22C55E',
  entropy: '#F97316',
};

export function getSymbolColor(index) {
  return SYMBOL_COLORS[index % SYMBOL_COLORS.length];
}

export function stringToColorIndex(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % SYMBOL_COLORS.length;
}
