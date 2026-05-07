import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { cn } from '../utils';
import { useT } from '../i18n';

/**
 * SentimentGauge - Compact market sentiment display with gauge and sparkline
 */
export default function SentimentGauge({ data, loading, error }) {
    const t = useT();

    if (loading) {
        return (
            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Activity size={12} className="text-purple-400 animate-pulse" />
                    <h3 className="text-[10px] uppercase tracking-[0.26em] font-bold text-gray-400">
                        Market Sentiment
                    </h3>
                </div>
                <div className="h-16 flex items-center justify-center">
                    <div className="text-[11px] text-gray-500">Loading...</div>
                </div>
            </div>
        );
    }

    if (error || !data || !data.current) {
        return null; // Don't show if no data
    }

    const { current, history } = data;
    const score = current.score || 0;
    const interpretation = current.interpretation || 'Neutral';
    const color = current.color || '#94a3b8';
    const longPct = current.longPercentage || 50;
    const shortPct = current.shortPercentage || 50;

    // Calculate gauge position
    const gaugePercent = ((score + 100) / 200) * 100;
    const Icon = score > 10 ? TrendingUp : score < -10 ? TrendingDown : Activity;

    // Sparkline data
    const sparklineData = (history || []).slice(0, 12).reverse().map(h => ({
        score: h.score || 0
    }));

    return (
        <div className="bg-[#0e0e14] border border-white/[0.07] rounded-2xl p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Activity size={12} className="text-purple-400" />
                    <h3 className="text-[10px] uppercase tracking-[0.26em] font-bold text-gray-400">
                        Market Sentiment
                    </h3>
                </div>
                <div className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] uppercase tracking-wider font-bold',
                    score >= 40 ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#34d399]' :
                    score >= 10 ? 'border-[#34d399]/40 bg-[#34d399]/10 text-[#34d399]' :
                    score > -10 ? 'border-white/15 bg-white/5 text-gray-300' :
                    score > -40 ? 'border-[#fb7185]/40 bg-[#fb7185]/10 text-[#fb7185]' :
                    'border-[#f43f5e]/40 bg-[#f43f5e]/10 text-[#f43f5e]'
                )}>
                    <Icon size={9} />
                    <span className="hidden sm:inline">{interpretation}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Left: Gauge */}
                <div className="relative">
                    <svg viewBox="0 0 120 70" className="w-full">
                        {/* Background arc */}
                        <path
                            d="M 15 60 A 45 45 0 0 1 105 60"
                            fill="none"
                            stroke="rgba(255,255,255,0.06)"
                            strokeWidth="8"
                            strokeLinecap="round"
                        />
                        
                        {/* Gradient */}
                        <defs>
                            <linearGradient id="sentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" style={{ stopColor: '#f43f5e', stopOpacity: 0.9 }} />
                                <stop offset="50%" style={{ stopColor: '#94a3b8', stopOpacity: 0.9 }} />
                                <stop offset="100%" style={{ stopColor: '#10b981', stopOpacity: 0.9 }} />
                            </linearGradient>
                        </defs>
                        
                        {/* Colored arc */}
                        <path
                            d="M 15 60 A 45 45 0 0 1 105 60"
                            fill="none"
                            stroke="url(#sentGrad)"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray="141.3"
                            strokeDashoffset={141.3 - (141.3 * gaugePercent / 100)}
                            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                        />
                        
                        {/* Needle */}
                        <g transform={`rotate(${-90 + (gaugePercent * 1.8)} 60 60)`}>
                            <circle cx="60" cy="60" r="4" fill={color} />
                            <line 
                                x1="60" 
                                y1="60" 
                                x2="60" 
                                y2="22" 
                                stroke={color} 
                                strokeWidth="2" 
                                strokeLinecap="round"
                            />
                        </g>
                        
                        <circle cx="60" cy="60" r="5" fill="#0e0e14" stroke={color} strokeWidth="1.5" />
                    </svg>

                    {/* Score */}
                    <div className="absolute inset-x-0 top-8 flex flex-col items-center">
                        <div 
                            className="font-mono text-[22px] font-bold tnum leading-none"
                            style={{ color }}
                        >
                            {score > 0 ? '+' : ''}{score}
                        </div>
                        <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-0.5 font-semibold">
                            Score
                        </div>
                    </div>
                </div>

                {/* Right: Distribution + Sparkline */}
                <div className="flex flex-col justify-between">
                    {/* Sparkline */}
                    {sparklineData.length > 1 && (
                        <div className="h-8 mb-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={sparklineData}>
                                    <Line 
                                        type="monotone" 
                                        dataKey="score" 
                                        stroke={color} 
                                        strokeWidth={1.5} 
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    
                    {/* Long/Short */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-500">Long</span>
                            <span className="font-mono font-bold text-[#34d399]">{longPct.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-500">Short</span>
                            <span className="font-mono font-bold text-[#fb7185]">{shortPct.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
