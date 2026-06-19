import React from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import { METRIC_COLORS } from '../utils/colors';

export default function MetricsChart({ metrics, title = 'Training Metrics' }) {
  const data = (metrics.episodes || []).map((ep, i) => ({
    episode: ep,
    reward: metrics.rewards?.[i] ?? 0,
    loss: metrics.losses?.[i] ?? 0,
    vocabSize: metrics.vocabSizes?.[i] ?? 0,
    compositionality: metrics.compositionality?.[i] ?? 0,
    entropy: metrics.entropy?.[i] ?? 0,
  }));

  if (data.length === 0) {
    return (
      <div className="bg-steel-dark rounded-xl p-6 border border-steel-border">
        <h3 className="text-sm font-medium text-retro-muted mb-4">{title}</h3>
        <div className="h-64 flex items-center justify-center text-retro-muted">
          No training data yet. Start a session to see metrics.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-steel-dark rounded-xl p-6 border border-steel-border">
      <h3 className="text-sm font-medium text-retro-muted mb-4">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="rewardGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={METRIC_COLORS.reward} stopOpacity={0.3} />
                <stop offset="95%" stopColor={METRIC_COLORS.reward} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={METRIC_COLORS.compositionality} stopOpacity={0.3} />
                <stop offset="95%" stopColor={METRIC_COLORS.compositionality} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="vocabGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={METRIC_COLORS.vocabSize} stopOpacity={0.3} />
                <stop offset="95%" stopColor={METRIC_COLORS.vocabSize} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={METRIC_COLORS.loss} stopOpacity={0.25} />
                <stop offset="95%" stopColor={METRIC_COLORS.loss} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="entropyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={METRIC_COLORS.entropy} stopOpacity={0.25} />
                <stop offset="95%" stopColor={METRIC_COLORS.entropy} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2d44" />
            <XAxis
              dataKey="episode"
              stroke="#666680"
              tick={{ fill: '#8a8a9a', fontSize: 11 }}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
            />
            <YAxis stroke="#666680" tick={{ fill: '#8a8a9a', fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827ee',
                border: '1px solid #374151',
                borderRadius: '10px',
                color: '#f3f4f6',
                fontSize: 12,
                backdropFilter: 'blur(8px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                padding: '10px 14px',
              }}
              labelStyle={{ color: '#9ca3af', fontWeight: 500, marginBottom: 6 }}
              itemStyle={{ padding: '2px 0' }}
              labelFormatter={(v) => `Episode ${v.toLocaleString()}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="reward"
              stroke={METRIC_COLORS.reward}
              fill="url(#rewardGrad)"
              strokeWidth={2}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="compositionality"
              stroke={METRIC_COLORS.compositionality}
              fill="url(#compGrad)"
              strokeWidth={2}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="loss"
              stroke={METRIC_COLORS.loss}
              fill="url(#lossGrad)"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 4"
            />
            <Area
              type="monotone"
              dataKey="entropy"
              stroke={METRIC_COLORS.entropy}
              fill="url(#entropyGrad)"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="2 2"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
