import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '../utils';
import { useT } from '../i18n';

/**
 * SentimentGauge - Compact sentiment with dual-axis chart (sentiment + price)
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
        return null;
    }

    const { current, history, priceHistory } = data;
    const score = current.score || 0;
    const interpretation = current.interpretation || 'Neutral';
    const color = current.color || '#94a3b8';
    const longPct = current.longPercentage || 50;
    const shortPct = current.shortPercentage || 50;

    // Calculate gauge position
    const gaugePercent = ((score + 100) / 200) * 100;
    const Icon = score > 10 ? TrendingUp : score < -10 ? TrendingDown : Activity;

    // Prepare chart data (combine sentiment history + price history by date)
    const sentimentMap = new Map();
    (history || []).forEach(h => {
        if (h.date) {
            sentimentMap.set(h.date, { date: h.date, sentiment: h.score });
        }
    });

    const priceMap = new Map();
    if (priceHistory && priceHistory.length > 0) {
        priceHistory.forEach(p => {
            if (p.date) {
                priceMap.set(p.date, p.price);
            }
        });
    }

    // Merge data
    const chartData = [];
    const allDates = new Set([...sentimentMap.keys(), ...priceMap.keys()]);
    Array.from(allDates).sort().forEach(date => {
        const sentimentVal = sentimentMap.get(date)?.sentiment;
        const priceVal = priceMap.get(date);
        
        if (sentimentVal !== undefined || priceVal !== undefined) {
            chartData.push({
                date: date,
                sentiment: sentimentVal,
                price: priceVal,
            });
        }
    });

    // Take last 12 weeks
    const displayData = chartData.slice(-12);

    // Calculate price range for scaling
    const prices = displayData.map(d => d.price).filter(p => p !== undefined);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 100;

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

            <div className="grid grid-cols-[140px_1fr] gap-4">
                {/* Left: Gauge + Score */}
                <div className="flex flex-col items-center justify-center">
                    <div className="relative w-full">
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
                    </div>

                    {/* Score centered below gauge */}
                    <div className="flex flex-col items-center -mt-1">
                        <div 
                            className="font-mono text-[24px] font-bold tnum leading-none"
                            style={{ color }}
                        >
                            {score > 0 ? '+' : ''}{score}
                        </div>
                        <div className="text-[8px] text-gray-500 uppercase tracking-wider font-semibold">
                            Score
                        </div>
                    </div>
                    
                    {/* Long/Short */}
                    <div className="w-full space-y-1 mt-3">
                        <div className="flex items-center justify-between text-[9px]">
                            <span className="text-gray-500">Long</span>
                            <span className="font-mono font-bold text-[#34d399]">{longPct.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px]">
                            <span className="text-gray-500">Short</span>
                            <span className="font-mono font-bold text-[#fb7185]">{shortPct.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>

                {/* Right: Dual-axis chart */}
                <div className="min-h-[160px]">
                    {displayData.length > 1 ? (
                        <ResponsiveContainer width="100%" height={160}>
                            <LineChart data={displayData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#6b7280"
                                    fontSize={9}
                                    tick={{ fontFamily: 'Geist Mono' }}
                                    tickFormatter={(val) => {
                                        const parts = val.split('-');
                                        return parts.length >= 2 ? `${parts[1]}/${parts[2]}` : val;
                                    }}
                                    interval="preserveStartEnd"
                                />
                                
                                {/* Left Y-axis for sentiment */}
                                <YAxis 
                                    yAxisId="sentiment"
                                    stroke="#a78bfa"
                                    fontSize={9}
                                    width={30}
                                    tick={{ fontFamily: 'Geist Mono' }}
                                    domain={[-100, 100]}
                                />
                                
                                {/* Right Y-axis for price */}
                                {prices.length > 0 && (
                                    <YAxis 
                                        yAxisId="price"
                                        orientation="right"
                                        stroke="#60a5fa"
                                        fontSize={9}
                                        width={35}
                                        tick={{ fontFamily: 'Geist Mono' }}
                                        domain={[minPrice * 0.98, maxPrice * 1.02]}
                                        tickFormatter={(val) => val.toFixed(0)}
                                    />
                                )}
                                
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0a0a0d',
                                        border: '1px solid rgba(168, 85, 247, 0.3)',
                                        borderRadius: '8px',
                                        fontSize: '10px',
                                        fontFamily: 'Geist Mono',
                                    }}
                                    labelStyle={{ color: '#d1d5db', marginBottom: '4px' }}
                                />
                                
                                <Legend 
                                    wrapperStyle={{ fontSize: '9px', fontFamily: 'Geist Mono' }}
                                    iconSize={10}
                                />
                                
                                {/* Sentiment line */}
                                <Line 
                                    yAxisId="sentiment"
                                    type="monotone" 
                                    dataKey="sentiment" 
                                    stroke="#a78bfa" 
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: '#a78bfa' }}
                                    name="Sentiment"
                                    connectNulls
                                />
                                
                                {/* Price line */}
                                {prices.length > 0 && (
                                    <Line 
                                        yAxisId="price"
                                        type="monotone" 
                                        dataKey="price" 
                                        stroke="#60a5fa" 
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: '#60a5fa' }}
                                        name="Price"
                                        connectNulls
                                    />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[160px] flex items-center justify-center text-[10px] text-gray-500">
                            No historical data available
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
