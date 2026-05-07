import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { cn } from '../utils';
import { useT } from '../i18n';

/**
 * SentimentGauge - Displays market sentiment as a gauge meter with historical sparkline
 * 
 * Props:
 * - data: { current: { score, interpretation, color, longPercentage, shortPercentage }, history: [...] }
 * - loading: boolean
 * - error: string | null
 */
export default function SentimentGauge({ data, loading, error }) {
    const t = useT();

    if (loading) {
        return (
            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Activity size={14} className="text-purple-400 animate-pulse" />
                    <h3 className="text-[11px] uppercase tracking-[0.28em] font-bold text-gray-400">
                        Market Sentiment
                    </h3>
                </div>
                <div className="h-24 flex items-center justify-center">
                    <div className="text-[13px] text-gray-500">Loading sentiment...</div>
                </div>
            </div>
        );
    }

    if (error || !data || !data.current) {
        return (
            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Activity size={14} className="text-gray-500" />
                    <h3 className="text-[11px] uppercase tracking-[0.28em] font-bold text-gray-400">
                        Market Sentiment
                    </h3>
                </div>
                <div className="h-24 flex items-center justify-center">
                    <div className="text-[13px] text-gray-500">{error || 'No sentiment data'}</div>
                </div>
            </div>
        );
    }

    const { current, history } = data;
    const score = current.score || 0;
    const interpretation = current.interpretation || 'Neutral';
    const color = current.color || '#94a3b8';
    const longPct = current.longPercentage || 50;
    const shortPct = current.shortPercentage || 50;

    // Calculate gauge position (score ranges from -100 to +100)
    // Map to 0-100% for the gauge arc
    const gaugePercent = ((score + 100) / 200) * 100;

    // Icon based on sentiment
    const Icon = score > 10 ? TrendingUp : score < -10 ? TrendingDown : Activity;

    // Prepare sparkline data (last 12 data points)
    const sparklineData = (history || []).slice(0, 12).reverse().map(h => ({
        score: h.score || 0
    }));

    return (
        <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Activity size={14} className="text-purple-400" />
                    <h3 className="text-[11px] uppercase tracking-[0.28em] font-bold text-gray-400">
                        Market Sentiment
                    </h3>
                </div>
                <div className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-wider font-bold',
                    score >= 40 ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#34d399]' :
                    score >= 10 ? 'border-[#34d399]/40 bg-[#34d399]/10 text-[#34d399]' :
                    score > -10 ? 'border-white/15 bg-white/5 text-gray-300' :
                    score > -40 ? 'border-[#fb7185]/40 bg-[#fb7185]/10 text-[#fb7185]' :
                    'border-[#f43f5e]/40 bg-[#f43f5e]/10 text-[#f43f5e]'
                )}>
                    <Icon size={11} />
                    {interpretation}
                </div>
            </div>

            {/* Gauge Container */}
            <div className="relative">
                {/* Background Sparkline */}
                {sparklineData.length > 0 && (
                    <div className="absolute inset-0 opacity-10">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={sparklineData}>
                                <Line 
                                    type="monotone" 
                                    dataKey="score" 
                                    stroke={color} 
                                    strokeWidth={2} 
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Gauge Arc Background */}
                <div className="relative pt-8 pb-4">
                    <svg viewBox="0 0 200 110" className="w-full">
                        {/* Background arc */}
                        <path
                            d="M 20 100 A 80 80 0 0 1 180 100"
                            fill="none"
                            stroke="rgba(255,255,255,0.06)"
                            strokeWidth="12"
                            strokeLinecap="round"
                        />
                        
                        {/* Gradient definitions */}
                        <defs>
                            <linearGradient id="sentimentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" style={{ stopColor: '#f43f5e', stopOpacity: 0.9 }} />
                                <stop offset="50%" style={{ stopColor: '#94a3b8', stopOpacity: 0.9 }} />
                                <stop offset="100%" style={{ stopColor: '#10b981', stopOpacity: 0.9 }} />
                            </linearGradient>
                        </defs>
                        
                        {/* Colored arc based on sentiment */}
                        <path
                            d="M 20 100 A 80 80 0 0 1 180 100"
                            fill="none"
                            stroke="url(#sentimentGradient)"
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray="251.2"
                            strokeDashoffset={251.2 - (251.2 * gaugePercent / 100)}
                            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                        />
                        
                        {/* Needle/Indicator */}
                        <g transform={`rotate(${-90 + (gaugePercent * 1.8)} 100 100)`}>
                            <circle cx="100" cy="100" r="6" fill={color} />
                            <line 
                                x1="100" 
                                y1="100" 
                                x2="100" 
                                y2="30" 
                                stroke={color} 
                                strokeWidth="3" 
                                strokeLinecap="round"
                            />
                        </g>
                        
                        {/* Center circle */}
                        <circle cx="100" cy="100" r="8" fill="#0e0e14" stroke={color} strokeWidth="2" />
                    </svg>

                    {/* Score Display */}
                    <div className="absolute inset-x-0 top-16 flex flex-col items-center">
                        <div 
                            className="font-mono text-[32px] font-bold tnum leading-none"
                            style={{ color }}
                        >
                            {score > 0 ? '+' : ''}{score}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 font-semibold">
                            Sentiment Score
                        </div>
                    </div>
                </div>

                {/* Long/Short Distribution */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-black/30 border border-[#10b981]/20 rounded-xl p-3">
                        <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1 font-bold">
                            Long Positions
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="font-mono text-[20px] font-bold text-[#34d399]">{longPct.toFixed(1)}</span>
                            <span className="text-[12px] text-gray-400">%</span>
                        </div>
                    </div>
                    <div className="bg-black/30 border border-[#f43f5e]/20 rounded-xl p-3">
                        <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1 font-bold">
                            Short Positions
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="font-mono text-[20px] font-bold text-[#fb7185]">{shortPct.toFixed(1)}</span>
                            <span className="text-[12px] text-gray-400">%</span>
                        </div>
                    </div>
                </div>

                {/* Historical Trend Indicator */}
                {sparklineData.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-white/[0.05]">
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-500 uppercase tracking-wider font-semibold">12-Week Trend</span>
                            <div className="flex items-center gap-2">
                                {sparklineData.map((d, i) => (
                                    <div
                                        key={i}
                                        className="w-1 rounded-full"
                                        style={{
                                            height: `${8 + Math.abs(d.score) / 10}px`,
                                            backgroundColor: d.score >= 0 ? '#10b981' : '#f43f5e',
                                            opacity: 0.4 + (i / sparklineData.length) * 0.6
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
