import React from 'react';
import { Info } from 'lucide-react';

const METRIC_DESCRIPTIONS = {
  compositionality: 'How systematically symbols map to meanings (0=random, 1=perfect)',
  topographic_similarity: 'Correlation between meaning distances and message distances',
  entropy: 'How uniformly messages are distributed (higher=more diverse)',
  vocab_size: 'Number of unique messages used by the speaker',
  vocabulary_size: 'Number of unique messages used by the speaker',
  reward: 'Average reward earned by the agent pair per episode',
  loss: 'Training loss (lower indicates better performance)',
  accuracy: 'Proportion of correct listener choices',
};

export default function MetricTooltip({ metric, children, className = '' }) {
  const description = METRIC_DESCRIPTIONS[metric] || METRIC_DESCRIPTIONS[metric?.toLowerCase()] || '';

  if (!description) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 group ${className}`} title={description}>
      {children}
      <Info size={10} className="text-retro-muted group-hover:text-cyber-cyan transition-colors cursor-help" />
    </span>
  );
}
