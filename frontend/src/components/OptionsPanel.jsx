import React from 'react';
import {
    Crosshair,
    Target as TargetIcon,
    Zap,
    Layers,
    Activity,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    RefreshCw,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
} from 'recharts';
import { cn } from '../utils';
import { useT } from '../i18n';

function fmtCompact(n) {
    if (n == null || isNaN(n)) return '—';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}k`;
    return `${sign}${abs.toFixed(0)}`;
}

function StatPill({ label, value, sub, accent = 'amber', testId }) {
    const colorMap = {
        amber: 'border-amber-500/25 bg-amber-500/[0.05] text-amber-200',
        green: 'border-[#10b981]/25 bg-[#10b981]/[0.05] text-[#34d399]',
        red:   'border-[#f43f5e]/25 bg-[#f43f5e]/[0.05] text-[#fb7185]',
        sky:   'border-sky-400/25 bg-sky-400/[0.05] text-sky-300',
        gray:  'border-white/10 bg-white/[0.03] text-gray-200',
    };
    return (
        <div data-testid={testId} className={cn('rounded-2xl border px-4 py-3', colorMap[accent])}>
            <div className="text-[9.5px] tracking-[0.28em] uppercase font-bold opacity-70 mb-1">{label}</div>
            <div className="font-mono text-[20px] font-semibold tnum leading-none">{value}</div>
            {sub && <div className="text-[10.5px] opacity-60 mt-1.5 font-mono">{sub}</div>}
        </div>
    );
}

function GexTooltip({ active, payload, t }) {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    return (
        <div className="bg-[#0a0a0d] border border-amber-500/30 rounded-2xl px-3 py-2 text-[12px] font-mono shadow-2xl">
            <div className="text-amber-300 font-bold mb-1">K {r.strike}</div>
            <div className="text-[#34d399]">{t('options.calls_oi')}: {r.callOi}</div>
            <div className="text-[#fb7185]">{t('options.puts_oi')}: {r.putOi}</div>
            <div className={cn('mt-1 pt-1 border-t border-white/10', r.netGex >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                Net GEX: ${fmtCompact(r.netGex)}
            </div>
        </div>
    );
}

function FullPanel({ data, t }) {
    const spot = data.spot;
    const u = data.underlyingSpot;
    const mult = data.underlyingMultiplier;
    const fmtUnderlying = (v) =>
        v == null
            ? '—'
            : Math.abs(v) >= 100
            ? v.toLocaleString('en-US', { maximumFractionDigits: 2 })
            : v.toLocaleString('en-US', { maximumFractionDigits: 4 });
    const toUnderlying = (k) => (mult && k != null ? k * mult : null);
    const bars = (data.gexBars || []).map((r) => ({
        ...r,
        absNet: Math.abs(r.netGex),
    }));
    const regimeLabel =
        data.regime === 'long_gamma'   ? t('options.regime.long_gamma')
      : data.regime === 'short_gamma'  ? t('options.regime.short_gamma')
      : t('options.regime.neutral');
    const regimeAccent = data.regime === 'long_gamma' ? 'green' : data.regime === 'short_gamma' ? 'red' : 'gray';

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <StatPill
                    testId="opt-spot"
                    label={t('options.spot')}
                    value={u != null ? fmtUnderlying(u) : (spot != null ? spot.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—')}
                    sub={u != null ? `${data.symbol} ${spot} · ${data.expiry}` : `${data.symbol} · ${data.expiry}`}
                    accent="sky"
                />
                <StatPill
                    testId="opt-maxpain"
                    label={t('options.max_pain')}
                    value={
                        toUnderlying(data.maxPain) != null
                            ? fmtUnderlying(toUnderlying(data.maxPain))
                            : (data.maxPain != null ? data.maxPain.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—')
                    }
                    sub={spot && data.maxPain ? `Δ ${(((data.maxPain - spot) / spot) * 100).toFixed(2)}%` : ''}
                    accent="amber"
                />
                <StatPill
                    testId="opt-callwall"
                    label={t('options.call_wall')}
                    value={
                        toUnderlying(data.callWall) != null
                            ? fmtUnderlying(toUnderlying(data.callWall))
                            : (data.callWall != null ? data.callWall.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—')
                    }
                    sub={t('options.call_wall_sub')}
                    accent="green"
                />
                <StatPill
                    testId="opt-putwall"
                    label={t('options.put_wall')}
                    value={
                        toUnderlying(data.putWall) != null
                            ? fmtUnderlying(toUnderlying(data.putWall))
                            : (data.putWall != null ? data.putWall.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—')
                    }
                    sub={t('options.put_wall_sub')}
                    accent="red"
                />
            </div>

            {/* Net GEX + regime band */}
            <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-4 mb-5" data-testid="opt-gex-summary">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                        <Zap size={14} className={cn(data.netGex >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')} />
                        <span className="text-[10.5px] uppercase tracking-[0.28em] font-bold text-gray-400">{t('options.net_gex')}</span>
                    </div>
                    <span className={cn('font-mono text-[22px] font-semibold tnum', data.netGex >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                        ${fmtCompact(data.netGex)}
                    </span>
                    <span className={cn(
                        'ml-auto px-3 py-1 rounded-full text-[10.5px] uppercase tracking-[0.22em] font-bold border',
                        regimeAccent === 'green' && 'border-[#10b981]/40 bg-[#10b981]/10 text-[#34d399]',
                        regimeAccent === 'red' && 'border-[#f43f5e]/40 bg-[#f43f5e]/10 text-[#fb7185]',
                        regimeAccent === 'gray' && 'border-white/15 bg-white/5 text-gray-300'
                    )}>
                        {regimeLabel}
                    </span>
                </div>
                <p className="text-[12.5px] text-gray-400 leading-relaxed italic">
                    {data.regime === 'long_gamma' ? t('options.regime.long_gamma_desc')
                    : data.regime === 'short_gamma' ? t('options.regime.short_gamma_desc')
                    : t('options.regime.neutral_desc')}
                </p>
                <div className="grid grid-cols-3 gap-3 mt-3 text-[12px] font-mono">
                    <div>
                        <span className="text-gray-500">{t('options.flip')}: </span>
                        <span className="text-amber-300">{data.flipStrike != null ? data.flipStrike : '—'}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">PCR OI: </span>
                        <span className={cn(data.pcr > 1 ? 'text-[#fb7185]' : 'text-[#34d399]')}>{data.pcr ?? '—'}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">DTE: </span>
                        <span className="text-gray-200">{data.dte}d</span>
                    </div>
                </div>
            </div>

            {/* GEX profile chart */}
            <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Layers size={13} className="text-amber-400" />
                    <span className="text-[10.5px] uppercase tracking-[0.28em] font-bold text-gray-400">
                        {t('options.gex_profile')}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-500 font-mono">
                        {bars.length} {t('options.strikes')}
                    </span>
                </div>
                <div className="h-[220px]" data-testid="opt-gex-chart">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bars} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
                            <XAxis
                                dataKey="strike"
                                stroke="#6b7280"
                                fontSize={10}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontFamily: 'Geist Mono' }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="#6b7280"
                                fontSize={10}
                                axisLine={false}
                                tickLine={false}
                                width={50}
                                tick={{ fontFamily: 'Geist Mono' }}
                                tickFormatter={(v) => fmtCompact(v)}
                            />
                            <Tooltip content={<GexTooltip t={t} />} cursor={{ fill: 'rgba(245,158,11,0.08)' }} />
                            <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
                            <ReferenceLine
                                x={Number(spot)}
                                stroke="#60a5fa"
                                strokeDasharray="3 3"
                                strokeWidth={1.5}
                                label={{ value: 'Spot', fontSize: 9, fill: '#60a5fa', position: 'top' }}
                            />
                            {data.maxPain != null && (
                                <ReferenceLine
                                    x={Number(data.maxPain)}
                                    stroke="#f59e0b"
                                    strokeDasharray="3 3"
                                    strokeWidth={1.5}
                                    label={{ value: 'MP', fontSize: 9, fill: '#f59e0b', position: 'top' }}
                                />
                            )}
                            <Bar dataKey="netGex" radius={[3, 3, 0, 0]}>
                                {bars.map((r, i) => (
                                    <Cell key={i} fill={r.netGex >= 0 ? '#10b981' : '#f43f5e'} fillOpacity={0.85} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 mt-2 text-[10.5px] font-mono text-gray-500">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#10b981]" />{t('options.legend.long_gamma')}</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#f43f5e]" />{t('options.legend.short_gamma')}</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-sky-400" />{t('options.legend.spot')}</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-amber-400" />{t('options.legend.max_pain')}</span>
                </div>
            </div>
        </>
    );
}

function SkewPanel({ data, t }) {
    const u = data.underlyingSpot;
    const fmtSpot = (v) =>
        v == null
            ? '—'
            : Math.abs(v) >= 100
            ? v.toLocaleString('en-US', { maximumFractionDigits: 2 })
            : v.toLocaleString('en-US', { maximumFractionDigits: 4 });
    const rr = data.rr;
    const interp = data.interpretation;
    const accent = interp === 'bullish_skew' ? 'green' : interp === 'bearish_skew' ? 'red' : 'gray';
    const rrLabel =
        interp === 'bullish_skew'  ? t('options.skew.bullish')
      : interp === 'bearish_skew'  ? t('options.skew.bearish')
      : interp === 'insufficient_data' ? t('options.skew.no_data')
      : t('options.skew.neutral');

    const callIv = data.callIv;
    const putIv = data.putIv;
    const maxIv = Math.max(callIv || 0, putIv || 0, 1);

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <StatPill
                    testId="opt-spot"
                    label={t('options.spot')}
                    value={u != null ? fmtSpot(u) : (data.spot != null ? data.spot.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—')}
                    sub={u != null ? `${data.symbol} ${data.spot} · ${data.expiry}` : `${data.symbol} · ${data.expiry}`}
                    accent="sky"
                />
                <StatPill
                    testId="opt-atm-iv"
                    label={t('options.atm_iv')}
                    value={data.atmIv != null ? `${data.atmIv}%` : '—'}
                    sub={t('options.atm_iv_sub')}
                    accent="amber"
                />
                <StatPill
                    testId="opt-rr"
                    label={t('options.risk_reversal')}
                    value={rr != null ? `${rr > 0 ? '+' : ''}${rr} pts` : '—'}
                    sub={t('options.rr_sub')}
                    accent={accent}
                />
                <StatPill
                    testId="opt-skew-tag"
                    label={t('options.skew_state')}
                    value={rrLabel}
                    sub={t('options.skew_sub')}
                    accent={accent}
                />
            </div>

            {interp !== 'insufficient_data' ? (
                <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-4" data-testid="opt-skew-bars">
                    <div className="flex items-center gap-2 mb-4">
                        <Activity size={13} className="text-amber-400" />
                        <span className="text-[10.5px] uppercase tracking-[0.28em] font-bold text-gray-400">
                            {t('options.iv_breakdown')}
                        </span>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <div className="flex items-center justify-between text-[12px] font-mono mb-1.5">
                                <span className="text-[#34d399] flex items-center gap-1.5">
                                    <TrendingUp size={11} />
                                    {t('options.otm_call')} K {data.callStrike}
                                </span>
                                <span className="text-[#34d399] font-semibold">{callIv}%</span>
                            </div>
                            <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-[#10b981]/70 to-[#34d399]" style={{ width: `${(callIv / maxIv) * 100}%` }} />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between text-[12px] font-mono mb-1.5">
                                <span className="text-[#fb7185] flex items-center gap-1.5">
                                    <TrendingDown size={11} />
                                    {t('options.otm_put')} K {data.putStrike}
                                </span>
                                <span className="text-[#fb7185] font-semibold">{putIv}%</span>
                            </div>
                            <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-[#f43f5e] to-[#fb7185]/70" style={{ width: `${(putIv / maxIv) * 100}%` }} />
                            </div>
                        </div>
                    </div>
                    <p className="mt-4 text-[12.5px] text-gray-400 leading-relaxed italic">
                        {interp === 'bullish_skew' ? t('options.skew.bullish_desc')
                        : interp === 'bearish_skew' ? t('options.skew.bearish_desc')
                        : t('options.skew.neutral_desc')}
                    </p>
                </div>
            ) : (
                <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
                    <AlertTriangle size={14} className="text-amber-400" />
                    <span className="text-[12.5px] text-gray-400">{t('options.skew.no_data_desc')}</span>
                </div>
            )}
        </>
    );
}

export default function OptionsPanel({ data, loading, error, supported }) {
    const { t } = useT();

    if (!supported) return null;

    return (
        <div
            data-testid="options-panel"
            className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-6"
        >
            <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                    <div className="flex items-center gap-2">
                        <Crosshair size={16} className="text-amber-400" />
                        <h3 className="font-display text-lg font-bold text-white">
                            {data?.kind === 'skew' ? t('options.title_skew') : t('options.title_full')}
                        </h3>
                    </div>
                    <p className="text-[12px] tracking-[0.25em] uppercase text-gray-500 mt-1 font-semibold">
                        {data?.kind === 'skew' ? t('options.subtitle_skew') : t('options.subtitle_full')}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[10.5px] tracking-[0.22em] uppercase font-bold text-gray-500">{t('options.weekly_label')}</div>
                    <div className="text-[12px] text-gray-300 font-mono mt-0.5">{data?.assetLabel || '—'}</div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-gray-500 text-[13px] py-8 justify-center">
                    <RefreshCw size={14} className="animate-spin text-amber-400/60" />
                    {t('options.loading')}
                </div>
            ) : error || !data ? (
                <div className="flex items-center gap-2 text-gray-400 text-[13px] py-8 justify-center bg-black/20 rounded-2xl">
                    <AlertTriangle size={14} className="text-amber-400/70" />
                    {t('options.unavailable')}
                </div>
            ) : data.kind === 'skew' ? (
                <SkewPanel data={data} t={t} />
            ) : (
                <FullPanel data={data} t={t} />
            )}
        </div>
    );
}
