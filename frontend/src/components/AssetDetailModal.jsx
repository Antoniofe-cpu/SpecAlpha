import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    BarChart,
    Bar,
    Cell,
    Brush,
} from 'recharts';
import {
    X,
    Calendar,
    Download,
    RefreshCw,
    AlertTriangle,
    TrendingUp,
    Activity,
    BarChart3,
    ZoomIn,
    ZoomOut,
    Maximize,
    Newspaper,
    Target as TargetIcon,
    Eye,
    EyeOff,
    TrendingDown,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchHistory, fetchMacro, fetchVerdict, fetchVerdictPerformance } from '../api';
import { cn, formatNumber, formatSigned, getTrendAnalysis, TONE_CLASSES } from '../utils';
import { useT } from '../i18n';

const SERIES = [
    { key: 'netPosition', label: 'Net', color: '#f59e0b', gradId: 'gNet', yAxis: 'left', fmt: 'k' },
    { key: 'long',        label: 'Long',color: '#34d399', gradId: 'gLong', yAxis: 'left', fmt: 'k' },
    { key: 'short',       label: 'Short', color: '#fb7185', gradId: 'gShort', yAxis: 'left', fmt: 'k' },
    { key: 'price',       label: 'Prezzo', color: '#60a5fa', gradId: 'gPrice', yAxis: 'right', fmt: 'raw' },
];

export default function AssetDetailModal({ asset, onClose, isFavorite, onToggleFav }) {
    const { t } = useT();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [windowSize, setWindowSize] = useState(26);
    const [snapshot, setSnapshot] = useState(asset);
    const [visible, setVisible] = useState({
        netPosition: true,
        long: false,
        short: false,
        price: true,
    });
    // Zoom range inside the selected windowSize slice: [startIndex, endIndex] over chartData
    const [zoomRange, setZoomRange] = useState(null); // null = full window

    const [macro, setMacro] = useState(null);
    const [macroLoading, setMacroLoading] = useState(false);
    const [verdict, setVerdict] = useState(null);
    const [verdictLoading, setVerdictLoading] = useState(false);
    const [showPerformance, setShowPerformance] = useState(false);
    const [performance, setPerformance] = useState(null);
    const [performanceLoading, setPerformanceLoading] = useState(false);

    const toggleSeries = (k) =>
        setVisible((v) => {
            const next = { ...v, [k]: !v[k] };
            if (!Object.values(next).some(Boolean)) return v;
            return next;
        });

    // Reset zoom when windowSize or asset changes
    useEffect(() => {
        setZoomRange(null);
    }, [windowSize, asset?.assetId]);

    useEffect(() => {
        if (!asset?.assetId) return;
        let cancelled = false;
        setLoading(true);
        fetchHistory(asset.assetId, 100)
            .then((d) => {
                if (cancelled) return;
                setHistory(d || []);
            })
            .catch(() => setHistory([]))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [asset?.assetId]);

    useEffect(() => {
        setSnapshot(asset);
    }, [asset?.assetId]);

    // Lazy fetch macro + verdict on modal open / asset change
    useEffect(() => {
        if (!asset?.assetId) return;
        let cancelled = false;
        setMacroLoading(true);
        setVerdictLoading(true);
        setMacro(null);
        setVerdict(null);
        setPerformance(null);
        setShowPerformance(false);
        fetchMacro(asset.assetId)
            .then((d) => !cancelled && setMacro(d))
            .catch(() => {})
            .finally(() => !cancelled && setMacroLoading(false));
        fetchVerdict(asset.assetId)
            .then((d) => !cancelled && setVerdict(d))
            .catch(() => {})
            .finally(() => !cancelled && setVerdictLoading(false));
        return () => { cancelled = true; };
    }, [asset?.assetId]);

    const loadPerformance = async () => {
        if (!asset?.assetId) return;
        setPerformanceLoading(true);
        try {
            const d = await fetchVerdictPerformance(asset.assetId);
            setPerformance(d);
        } catch (e) {
            console.error(e);
        } finally {
            setPerformanceLoading(false);
        }
    };

    const togglePerformance = () => {
        setShowPerformance((prev) => {
            const next = !prev;
            if (next && !performance) loadPerformance();
            return next;
        });
    };

    const handleExport = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            // Ensure we have the performance data
            let perf = performance;
            if (!perf) {
                try {
                    perf = await fetchVerdictPerformance(asset.assetId);
                    setPerformance(perf);
                } catch (e) {
                    console.warn('perf fetch failed', e);
                }
            }

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const margin = 14;
            let y = margin;

            // ----- Header -----
            pdf.setFillColor(10, 10, 13);
            pdf.rect(0, 0, pageW, 32, 'F');
            pdf.setTextColor(245, 158, 11);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.text(t('pdf.title'), margin, 14);
            pdf.setTextColor(180);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text(`${snapshot.name} · ${asset.assetId} · ${snapshot.type}`, margin, 21);
            const stamp = new Date().toLocaleString();
            pdf.text(`${t('pdf.generated')}: ${stamp}`, pageW - margin, 21, { align: 'right' });
            y = 40;

            // ----- Section: Snapshot -----
            pdf.setTextColor(245, 158, 11);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.text(t('pdf.section.summary'), margin, y);
            y += 2;
            const trendForPdf = getTrendAnalysis(snapshot);
            autoTable(pdf, {
                startY: y + 1,
                margin: { left: margin, right: margin },
                theme: 'grid',
                styles: { fontSize: 9, textColor: 30, lineColor: 220, lineWidth: 0.1 },
                headStyles: { fillColor: [22, 22, 28], textColor: 255 },
                body: [
                    [t('pdf.field.report_date'), snapshot.reportDate || '—'],
                    [t('pdf.field.signal'), t(trendForPdf.signalKey)],
                    [t('modal.net_position'), formatNumber(snapshot.netPosition)],
                    ['Δ WoW', formatSigned(snapshot.wowDelta)],
                    [t('modal.col.long'), `${formatNumber(snapshot.long)} (${formatSigned(snapshot.changeLong)})`],
                    [t('modal.col.short'), `${formatNumber(snapshot.short)} (${formatSigned(snapshot.changeShort)})`],
                    [t('card.oi_share'), `${snapshot.openInterestShare ?? '—'}%`],
                    [t('card.intensity'), `${snapshot.intensityIndex ?? '—'}/100`],
                ],
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 50, fillColor: [248, 248, 252] },
                },
            });
            y = pdf.lastAutoTable.finalY + 6;

            // ----- Macro insight quote -----
            if (snapshot.macro) {
                pdf.setTextColor(245, 158, 11);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.text(t('modal.macro_intel'), margin, y);
                y += 5;
                pdf.setTextColor(40);
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(9);
                const lines = pdf.splitTextToSize(`"${snapshot.macro}"`, pageW - margin * 2);
                pdf.text(lines, margin, y);
                y += lines.length * 4 + 4;
            }

            // ----- Macro Sentiment -----
            if (macro && macro.summary) {
                if (y > pageH - 60) { pdf.addPage(); y = margin; }
                pdf.setTextColor(245, 158, 11);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(11);
                pdf.text(`${t('pdf.section.macro')} · ${macro.eventCount ?? 0} ${t('modal.events')}`, margin, y);
                y += 5;
                pdf.setTextColor(40);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(9);
                const macLines = pdf.splitTextToSize(macro.summary, pageW - margin * 2);
                pdf.text(macLines, margin, y);
                y += macLines.length * 4 + 3;
                if (macro.events && macro.events.length) {
                    autoTable(pdf, {
                        startY: y,
                        margin: { left: margin, right: margin },
                        theme: 'striped',
                        styles: { fontSize: 8, textColor: 40, lineColor: 230, lineWidth: 0.05 },
                        headStyles: { fillColor: [22, 22, 28], textColor: 255 },
                        head: [[t('pdf.field.report_date'), 'Country', 'Event', 'Prev']],
                        body: macro.events.slice(0, 6).map((e) => [
                            e.date || '—', e.country || '—', e.event || '—', e.previous || '—',
                        ]),
                    });
                    y = pdf.lastAutoTable.finalY + 4;
                }
            }

            // ----- Final Verdict -----
            if (verdict) {
                if (y > pageH - 50) { pdf.addPage(); y = margin; }
                pdf.setTextColor(245, 158, 11);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(11);
                pdf.text(t('pdf.section.verdict'), margin, y);
                y += 6;
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(14);
                const verdictColor =
                    verdict.verdict === 'LONG' ? [16, 185, 129]
                        : verdict.verdict === 'SHORT' ? [244, 63, 94]
                            : [245, 158, 11];
                pdf.setTextColor(...verdictColor);
                pdf.text(verdict.verdict || '—', margin, y);
                pdf.setTextColor(80);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(9);
                pdf.text(`${t('pdf.field.confidence')}: ${verdict.confidence ?? '—'}/5`, margin + 30, y);
                if (verdict.entryPrice) {
                    pdf.text(`${t('pdf.field.entry')}: ${verdict.entryPrice}`, margin + 70, y);
                }
                y += 6;
                pdf.setTextColor(40);
                const vLines = pdf.splitTextToSize(verdict.summary || '—', pageW - margin * 2);
                pdf.text(vLines, margin, y);
                y += vLines.length * 4 + 4;
            }

            // ----- COT History table -----
            if (history && history.length) {
                if (y > pageH - 60) { pdf.addPage(); y = margin; }
                pdf.setTextColor(245, 158, 11);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(11);
                pdf.text(t('pdf.section.history'), margin, y);
                y += 2;
                autoTable(pdf, {
                    startY: y + 1,
                    margin: { left: margin, right: margin },
                    theme: 'grid',
                    styles: { fontSize: 8, textColor: 40, lineColor: 220, lineWidth: 0.05 },
                    headStyles: { fillColor: [22, 22, 28], textColor: 255 },
                    head: [[
                        t('modal.col.date'),
                        t('modal.col.long'),
                        t('modal.col.short'),
                        t('modal.col.net'),
                        t('modal.col.delta'),
                    ]],
                    body: history.slice(0, 8).map((h) => [
                        h.date,
                        formatNumber(h.long),
                        formatNumber(h.short),
                        formatNumber(h.netPosition),
                        formatSigned(h.wowDelta),
                    ]),
                });
                y = pdf.lastAutoTable.finalY + 6;
            }

            // ----- Performance R-multiple -----
            if (perf) {
                if (y > pageH - 70) { pdf.addPage(); y = margin; }
                pdf.setTextColor(245, 158, 11);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(11);
                pdf.text(t('pdf.section.performance'), margin, y);
                y += 2;
                autoTable(pdf, {
                    startY: y + 1,
                    margin: { left: margin, right: margin },
                    theme: 'grid',
                    styles: { fontSize: 9, textColor: 40, lineColor: 220, lineWidth: 0.05 },
                    headStyles: { fillColor: [22, 22, 28], textColor: 255 },
                    head: [[
                        t('pdf.stats.total'),
                        t('pdf.stats.evaluated'),
                        t('pdf.stats.wins'),
                        t('pdf.stats.losses'),
                        t('pdf.stats.winrate'),
                        t('pdf.stats.cum_r'),
                        t('pdf.stats.cum_net_r'),
                    ]],
                    body: [[
                        perf.totalVerdicts ?? 0,
                        perf.evaluated ?? 0,
                        perf.wins ?? 0,
                        perf.losses ?? 0,
                        perf.winRate !== null && perf.winRate !== undefined ? `${perf.winRate}%` : '—',
                        perf.cumulativeR != null ? `${formatSigned(perf.cumulativeR)}R` : '—',
                        perf.cumulativeNetR != null ? `${formatSigned(perf.cumulativeNetR)}R` : '—',
                    ]],
                });
                y = pdf.lastAutoTable.finalY + 4;

                if (perf.history && perf.history.length) {
                    autoTable(pdf, {
                        startY: y,
                        margin: { left: margin, right: margin },
                        theme: 'striped',
                        styles: { fontSize: 7.5, textColor: 40, lineColor: 230, lineWidth: 0.05 },
                        headStyles: { fillColor: [22, 22, 28], textColor: 255 },
                        head: [[
                            t('modal.perf.col.report'),
                            t('modal.perf.col.verdict'),
                            t('modal.perf.col.entry_price'),
                            t('modal.perf.col.week_min'),
                            t('modal.perf.col.week_max'),
                            t('modal.perf.col.mfe'),
                            t('modal.perf.col.mae'),
                            t('modal.perf.col.r'),
                            t('modal.perf.col.net_r'),
                            t('modal.perf.col.outcome'),
                        ]],
                        body: perf.history.slice(0, 25).map((r) => [
                            r.verdictDate || '—',
                            r.verdict || '—',
                            r.entryPrice != null ? Number(r.entryPrice).toFixed(4) : '—',
                            r.weekMin != null ? Number(r.weekMin).toFixed(4) : '—',
                            r.weekMax != null ? Number(r.weekMax).toFixed(4) : '—',
                            r.mfe != null ? Number(r.mfe).toFixed(4) : '—',
                            r.mae != null ? Number(r.mae).toFixed(4) : '—',
                            r.rValue != null ? `${r.rValue}` : '—',
                            r.netR != null ? formatSigned(r.netR) : '—',
                            r.outcome || '—',
                        ]),
                    });
                }
            }

            // ----- Footer -----
            const pageCount = pdf.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                pdf.setPage(i);
                pdf.setFontSize(7.5);
                pdf.setTextColor(140);
                pdf.text(t('pdf.footer'), margin, pageH - 6);
                pdf.text(`${i} / ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
            }

            const fname = `${asset.assetId}_${snapshot.reportDate || 'snapshot'}.pdf`;
            pdf.save(fname);
        } catch (e) {
            console.error('PDF export failed', e);
        } finally {
            setExporting(false);
        }
    };

    const trend = getTrendAnalysis(snapshot);
    const chartData = [...(history || [])]
        .filter((h) => !h.error)
        .slice(0, windowSize)
        .reverse();
    const longTotal = (snapshot?.long || 0) + (snapshot?.short || 0) || 1;
    const longPct = Math.round(((snapshot?.long || 0) / longTotal) * 100);

    // Price domain padded so variations are visible (right axis)
    const priceDomain = (() => {
        const prices = chartData.map((d) => d.price).filter((p) => typeof p === 'number');
        if (!prices.length) return ['auto', 'auto'];
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const pad = Math.max((max - min) * 0.15, max * 0.01);
        return [min - pad, max + pad];
    })();

    // Zoom helpers
    const zStart = zoomRange ? Math.max(0, zoomRange[0]) : 0;
    const zEnd = zoomRange ? Math.min(chartData.length - 1, zoomRange[1]) : Math.max(0, chartData.length - 1);
    const zoomIn = () => {
        const mid = Math.floor((zStart + zEnd) / 2);
        const half = Math.max(2, Math.floor((zEnd - zStart) / 4));
        setZoomRange([Math.max(0, mid - half), Math.min(chartData.length - 1, mid + half)]);
    };
    const zoomOut = () => {
        if (!zoomRange) return;
        const mid = Math.floor((zStart + zEnd) / 2);
        const half = Math.max(4, Math.floor((zEnd - zStart) * 0.9));
        const newStart = Math.max(0, mid - half);
        const newEnd = Math.min(chartData.length - 1, mid + half);
        if (newStart === 0 && newEnd === chartData.length - 1) setZoomRange(null);
        else setZoomRange([newStart, newEnd]);
    };
    const resetZoom = () => setZoomRange(null);




    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] flex items-stretch sm:items-center justify-center p-0 sm:p-6 bg-black/85 backdrop-blur-md"
                onClick={onClose}
                data-testid="detail-modal-overlay"
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.97, y: 14 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative bg-[#0a0a0d] border border-white/10 sm:rounded-[28px] w-full max-w-6xl h-full sm:h-auto sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
                    data-testid="detail-modal"
                >
                    {/* Header (sticky) */}
                    <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8 border-b border-white/5">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                                <TrendingUp className="text-amber-400" size={24} />
                            </div>
                            <div>
                                <div className="text-[12px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-1">
                                    {snapshot.type} • {snapshot.assetId}
                                </div>
                                <h2 className="font-display text-3xl sm:text-[34px] font-bold text-white leading-tight">
                                    {snapshot.name}
                                </h2>
                                <div className="flex items-center gap-2 mt-2">
                                    <Calendar size={13} className="text-gray-500" />
                                    <span className="text-[13px] font-mono text-gray-400">
                                        {t('modal.report')} {snapshot.reportDate}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                data-testid="modal-export-btn"
                                onClick={handleExport}
                                disabled={exporting}
                                className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] bg-white/[0.06] hover:bg-amber-500/15 hover:border-amber-500/40 border border-white/10 rounded-2xl flex items-center gap-2 transition-colors disabled:opacity-50"
                            >
                                {exporting ? (
                                    <RefreshCw size={14} className="animate-spin" />
                                ) : (
                                    <Download size={14} />
                                )}
                                {exporting ? t('modal.exporting') : t('modal.pdf')}
                            </button>
                            <button
                                data-testid="modal-close-btn"
                                onClick={onClose}
                                className="p-3 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Body (scrollable) */}
                    <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 sm:space-y-8">
                        {/* Top metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
                                <div className="text-[11px] tracking-[0.28em] uppercase text-gray-400 font-semibold mb-2">
                                    {t('modal.sentiment')}
                                </div>
                                <div className={cn('font-display text-2xl font-bold mb-1', TONE_CLASSES[trend.tone])}>
                                    {t(trend.signalKey)}
                                </div>
                                <div className="text-[13px] text-gray-400">
                                    {t('modal.long_term')} <span className="text-gray-200 font-mono">{trend.longTerm}</span> · {t('modal.short_term')}{' '}
                                    <span className="text-gray-200 font-mono">{trend.shortTerm}</span>
                                </div>
                            </div>
                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
                                <div className="text-[11px] tracking-[0.28em] uppercase text-gray-400 font-semibold mb-2">
                                    {t('modal.net_position')}
                                </div>
                                <div className="font-mono text-3xl font-semibold text-white tnum mb-2">
                                    {formatNumber(snapshot.netPosition)}
                                </div>
                                <div className="flex items-center gap-2 text-[13px]">
                                    <span className="text-gray-400">Δ WoW:</span>
                                    <span
                                        className={cn(
                                            'font-mono font-semibold',
                                            snapshot.wowDelta >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]'
                                        )}
                                    >
                                        {formatSigned(snapshot.wowDelta)}
                                    </span>
                                </div>
                                <div className="mt-3 h-2 w-full bg-white/[0.05] rounded-full overflow-hidden flex">
                                    <div className="h-full bg-[#34d399]" style={{ width: `${longPct}%` }} />
                                    <div className="h-full bg-[#fb7185]" style={{ width: `${100 - longPct}%` }} />
                                </div>
                            </div>
                            <div className="bg-amber-500/[0.07] border border-amber-500/25 rounded-3xl p-5">
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity size={12} className="text-amber-400" />
                                    <span className="text-[11px] tracking-[0.28em] uppercase text-amber-300 font-bold">
                                        {t('modal.macro_intel')}
                                    </span>
                                </div>
                                <p className="text-[14px] leading-relaxed text-gray-200 italic">"{snapshot.macro}"</p>
                            </div>
                        </div>

                        {/* Macro Sentiment + Final Verdict */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5" data-testid="macro-sentiment-card">
                                <div className="flex items-center gap-2 mb-3">
                                    <Newspaper size={14} className="text-sky-400" />
                                    <span className="text-[11px] tracking-[0.28em] uppercase text-sky-300 font-bold">
                                        {t('modal.macro_sentiment')}
                                    </span>
                                    <span className="ml-auto text-[10px] text-gray-500 font-mono">
                                        {macro?.eventCount ?? '—'} {t('modal.events')}
                                    </span>
                                </div>
                                {macroLoading ? (
                                    <div className="flex items-center gap-2 text-gray-500 text-[13px]">
                                        <RefreshCw size={14} className="animate-spin text-sky-400/60" />
                                        {t('modal.macro_loading')}
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-[14px] leading-relaxed text-gray-200 italic mb-3">
                                            {macro?.summary || '—'}
                                        </p>
                                        {macro?.events?.length > 0 && (
                                            <div className="space-y-1.5">
                                                {macro.events.slice(0, 4).map((e, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-[12px] font-mono">
                                                        <span className="text-sky-400 font-bold w-8">{e.country}</span>
                                                        <span className="text-gray-500 w-20">{e.date}</span>
                                                        <span className="text-gray-200 flex-1 truncate">{e.event}</span>
                                                        {e.previous && (
                                                            <span className="text-gray-500">prev {e.previous}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div
                                data-testid="final-verdict-card"
                                className={cn(
                                    'rounded-3xl p-5 border',
                                    verdict?.verdict === 'LONG'
                                        ? 'bg-[#10b981]/[0.07] border-[#10b981]/30'
                                        : verdict?.verdict === 'SHORT'
                                            ? 'bg-[#f43f5e]/[0.07] border-[#f43f5e]/30'
                                            : 'bg-amber-500/[0.06] border-amber-500/25'
                                )}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <TargetIcon size={14} className="text-amber-400" />
                                    <span className="text-[11px] tracking-[0.28em] uppercase text-amber-300 font-bold">
                                        {t('modal.final_verdict')}
                                    </span>
                                    <span className="ml-auto text-[10px] text-gray-500 font-mono">
                                        {t('modal.confidence')} {verdict?.confidence ?? '—'}/5
                                    </span>
                                </div>
                                {verdictLoading ? (
                                    <div className="flex items-center gap-2 text-gray-500 text-[13px]">
                                        <RefreshCw size={14} className="animate-spin text-amber-400/60" />
                                        {t('modal.verdict_loading')}
                                    </div>
                                ) : verdict ? (
                                    <>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span
                                                className={cn(
                                                    'inline-flex items-center gap-2 px-4 py-2 rounded-full font-display text-[16px] font-bold tracking-wider',
                                                    verdict.verdict === 'LONG' && 'bg-[#10b981]/20 text-[#34d399]',
                                                    verdict.verdict === 'SHORT' && 'bg-[#f43f5e]/20 text-[#fb7185]',
                                                    verdict.verdict === 'WAIT' && 'bg-amber-500/20 text-amber-300'
                                                )}
                                            >
                                                {verdict.verdict === 'LONG' && <TrendingUp size={16} />}
                                                {verdict.verdict === 'SHORT' && <TrendingDown size={16} />}
                                                {verdict.verdict === 'WAIT' && <Activity size={16} />}
                                                {verdict.verdict}
                                            </span>
                                            <div className="flex items-center gap-0.5">
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                    <div
                                                        key={n}
                                                        className={cn(
                                                            'w-1.5 h-4 rounded-full',
                                                            n <= (verdict.confidence || 0) ? 'bg-amber-400' : 'bg-white/10'
                                                        )}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-[14px] leading-relaxed text-gray-200">
                                            {verdict.summary}
                                        </p>
                                        <div className="mt-3 flex items-center gap-3 text-[11px] font-mono text-gray-500">
                                            <span>{t('modal.entry')} {verdict.entryPrice ?? '—'}</span>
                                            <span>·</span>
                                            <span>{t('modal.report_label')} {verdict.entryReportDate ?? '—'}</span>
                                            {verdict.priceChangePct !== null && verdict.priceChangePct !== undefined && (
                                                <>
                                                    <span>·</span>
                                                    <span className={cn(verdict.priceChangePct >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                                        Δ {verdict.priceChangePct}%
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-[13px] text-gray-500">{t('modal.verdict_unavailable')}</p>
                                )}
                            </div>
                        </div>

                        {/* Chart */}
                        <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <BarChart3 size={16} className="text-amber-400" />
                                        <h3 className="font-display text-lg font-bold text-white">
                                            {t('modal.chart_title')}
                                        </h3>
                                    </div>
                                    <p className="text-[12px] tracking-[0.25em] uppercase text-gray-500 mt-1 font-semibold">
                                        {t('modal.chart_subtitle')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 bg-black/30 rounded-2xl border border-white/10 p-1.5">
                                    {[13, 26, 52, 100].map((n) => (
                                        <button
                                            key={n}
                                            data-testid={`window-${n}`}
                                            onClick={() => setWindowSize(n)}
                                            className={cn(
                                                'px-3.5 py-1.5 text-[12px] font-mono rounded-xl font-semibold uppercase tracking-wider transition-colors',
                                                windowSize === n
                                                    ? 'bg-amber-500 text-black'
                                                    : 'text-gray-400 hover:text-white'
                                            )}
                                        >
                                            {n}w
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Series toggles + Zoom controls */}
                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                {SERIES.map((s) => (
                                    <button
                                        key={s.key}
                                        data-testid={`series-toggle-${s.key}`}
                                        onClick={() => toggleSeries(s.key)}
                                        className={cn(
                                            'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12px] font-semibold tracking-wider transition-colors',
                                            visible[s.key]
                                                ? 'bg-white/[0.06] border-white/15 text-white'
                                                : 'bg-transparent border-white/10 text-gray-500 hover:text-gray-300'
                                        )}
                                    >
                                        <span
                                            className="w-2.5 h-2.5 rounded-full"
                                            style={{
                                                background: visible[s.key] ? s.color : 'transparent',
                                                borderColor: s.color,
                                                borderWidth: visible[s.key] ? 0 : 1,
                                                borderStyle: 'solid',
                                            }}
                                        />
                                        {s.label}
                                    </button>
                                ))}

                                {/* Zoom controls pushed right */}
                                <div className="flex items-center gap-1 ml-auto bg-black/30 border border-white/10 rounded-full p-1">
                                    <button
                                        data-testid="zoom-in-btn"
                                        onClick={zoomIn}
                                        disabled={zEnd - zStart < 4}
                                        className="p-1.5 rounded-full text-gray-300 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-30 transition-colors"
                                        aria-label="Zoom in"
                                    >
                                        <ZoomIn size={14} />
                                    </button>
                                    <button
                                        data-testid="zoom-out-btn"
                                        onClick={zoomOut}
                                        disabled={!zoomRange}
                                        className="p-1.5 rounded-full text-gray-300 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-30 transition-colors"
                                        aria-label="Zoom out"
                                    >
                                        <ZoomOut size={14} />
                                    </button>
                                    <button
                                        data-testid="zoom-reset-btn"
                                        onClick={resetZoom}
                                        disabled={!zoomRange}
                                        className="p-1.5 rounded-full text-gray-300 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-30 transition-colors"
                                        aria-label="Reset zoom"
                                    >
                                        <Maximize size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="h-[400px]">
                                {loading ? (
                                    <div className="h-full flex items-center justify-center text-gray-500 text-[13px]">
                                        <RefreshCw size={18} className="animate-spin mr-2 text-amber-400/60" /> {t('modal.chart_loading')}
                                    </div>
                                ) : chartData.length > 1 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -8 }}>
                                            <defs>
                                                {SERIES.map((s) => (
                                                    <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                                                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                                            <XAxis
                                                dataKey="date"
                                                stroke="#6b7280"
                                                fontSize={11}
                                                axisLine={false}
                                                tickLine={false}
                                                tickFormatter={(v) => v?.slice(5)}
                                                tick={{ fontFamily: 'Geist Mono' }}
                                            />
                                            <YAxis
                                                yAxisId="left"
                                                stroke="#6b7280"
                                                fontSize={11}
                                                axisLine={false}
                                                tickLine={false}
                                                width={60}
                                                tick={{ fontFamily: 'Geist Mono' }}
                                                tickFormatter={(v) => Math.round(v / 1000) + 'k'}
                                            />
                                            <YAxis
                                                yAxisId="right"
                                                orientation="right"
                                                stroke="#60a5fa"
                                                fontSize={11}
                                                axisLine={false}
                                                tickLine={false}
                                                width={60}
                                                tick={{ fontFamily: 'Geist Mono' }}
                                                domain={priceDomain}
                                                allowDataOverflow={false}
                                                tickFormatter={(v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                                hide={!visible.price}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: '#0a0a0d',
                                                    border: '1px solid rgba(245,158,11,0.4)',
                                                    borderRadius: 12,
                                                    fontSize: 12,
                                                    fontFamily: 'Geist Mono',
                                                }}
                                                labelStyle={{ color: '#f59e0b' }}
                                                itemStyle={{ color: '#fff' }}
                                                formatter={(v, name) => {
                                                    if (name === 'Prezzo') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
                                                    return formatNumber(v);
                                                }}
                                            />
                                            {SERIES.map((s) =>
                                                visible[s.key] ? (
                                                    <Area
                                                        key={s.key}
                                                        type="monotone"
                                                        dataKey={s.key}
                                                        yAxisId={s.yAxis}
                                                        name={s.label}
                                                        stroke={s.color}
                                                        strokeWidth={2}
                                                        fill={`url(#${s.gradId})`}
                                                        connectNulls
                                                        style={{ filter: `drop-shadow(0 0 6px ${s.color}55)` }}
                                                    />
                                                ) : null
                                            )}
                                            <Brush
                                                dataKey="date"
                                                height={28}
                                                travellerWidth={10}
                                                stroke="#f59e0b"
                                                fill="rgba(245,158,11,0.06)"
                                                startIndex={zStart}
                                                endIndex={zEnd}
                                                tickFormatter={(v) => v?.slice(5)}
                                                onChange={(r) => {
                                                    if (r && typeof r.startIndex === 'number' && typeof r.endIndex === 'number') {
                                                        if (r.startIndex === 0 && r.endIndex === chartData.length - 1) setZoomRange(null);
                                                        else setZoomRange([r.startIndex, r.endIndex]);
                                                    }
                                                }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                                        <AlertTriangle className="text-orange-500/40" size={20} />
                                        <span className="text-[11px] uppercase tracking-widest">{t('modal.chart_unavailable')}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* WoW delta bar chart + table */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-6">
                                <h3 className="font-display text-lg font-bold text-white mb-1">{t('modal.delta_recent')}</h3>
                                <p className="text-[12px] tracking-[0.25em] uppercase text-gray-500 font-semibold mb-4">
                                    {t('modal.delta_subtitle')}
                                </p>
                                <div className="h-[240px]">
                                    {chartData.length > 1 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData.slice(-12)} margin={{ top: 5, right: 5, bottom: 0, left: -8 }}>
                                                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                                                <XAxis
                                                    dataKey="date"
                                                    stroke="#6b7280"
                                                    fontSize={11}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tickFormatter={(v) => v?.slice(5)}
                                                    tick={{ fontFamily: 'Geist Mono' }}
                                                />
                                                <YAxis
                                                    stroke="#6b7280"
                                                    fontSize={11}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    width={56}
                                                    tick={{ fontFamily: 'Geist Mono' }}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: '#0a0a0d',
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: 12,
                                                        fontSize: 12,
                                                        fontFamily: 'Geist Mono',
                                                    }}
                                                    formatter={(v) => formatSigned(v)}
                                                />
                                                <Bar dataKey="wowDelta" radius={[6, 6, 0, 0]}>
                                                    {chartData.slice(-12).map((d, i) => (
                                                        <Cell key={i} fill={d.wowDelta >= 0 ? '#10b981' : '#f43f5e'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-600 text-[13px]">—</div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl overflow-hidden">
                                <div className="px-6 pt-6 pb-3">
                                    <h3 className="font-display text-lg font-bold text-white mb-1">{t('modal.history_table')}</h3>
                                    <p className="text-[12px] tracking-[0.25em] uppercase text-gray-500 font-semibold">
                                        {t('modal.history_subtitle')}
                                    </p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[13px]" data-testid="history-table">
                                        <thead>
                                            <tr className="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold border-b border-white/5">
                                                <th className="px-4 py-3 text-left">{t('modal.col.date')}</th>
                                                <th className="px-4 py-3 text-right">{t('modal.col.long')}</th>
                                                <th className="px-4 py-3 text-right">{t('modal.col.short')}</th>
                                                <th className="px-4 py-3 text-right">{t('modal.col.net')}</th>
                                                <th className="px-4 py-3 text-right">{t('modal.col.delta')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="font-mono">
                                            {history.slice(0, 8).map((h, i) => (
                                                <tr key={h.date} className={cn('border-b border-white/[0.04]', i % 2 === 1 && 'bg-white/[0.02]')}>
                                                    <td className="px-4 py-3 text-gray-200">{h.date}</td>
                                                    <td className="px-4 py-3 text-right text-[#34d399]">{formatNumber(h.long)}</td>
                                                    <td className="px-4 py-3 text-right text-[#fb7185]">{formatNumber(h.short)}</td>
                                                    <td className="px-4 py-3 text-right text-white font-semibold">{formatNumber(h.netPosition)}</td>
                                                    <td className={cn('px-4 py-3 text-right font-semibold', h.wowDelta >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                                        {formatSigned(h.wowDelta)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Performance Verdetti (ultimo, collassabile) */}
                        <div>
                            <button
                                data-testid="toggle-performance-btn"
                                onClick={togglePerformance}
                                className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-[#0e0e14] hover:bg-[#14141c] border border-white/[0.07] rounded-2xl transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {showPerformance ? (
                                        <EyeOff size={15} className="text-amber-400" />
                                    ) : (
                                        <Eye size={15} className="text-amber-400" />
                                    )}
                                    <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-gray-200">
                                        {t('modal.perf_title')}
                                    </span>
                                </div>
                                <span className="text-[11px] text-gray-500 font-mono">
                                    {showPerformance ? t('modal.hide') : t('modal.show')}
                                </span>
                            </button>
                            {showPerformance && (
                                <div
                                    data-testid="performance-panel"
                                    className="mt-3 bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5"
                                >
                                    <p className="text-[12.5px] text-gray-500 mb-2 leading-relaxed">
                                        {t('modal.perf_logic_r')}
                                    </p>
                                    <p className="text-[12px] text-amber-300/70 mb-4 leading-relaxed bg-amber-500/[0.04] border border-amber-500/15 rounded-xl px-3 py-2">
                                        {t('modal.perf_synth_note_r')}
                                    </p>
                                    {performanceLoading ? (
                                        <div className="flex items-center gap-2 text-gray-500 text-[13px]">
                                            <RefreshCw size={14} className="animate-spin text-amber-400/60" />
                                            {t('modal.perf_loading')}
                                        </div>
                                    ) : performance ? (
                                        <>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                                                {[
                                                    { label: t('modal.perf.total'), v: performance.totalVerdicts },
                                                    { label: t('modal.perf.evaluated'), v: performance.evaluated },
                                                    { label: t('modal.perf.win'), v: performance.wins, color: 'text-[#34d399]' },
                                                    { label: t('modal.perf.loss'), v: performance.losses, color: 'text-[#fb7185]' },
                                                    {
                                                        label: t('modal.perf.winrate'),
                                                        v: performance.winRate !== null ? `${performance.winRate}%` : '—',
                                                        color: 'text-amber-300',
                                                    },
                                                ].map((s) => (
                                                    <div key={s.label} className="bg-black/30 border border-white/5 rounded-2xl p-3">
                                                        <div className="text-[10px] tracking-widest uppercase text-gray-500 font-semibold mb-1">
                                                            {s.label}
                                                        </div>
                                                        <div className={cn('font-mono text-[18px] font-semibold tnum', s.color)}>
                                                            {s.v ?? '—'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 mb-4">
                                                <div className="bg-black/30 border border-white/5 rounded-2xl p-3">
                                                    <div className="text-[10px] tracking-widest uppercase text-gray-500 font-semibold mb-1">
                                                        {t('modal.perf.r_cumulative')}
                                                    </div>
                                                    <div
                                                        className={cn(
                                                            'font-mono text-[18px] font-semibold tnum',
                                                            (performance.cumulativeR ?? 0) >= performance.evaluated
                                                                ? 'text-[#34d399]'
                                                                : 'text-[#fb7185]'
                                                        )}
                                                    >
                                                        {performance.cumulativeR != null
                                                            ? `${formatSigned(performance.cumulativeR)}R`
                                                            : '—'}
                                                    </div>
                                                </div>
                                                <div className="bg-black/30 border border-white/5 rounded-2xl p-3">
                                                    <div className="text-[10px] tracking-widest uppercase text-gray-500 font-semibold mb-1">
                                                        {t('modal.perf.r_net_cumulative')}
                                                    </div>
                                                    <div
                                                        className={cn(
                                                            'font-mono text-[18px] font-semibold tnum',
                                                            (performance.cumulativeNetR ?? 0) >= 0
                                                                ? 'text-[#34d399]'
                                                                : 'text-[#fb7185]'
                                                        )}
                                                    >
                                                        {performance.cumulativeNetR != null
                                                            ? `${formatSigned(performance.cumulativeNetR)}R`
                                                            : '—'}
                                                    </div>
                                                </div>
                                            </div>
                                            {performance.history.length > 0 ? (
                                                <>
                                                    {/* R Cumulative curve */}
                                                    {(() => {
                                                        const evaluated = [...performance.history]
                                                            .reverse()
                                                            .filter((r) => r.netR !== null && r.netR !== undefined);
                                                        if (evaluated.length === 0) return null;
                                                        let cum = 0;
                                                        const curve = evaluated.map((r) => {
                                                            cum += r.netR;
                                                            return { date: r.verdictDate, equity: Number(cum.toFixed(2)) };
                                                        });
                                                        const showCurve = curve.slice(-50);
                                                        return (
                                                            <div
                                                                data-testid="equity-chart"
                                                                className="bg-black/30 border border-white/5 rounded-2xl p-4 mb-4"
                                                            >
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-[11px] uppercase tracking-[0.22em] text-gray-500 font-semibold">
                                                                        {t('modal.perf.equity_label_r', showCurve.length)}
                                                                    </span>
                                                                    <span
                                                                        className={cn(
                                                                            'font-mono text-[14px] font-semibold tnum',
                                                                            cum >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]'
                                                                        )}
                                                                    >
                                                                        {formatSigned(cum.toFixed(2))}R
                                                                    </span>
                                                                </div>
                                                                <div className="h-[160px]">
                                                                    <ResponsiveContainer width="100%" height="100%">
                                                                        <AreaChart data={showCurve} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                                                                            <defs>
                                                                                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                                                                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                                                                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                                                                                </linearGradient>
                                                                            </defs>
                                                                            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                                                                            <XAxis
                                                                                dataKey="date"
                                                                                stroke="#6b7280"
                                                                                fontSize={10}
                                                                                axisLine={false}
                                                                                tickLine={false}
                                                                                tickFormatter={(v) => v?.slice(5)}
                                                                                tick={{ fontFamily: 'Geist Mono' }}
                                                                            />
                                                                            <YAxis
                                                                                stroke="#6b7280"
                                                                                fontSize={10}
                                                                                axisLine={false}
                                                                                tickLine={false}
                                                                                width={44}
                                                                                tick={{ fontFamily: 'Geist Mono' }}
                                                                                tickFormatter={(v) => v + 'R'}
                                                                            />
                                                                            <Tooltip
                                                                                contentStyle={{
                                                                                    backgroundColor: '#0a0a0d',
                                                                                    border: '1px solid rgba(245,158,11,0.4)',
                                                                                    borderRadius: 10,
                                                                                    fontSize: 11,
                                                                                    fontFamily: 'Geist Mono',
                                                                                }}
                                                                                formatter={(v) => `${v}R`}
                                                                            />
                                                                            <Area
                                                                                type="monotone"
                                                                                dataKey="equity"
                                                                                stroke="#f59e0b"
                                                                                strokeWidth={2}
                                                                                fill="url(#eqGrad)"
                                                                            />
                                                                        </AreaChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500 font-semibold mb-2">
                                                        {t('modal.perf.last_n', Math.min(10, performance.history.length))}
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                    <table className="w-full text-[12.5px]">
                                                        <thead>
                                                            <tr className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold border-b border-white/5">
                                                                <th className="px-2 py-2 text-left">{t('modal.perf.col.report')}</th>
                                                                <th className="px-2 py-2 text-left">{t('modal.perf.col.verdict')}</th>
                                                                <th className="px-2 py-2 text-right">{t('modal.perf.col.entry_price')}</th>
                                                                <th className="px-2 py-2 text-right">{t('modal.perf.col.week_min')}</th>
                                                                <th className="px-2 py-2 text-right">{t('modal.perf.col.week_max')}</th>
                                                                <th className="px-2 py-2 text-right">{t('modal.perf.col.mfe')}</th>
                                                                <th className="px-2 py-2 text-right">{t('modal.perf.col.mae')}</th>
                                                                <th className="px-2 py-2 text-right">{t('modal.perf.col.r')}</th>
                                                                <th className="px-2 py-2 text-right">{t('modal.perf.col.net_r')}</th>
                                                                <th className="px-2 py-2 text-left">{t('modal.perf.col.outcome')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="font-mono">
                                                            {performance.history.slice(0, 10).map((r, i) => (
                                                                <tr
                                                                    key={i}
                                                                    className={cn(
                                                                        'border-b border-white/[0.04]',
                                                                        i % 2 === 1 && 'bg-white/[0.02]'
                                                                    )}
                                                                >
                                                                    <td className="px-2 py-2 text-gray-200">{r.verdictDate}</td>
                                                                    <td
                                                                        className={cn(
                                                                            'px-2 py-2 font-semibold',
                                                                            r.verdict === 'LONG' && 'text-[#34d399]',
                                                                            r.verdict === 'SHORT' && 'text-[#fb7185]',
                                                                            r.verdict === 'WAIT' && 'text-amber-300'
                                                                        )}
                                                                    >
                                                                        {r.verdict}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-gray-200">
                                                                        {r.entryPrice != null ? Number(r.entryPrice).toFixed(4) : '—'}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-gray-400">
                                                                        {r.weekMin != null ? Number(r.weekMin).toFixed(4) : '—'}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-gray-400">
                                                                        {r.weekMax != null ? Number(r.weekMax).toFixed(4) : '—'}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#34d399]/90">
                                                                        {r.mfe != null ? Number(r.mfe).toFixed(4) : '—'}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-[#fb7185]/90">
                                                                        {r.mae != null ? Number(r.mae).toFixed(4) : '—'}
                                                                    </td>
                                                                    <td className="px-2 py-2 text-right text-amber-300 font-semibold">
                                                                        {r.rValue != null ? r.rValue.toFixed(2) : '—'}
                                                                    </td>
                                                                    <td
                                                                        className={cn(
                                                                            'px-2 py-2 text-right font-semibold',
                                                                            r.netR == null && 'text-gray-500',
                                                                            r.netR > 0 && 'text-[#34d399]',
                                                                            r.netR < 0 && 'text-[#fb7185]'
                                                                        )}
                                                                    >
                                                                        {r.netR != null ? `${formatSigned(r.netR)}R` : '—'}
                                                                    </td>
                                                                    <td
                                                                        className={cn(
                                                                            'px-2 py-2 text-[10px] uppercase tracking-widest font-bold',
                                                                            r.outcome === 'WIN' && 'text-[#34d399]',
                                                                            r.outcome === 'LOSS' && 'text-[#fb7185]',
                                                                            r.outcome === 'PENDING' && 'text-gray-500',
                                                                            r.outcome === 'NEUTRAL' && 'text-amber-300'
                                                                        )}
                                                                    >
                                                                        {r.outcome}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                </>
                                            ) : (
                                                <p className="text-[13px] text-gray-500 mt-3">
                                                    {t('modal.perf.empty')}
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-[13px] text-gray-500">—</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
