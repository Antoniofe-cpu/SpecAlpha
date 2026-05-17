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
    Lock,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchHistory, fetchMacro, fetchVerdict, fetchVerdictPerformance, fetchOptions, fetchSentiment } from '../api';
import { cn, formatNumber, formatSigned, getTrendAnalysis, TONE_CLASSES } from '../utils';
import { useT } from '../i18n';
import OptionsPanel from './OptionsPanel';
import SentimentGauge from './SentimentGauge';

/**
 * Locks the *content* of a section (not its title) for free/anon users.
 * The title and any wrapping card chrome is rendered by the caller — only the
 * children inside this component get the blur + overlay treatment.
 */
function LockedContent({ locked, onUnlock, children, minHeight = 80 }) {
    if (!locked) return children;
    return (
        <div className="relative" data-testid="modal-locked-section" style={{ minHeight }}>
            <div className="blur-[8px] saturate-50 opacity-70 pointer-events-none select-none">
                {children}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shadow-[0_0_24px_-6px_rgba(245,158,11,0.6)]">
                    <Lock size={14} className="text-amber-300" />
                </div>
                <button
                    type="button"
                    onClick={onUnlock}
                    data-testid="modal-unlock-btn"
                    className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-[0.22em] text-[11px] transition"
                >
                    Sblocca
                </button>
            </div>
        </div>
    );
}

const SERIES = [
    { key: 'netPosition',     label: 'Net',           color: '#f59e0b', gradId: 'gNet', yAxis: 'left', fmt: 'k' },
    { key: 'long',            label: 'Long',          color: '#34d399', gradId: 'gLong', yAxis: 'left', fmt: 'k' },
    { key: 'short',           label: 'Short',         color: '#fb7185', gradId: 'gShort', yAxis: 'left', fmt: 'k' },
    { key: 'retailNetPosition', label: 'Retail Net',  color: '#f472b6', gradId: 'gRetailNet', yAxis: 'left', fmt: 'k' },
    { key: 'retailLong',      label: 'Retail Long',   color: '#22d3ee', gradId: 'gRetailLong', yAxis: 'left', fmt: 'k' },
    { key: 'retailShort',     label: 'Retail Short',  color: '#a78bfa', gradId: 'gRetailShort', yAxis: 'left', fmt: 'k' },
    { key: 'price',           label: 'Prezzo',        color: '#60a5fa', gradId: 'gPrice', yAxis: 'right', fmt: 'raw' },
];

export default function AssetDetailModal({ asset, onClose, isFavorite, onToggleFav, locked = false, onUnlock }) {
    const { t, lang } = useT();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [windowSize, setWindowSize] = useState(26);
    const [snapshot, setSnapshot] = useState(asset);
    const [visible, setVisible] = useState({
        netPosition: true,
        long: false,
        short: false,
        retailNetPosition: false,
        retailLong: false,
        retailShort: false,
        price: true,
    });
    // Zoom range inside the selected windowSize slice: [startIndex, endIndex] over chartData
    const [zoomRange, setZoomRange] = useState(null); // null = full window

    const [macro, setMacro] = useState(null);
    const [macroLoading, setMacroLoading] = useState(false);
    const [verdict, setVerdict] = useState(null);
    const [verdictLoading, setVerdictLoading] = useState(false);
    const [showPerformance, setShowPerformance] = useState(false);
    const [showWowAndHistory, setShowWowAndHistory] = useState(false);
    const [performance, setPerformance] = useState(null);
    const [performanceLoading, setPerformanceLoading] = useState(false);
    const [perfMode, setPerfMode] = useState('ALL'); // 'ALL' | 'HIGH' | 'VERY_HIGH'
    const [options, setOptions] = useState(null);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [optionsError, setOptionsError] = useState(false);
    const [sentiment, setSentiment] = useState(null);
    const [sentimentLoading, setSentimentLoading] = useState(false);
    const [sentimentError, setSentimentError] = useState(null);

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
        setOptions(null);
        setOptionsError(false);
        setOptionsLoading(true);
        setSentiment(null);
        setSentimentError(null);
        setSentimentLoading(true);
        fetchMacro(asset.assetId, false, lang)
            .then((d) => !cancelled && setMacro(d))
            .catch(() => {})
            .finally(() => !cancelled && setMacroLoading(false));
        fetchVerdict(asset.assetId, false, lang)
            .then((d) => !cancelled && setVerdict(d))
            .catch(() => {})
            .finally(() => !cancelled && setVerdictLoading(false));
        fetchOptions(asset.assetId)
            .then((d) => !cancelled && setOptions(d))
            .catch(() => !cancelled && setOptionsError(true))
            .finally(() => !cancelled && setOptionsLoading(false));
        fetchSentiment(asset.assetId)
            .then((d) => !cancelled && setSentiment(d))
            .catch((e) => !cancelled && setSentimentError(e.message || 'Failed to load sentiment'))
            .finally(() => !cancelled && setSentimentLoading(false));
        return () => { cancelled = true; };
    }, [asset?.assetId, lang]);

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
            // Make sure performance data is available
            let perf = performance;
            if (!perf) {
                try {
                    perf = await fetchVerdictPerformance(asset.assetId);
                    setPerformance(perf);
                } catch (e) { /* noop */ }
            }

            const pdf = new jsPDF('p', 'mm', 'a4');
            const W = pdf.internal.pageSize.getWidth();
            const H = pdf.internal.pageSize.getHeight();
            const M = 12;
            let y = 0;

            // Brand colors
            const BG = [10, 10, 13];
            const PANEL = [14, 14, 20];
            const BORDER = [38, 38, 50];
            const AMBER = [245, 158, 11];
            const GREEN = [52, 211, 153];
            const RED = [251, 113, 133];
            const TEXT = [232, 232, 240];
            const MUTED = [140, 140, 160];

            const setText = (rgb) => pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
            const setFill = (rgb) => pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
            const setDraw = (rgb) => pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);

            const fillPage = () => {
                setFill(BG);
                pdf.rect(0, 0, W, H, 'F');
            };

            const ensurePage = (need) => {
                if (y + need > H - 16) {
                    pdf.addPage();
                    fillPage();
                    y = M + 4; // leave space for the mini-header band drawn in footer pass
                }
            };

            // Rounded panel
            const panel = (x, py, w, h, fill = PANEL, border = BORDER) => {
                setFill(fill);
                setDraw(border);
                pdf.setLineWidth(0.2);
                pdf.roundedRect(x, py, w, h, 3, 3, 'FD');
            };

            // ---------- Page 1: Header + Snapshot ----------
            fillPage();

            // Top header band
            setFill([6, 6, 9]);
            pdf.rect(0, 0, W, 30, 'F');
            // brand stripe
            setFill(AMBER);
            pdf.rect(0, 30, W, 0.6, 'F');

            setText(AMBER);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.text('SPECULATIVE ALPHA', M, 9);
            setText(MUTED);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(6.8);
            pdf.text('INSTITUTIONAL COT INTELLIGENCE', M + 36, 9);

            setText(TEXT);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(20);
            pdf.text(`${snapshot.name} · ${asset.assetId}`, M, 20);
            setText(MUTED);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.text(
                `${snapshot.type.toUpperCase()} · Report ${snapshot.reportDate}`,
                M, 26
            );
            const stamp = new Date().toLocaleString();
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            setText(MUTED);
            pdf.text(`${t('pdf.generated')}: ${stamp}`, W - M, 9, { align: 'right' });
            // Asset CI mini-chip in top-right of header for quick scan
            const headerCI = Number(snapshot.confluenceIndex ?? 0);
            const headerCIColor = headerCI >= 70 ? AMBER : headerCI >= 40 ? [56, 189, 248] : [167, 139, 250];
            setText(headerCIColor);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.text(`CI ${headerCI.toFixed(0)}`, W - M, 22, { align: 'right' });

            y = 38;

            // ---------- Top row: 2 panels (Sentiment | Net Position) ----------
            const colW = (W - M * 2 - 4) / 2;
            const topPanelH = 50;
            const trendForPdf = getTrendAnalysis(snapshot);

            // Sentiment panel
            panel(M, y, colW, topPanelH);
            setText(MUTED);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7.5);
            pdf.text(t('modal.sentiment').toUpperCase(), M + 4, y + 6);
            const tone = trendForPdf.tone;
            const toneColor =
                tone === 'bullish' ? GREEN
                    : tone === 'bearish' ? RED
                        : tone === 'accumulation' ? GREEN
                            : tone === 'distribution' ? RED
                                : AMBER;
            setText(toneColor);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.text(t(trendForPdf.signalKey), M + 4, y + 17);
            setText(MUTED);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.text(`${t('modal.long_term')} ${trendForPdf.longTerm}`, M + 4, y + 25);
            pdf.text(`${t('modal.short_term')} ${trendForPdf.shortTerm}`, M + 4, y + 31);

            // Net Position panel
            const x2 = M + colW + 4;
            panel(x2, y, colW, topPanelH);
            setText(MUTED);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7.5);
            pdf.text(t('modal.net_position').toUpperCase(), x2 + 4, y + 6);
            const netColor = (snapshot.netPosition || 0) >= 0 ? GREEN : RED;
            setText(netColor);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.text(formatSigned(snapshot.netPosition), x2 + 4, y + 17);
            setText(MUTED);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.text(`Δ WoW ${formatSigned(snapshot.wowDelta)}`, x2 + 4, y + 25);
            pdf.text(
                `${t('modal.col.long')} ${formatNumber(snapshot.long)} · ${t('modal.col.short')} ${formatNumber(snapshot.short)}`,
                x2 + 4, y + 31
            );

            y += topPanelH + 6;

            // ---------- Confluence Index Hero (full width) ----------
            const ci = Number(snapshot.confluenceIndex ?? 0);
            const ciDir = String(snapshot.confluenceDirection || 'neutral').toUpperCase();
            const components = snapshot.confluenceComponents || {};
            const missingStreams = snapshot.confluenceMissing || [];
            const ciTier = ci >= 70 ? 'high' : ci >= 40 ? 'mid' : 'low';
            const ciColor = ciTier === 'high' ? AMBER : ciTier === 'mid' ? [56, 189, 248] : [167, 139, 250];
            const ciDirColor = ciDir === 'LONG' ? GREEN : ciDir === 'SHORT' ? RED : MUTED;
            const ciH = 48;
            ensurePage(ciH + 8);
            panel(M, y, W - M * 2, ciH);
            // Label
            setText(MUTED);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7.5);
            pdf.text('CONFLUENCE INDEX', M + 5, y + 6);

            // Big score on the left
            setText(ciColor);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(34);
            pdf.text(`${ci.toFixed(0)}`, M + 5, y + 28);
            setText(MUTED);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            pdf.text('/ 100', M + 5 + (ci >= 10 ? 22 : 14), y + 28);
            // Tier label
            setText(MUTED);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.text(
                ciTier === 'high' ? 'ALTA CONFLUENZA' : ciTier === 'mid' ? 'CONFLUENZA MEDIA' : 'BASSA CONFLUENZA',
                M + 5, y + 34
            );
            // Direction pill at right of score
            const dirX = M + 50;
            setFill(ciDir === 'LONG' ? [10, 36, 24] : ciDir === 'SHORT' ? [42, 14, 22] : [22, 22, 30]);
            setDraw(ciDirColor);
            pdf.setLineWidth(0.2);
            pdf.roundedRect(dirX, y + 18, 26, 9, 2, 2, 'FD');
            setText(ciDirColor);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.text(ciDir, dirX + 13, y + 24.5, { align: 'center' });

            // 3 stream alignment bars on the right side
            const barsX = M + 90;
            const barsW = W - M - barsX - 5;
            const streams = [
                { key: 'nonComm', label: 'NON-COMMERCIAL', v: Number(components.nonComm || 0) },
                { key: 'options', label: 'OPTIONS', v: Number(components.options || 0) },
                { key: 'comm', label: 'COMMERCIAL', v: Number(components.comm || 0) },
            ];
            streams.forEach((s, i) => {
                const sy = y + 9 + i * 11;
                const isMissing = missingStreams.includes(s.key);
                // Label
                setText(MUTED);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(6.8);
                pdf.text(s.label, barsX, sy);
                // Track
                setFill([22, 22, 30]);
                setDraw(BORDER);
                pdf.setLineWidth(0.1);
                pdf.roundedRect(barsX, sy + 1.5, barsW, 4.5, 1.2, 1.2, 'FD');
                // Center line
                setDraw([90, 90, 110]);
                pdf.setLineWidth(0.15);
                pdf.line(barsX + barsW / 2, sy + 1.5, barsX + barsW / 2, sy + 6);
                // Bar fill
                if (!isMissing) {
                    const v = Math.max(-1, Math.min(1, s.v));
                    const half = barsW / 2;
                    const fillW = Math.abs(v) * half;
                    const fillX = v >= 0 ? barsX + half : barsX + half - fillW;
                    setFill(v >= 0 ? GREEN : RED);
                    pdf.rect(fillX, sy + 1.7, fillW, 4.1, 'F');
                    // Value
                    setText(TEXT);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(6.5);
                    pdf.text(
                        (v >= 0 ? '+' : '') + v.toFixed(2),
                        barsX + barsW, sy, { align: 'right' }
                    );
                } else {
                    setText(MUTED);
                    pdf.setFont('helvetica', 'italic');
                    pdf.setFontSize(6.2);
                    pdf.text('n/d', barsX + barsW, sy, { align: 'right' });
                }
            });

            y += ciH + 6;

            // ---------- Macro Sentiment (full width, dynamic height incl. events) ----------
            const eventsList = (macro?.events || []).slice(0, 5);
            const summaryText = macro?.summary || t('modal.macro_loading');
            const summaryLines = pdf.splitTextToSize(summaryText, W - M * 2 - 8);
            const summaryRowH = summaryLines.length * 4;

            // Pre-compute each event's wrapped label height so the panel grows correctly.
            const evColX = {
                country: M + 4,
                stars:   M + 14,
                date:    M + 25,
                event:   M + 46,
            };
            const evRightPad = 32; // reserve for "prev xxx" right-aligned column
            const evMaxW = W - M - evRightPad - evColX.event;
            const eventsRows = eventsList.map((e) => {
                const lines = pdf.splitTextToSize(String(e.event || ''), evMaxW);
                const wrapped = lines.length > 2 ? lines.slice(0, 2) : lines; // cap at 2 lines
                return { e, lines: wrapped, h: Math.max(4, wrapped.length * 3.6) };
            });
            const eventsRowH = eventsRows.length > 0
                ? (eventsRows.reduce((s, r) => s + r.h, 0) + 8)
                : 0;
            const macroH = Math.max(28, 14 + summaryRowH + eventsRowH);
            ensurePage(macroH + 6);
            panel(M, y, W - M * 2, macroH);
            setText([56, 189, 248]); // sky-400
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            const macroTitle = `${t('modal.macro_sentiment').toUpperCase()}  ·  ${(macro?.eventCount ?? 0)} ${t('modal.events').toUpperCase()}`;
            pdf.text(macroTitle, M + 4, y + 6);
            setText(TEXT);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.text(summaryLines, M + 4, y + 12, { lineHeightFactor: 1.35 });

            // Render up to 5 macro events with wrapped labels
            if (eventsRows.length > 0) {
                let evY = y + 14 + summaryRowH;
                setDraw(BORDER);
                pdf.setLineWidth(0.15);
                pdf.line(M + 4, evY - 2, W - M - 4, evY - 2);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7.5);
                eventsRows.forEach(({ e, lines, h }) => {
                    setText([56, 189, 248]);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(String(e.country || '—').slice(0, 4), evColX.country, evY + 2);
                    // Stars based on impact (2 or 3)
                    const stars = Math.max(0, Math.min(3, Number(e.impact || 0)));
                    if (stars > 0) {
                        setText(AMBER);
                        pdf.setFont('helvetica', 'bold');
                        const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);
                        pdf.text(starStr, evColX.stars, evY + 2);
                    }
                    setText(MUTED);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(String(e.date || ''), evColX.date, evY + 2);
                    setText(TEXT);
                    pdf.text(lines, evColX.event, evY + 2, { lineHeightFactor: 1.25 });
                    if (e.previous) {
                        setText(MUTED);
                        pdf.text(`prev ${e.previous}`, W - M - 4, evY + 2, { align: 'right' });
                    }
                    evY += h;
                });
            }
            y += macroH + 6;

            // ---------- Final Verdict ----------
            ensurePage(46);
            const verdictH = 42;
            panel(M, y, W - M * 2, verdictH);
            setText(AMBER);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.text(t('modal.final_verdict').toUpperCase(), M + 4, y + 6);
            const verdictColor =
                verdict?.verdict === 'LONG' ? GREEN
                    : verdict?.verdict === 'SHORT' ? RED
                        : AMBER;
            setText(verdictColor);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(22);
            pdf.text(verdict?.verdict || '—', M + 4, y + 18);
            setText(MUTED);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.text(`${t('modal.confidence')} ${verdict?.confidence ?? '—'}/5`, M + 36, y + 18);
            if (verdict?.entryReportDate) {
                pdf.text(`${t('modal.report_label')} ${verdict.entryReportDate}`, M + 60, y + 18);
            }
            setText(TEXT);
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(9);
            const vl = pdf.splitTextToSize(verdict?.summary || '—', W - M * 2 - 8);
            pdf.text(vl.slice(0, 5), M + 4, y + 26);
            y += verdictH + 8;

            // ---------- COT History table ----------
            ensurePage(50);
            setText(TEXT);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.text(t('modal.history_table'), M, y);
            setText(MUTED);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.text(t('modal.history_subtitle'), M, y + 4);
            y += 7;
            if (history && history.length) {
                autoTable(pdf, {
                    startY: y,
                    margin: { left: M, right: M, top: 14 },
                    theme: 'plain',
                    styles: {
                        fontSize: 8,
                        textColor: TEXT,
                        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
                        fillColor: PANEL,
                        lineColor: BORDER,
                        lineWidth: 0.05,
                    },
                    headStyles: {
                        fillColor: [6, 6, 9],
                        textColor: AMBER,
                        fontStyle: 'bold',
                        fontSize: 7.5,
                    },
                    alternateRowStyles: { fillColor: [16, 16, 22] },
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
                    didParseCell: (data) => {
                        if (data.section === 'body' && data.column.index === 4) {
                            const v = parseFloat(String(data.cell.text[0]).replace(/[+,]/g, ''));
                            data.cell.styles.textColor = v >= 0 ? GREEN : RED;
                            data.cell.styles.fontStyle = 'bold';
                        }
                    },
                });
                y = pdf.lastAutoTable.finalY + 8;

                // ---------- Net Position historical sparkline (native SVG-style line) ----------
                ensurePage(56);
                const histSeries = [...history].slice(0, 26).reverse(); // oldest -> newest
                const cw = W - M * 2;
                const ch = 46; // taller to host the x-axis labels
                panel(M, y, cw, ch);
                setText(MUTED);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7);
                pdf.text(t('modal.chart_title').toUpperCase() + ' · NET POSITION', M + 4, y + 5);
                setText(TEXT);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                const lastNet = histSeries[histSeries.length - 1]?.netPosition ?? 0;
                pdf.text(formatSigned(lastNet), M + cw - 4, y + 5, { align: 'right' });

                if (histSeries.length > 1) {
                    const nets = histSeries.map((h) => h.netPosition || 0);
                    const minV = Math.min(0, ...nets);
                    const maxV = Math.max(0, ...nets);
                    const range = Math.max(1, maxV - minV);
                    // Reserve 6mm at the bottom for the x-axis labels
                    const axisYOffset = 6;
                    const plotBottom = y + ch - axisYOffset - 2;
                    const plotTop = y + 10;
                    const plotH = plotBottom - plotTop;
                    const px = (i) => M + 4 + (i / (nets.length - 1)) * (cw - 8);
                    const py = (v) => plotBottom - ((v - minV) / range) * plotH;
                    // Zero line
                    setDraw(BORDER);
                    pdf.setLineWidth(0.15);
                    pdf.line(M + 4, py(0), M + cw - 4, py(0));
                    // Series line
                    setDraw(AMBER);
                    pdf.setLineWidth(0.5);
                    for (let i = 1; i < nets.length; i++) {
                        pdf.line(px(i - 1), py(nets[i - 1]), px(i), py(nets[i]));
                    }
                    // X-axis baseline
                    setDraw([60, 60, 80]);
                    pdf.setLineWidth(0.2);
                    pdf.line(M + 4, plotBottom + 1, M + cw - 4, plotBottom + 1);
                    // X-axis tick labels (~6 labels evenly spaced; format MM-DD)
                    setText(MUTED);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(6.4);
                    const tickCount = Math.min(6, histSeries.length);
                    for (let k = 0; k < tickCount; k++) {
                        const idx = Math.round((k / (tickCount - 1)) * (histSeries.length - 1));
                        const labelRaw = String(histSeries[idx]?.date || '');
                        // Use MM-DD for compactness
                        const labelShort = labelRaw.length >= 10 ? labelRaw.slice(5) : labelRaw;
                        const align = k === 0 ? 'left' : k === tickCount - 1 ? 'right' : 'center';
                        pdf.text(labelShort, px(idx), plotBottom + 5, { align });
                    }
                }
                y += ch + 6;

                // ---------- Δ WoW Recent bar sparkline ----------
                ensurePage(46);
                const dw = W - M * 2;
                const dh = 36;
                panel(M, y, dw, dh);
                setText(MUTED);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7);
                pdf.text(t('modal.delta_recent').toUpperCase() + ' · ' + t('modal.delta_subtitle'), M + 4, y + 5);

                const deltas = histSeries.slice(-12).map((h) => h.wowDelta || 0);
                if (deltas.length) {
                    const absMax = Math.max(1, ...deltas.map((d) => Math.abs(d)));
                    const barW = (dw - 12) / deltas.length - 1;
                    const cy = y + dh / 2 + 2;
                    setDraw(BORDER);
                    pdf.setLineWidth(0.15);
                    pdf.line(M + 4, cy, M + dw - 4, cy);
                    deltas.forEach((d, i) => {
                        const bx = M + 6 + i * (barW + 1);
                        const bh = ((Math.abs(d) / absMax) * (dh / 2 - 4));
                        if (d >= 0) {
                            setFill(GREEN);
                            pdf.rect(bx, cy - bh, barW, bh, 'F');
                        } else {
                            setFill(RED);
                            pdf.rect(bx, cy, barW, bh, 'F');
                        }
                    });
                }
                y += dh + 8;
            }

            // ---------- Signal Accuracy Panel ----------
            ensurePage(95);
            setText(TEXT);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.text(t('modal.perf_title'), M, y);
            y += 6;

            if (perf && perf.bands) {
                // Render two blocks: ALL signals and HIGH-confluence, each with 24w + 52w windows
                const bandsToRender = [
                    { key: 'ALL', label: 'TUTTI I SEGNALI' },
                    { key: 'HIGH', label: 'CONFLUENCE INDEX ≥ 60' },
                ];
                const windowsToRender = [
                    { key: 'window24w', label: t('modal.perf.window_12w') || '24w' },
                    { key: 'window52w', label: t('modal.perf.window_24w') || '52w' },
                ];

                for (const band of bandsToRender) {
                    ensurePage(45);
                    setText(AMBER);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(9);
                    pdf.text(band.label, M, y);
                    y += 4;

                    const cardW = (W - M * 2 - 4) / 2;
                    const cardH = 32;
                    for (let i = 0; i < windowsToRender.length; i++) {
                        const win = windowsToRender[i];
                        const m = perf.bands[band.key]?.[win.key];
                        const cx = M + i * (cardW + 4);
                        panel(cx, y, cardW, cardH);
                        setText(MUTED);
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(6.5);
                        pdf.text(win.label.toUpperCase(), cx + 3, y + 4);

                        if (!m || m.total === 0) {
                            setText(MUTED);
                            pdf.setFont('helvetica', 'italic');
                            pdf.setFontSize(8);
                            pdf.text(t('modal.perf.no_signals'), cx + 3, y + 14);
                            continue;
                        }

                        const acc = m.accuracy ?? 0;
                        const accColor = acc >= 55 ? GREEN : acc >= 50 ? AMBER : RED;
                        setText(accColor);
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(18);
                        pdf.text(`${acc}%`, cx + 3, y + 14);
                        setText(MUTED);
                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(7);
                        pdf.text(t('modal.perf.accuracy'), cx + 3, y + 18);

                        setText(TEXT);
                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(7);
                        const statsX = cx + cardW / 2 + 2;
                        pdf.text(`${t('modal.perf.respected')}: ${m.respected}`, statsX, y + 8);
                        pdf.text(`${t('modal.perf.not_respected')}: ${m.notRespected}`, statsX, y + 12);
                        pdf.text(`${t('modal.perf.skipped')}: ${m.skipped}`, statsX, y + 16);
                        if (m.avgFavorableRangePct != null) {
                            setText(GREEN);
                            pdf.text(`Fav: +${m.avgFavorableRangePct}%`, statsX, y + 22);
                        }
                        if (m.avgAdverseRangePct != null) {
                            setText(RED);
                            pdf.text(`Adv: ${m.avgAdverseRangePct}%`, statsX, y + 26);
                        }
                    }
                    y += cardH + 5;
                }

                // History table — show CI + direction + range
                ensurePage(60);
                setText(MUTED);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7);
                pdf.text(t('modal.perf.history_title').toUpperCase(), M, y);
                y += 2;
                autoTable(pdf, {
                    startY: y + 1,
                    margin: { left: M, right: M, top: 14 },
                    theme: 'plain',
                    styles: {
                        fontSize: 8,
                        textColor: TEXT,
                        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
                        fillColor: PANEL,
                        lineColor: BORDER,
                        lineWidth: 0.05,
                    },
                    headStyles: {
                        fillColor: [6, 6, 9],
                        textColor: AMBER,
                        fontStyle: 'bold',
                        fontSize: 7.5,
                    },
                    alternateRowStyles: { fillColor: [16, 16, 22] },
                    head: [[
                        t('modal.perf.col.report'),
                        'CI',
                        'DIR',
                        t('modal.perf.col.range'),
                    ]],
                    body: (perf.history || []).slice(0, 15).map((r) => {
                        const ci = r.confluenceIndex;
                        const dir = (r.direction || 'neutral').toUpperCase();
                        const resp = r.respected;
                        let rangeStr = '—';
                        if (r.weekRangePct != null) {
                            if (resp === true) rangeStr = `+${r.weekRangePct.toFixed(2)}%`;
                            else if (resp === false) rangeStr = `-${r.weekRangePct.toFixed(2)}%`;
                            else rangeStr = `${r.weekRangePct.toFixed(2)}%`;
                        }
                        return [
                            r.reportDate || '—',
                            ci != null ? ci.toFixed(0) : '—',
                            dir,
                            rangeStr,
                        ];
                    }),
                    didParseCell: (data) => {
                        if (data.section !== 'body') return;
                        if (data.column.index === 2) {
                            const v = data.cell.text[0];
                            if (v === 'LONG') data.cell.styles.textColor = GREEN;
                            else if (v === 'SHORT') data.cell.styles.textColor = RED;
                            else data.cell.styles.textColor = MUTED;
                            data.cell.styles.fontStyle = 'bold';
                        }
                        if (data.column.index === 3) {
                            const v = data.cell.text[0];
                            if (v && v.startsWith('+')) data.cell.styles.textColor = GREEN;
                            else if (v && v.startsWith('-')) data.cell.styles.textColor = RED;
                            data.cell.styles.fontStyle = 'bold';
                        }
                    },
                });
                y = pdf.lastAutoTable.finalY + 6;
            }

            // ---------- Footer (every page, NO bg overwrite — just header band + page nr) ----------
            const totalPages = pdf.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);
                if (i > 1) {
                    // top mini-header band (drawn last, but small enough not to hide existing content)
                    setFill([6, 6, 9]);
                    pdf.rect(0, 0, W, 10, 'F');
                    setText(AMBER);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(7);
                    pdf.text('SPECULATIVE ALPHA', M, 6);
                    setText(MUTED);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`${asset.assetId} · ${snapshot.reportDate || ''}`, W - M, 6, { align: 'right' });
                }
                setText(MUTED);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7);
                pdf.text(t('pdf.footer'), M, H - 5);
                pdf.text(`${i} / ${totalPages}`, W - M, H - 5, { align: 'right' });
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
                        {/* Top metrics — 2 panels (Sentiment | Net Position) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                <LockedContent locked={locked} onUnlock={onUnlock} minHeight={120}>
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
                                                {macro.events.slice(0, 6).map((e, i) => {
                                                    const stars = '★'.repeat(Math.min(3, Math.max(1, Number(e.impact || e.importance || 0))));
                                                    const starColor = (Number(e.impact || e.importance || 0)) >= 3 ? 'text-[#fb7185]' : 'text-amber-400';
                                                    return (
                                                        <div key={i} className="flex items-center gap-2 text-[12px] font-mono">
                                                            <span className={cn('font-bold w-8 text-center', starColor)} title={`${e.impact || e.importance || 0}★`}>{stars}</span>
                                                            <span className="text-sky-400 font-bold w-8">{e.country}</span>
                                                            <span className="text-gray-500 w-20">{e.date}</span>
                                                            <span className="text-gray-200 flex-1 truncate" title={e.event || e.title}>{e.event || e.title || '—'}</span>
                                                            {e.previous && (
                                                                <span className="text-gray-500">prev {e.previous}</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}
                                </LockedContent>
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
                                <LockedContent locked={locked} onUnlock={onUnlock} minHeight={120}>
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
                                </LockedContent>
                            </div>
                        </div>

                        {/* Options & GEX panel — sits above the historical chart */}
                        {locked ? (
                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <Activity size={14} className="text-violet-400" />
                                    <span className="text-[11px] tracking-[0.28em] uppercase text-violet-300 font-bold">
                                        Opzioni · GEX
                                    </span>
                                </div>
                                <LockedContent locked={locked} onUnlock={onUnlock} minHeight={160}>
                                    <OptionsPanel data={options} loading={optionsLoading} error={optionsError} supported={true} />
                                </LockedContent>
                            </div>
                        ) : (
                            (optionsLoading || options || optionsError) && (
                                <OptionsPanel
                                    data={options}
                                    loading={optionsLoading}
                                    error={optionsError}
                                    supported={true}
                                />
                            )
                        )}

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
                                </div>
                                {!locked && (
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
                                )}
                            </div>

                            <LockedContent locked={locked} onUnlock={onUnlock} minHeight={420}>
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
                            </LockedContent>
                        </div>

                        {/* WoW delta bar chart + table — collapsible (closed by default) */}
                        <div className="bg-[#0e0e14] border border-white/[0.07] rounded-2xl overflow-hidden">
                            <button
                                data-testid="toggle-wow-history-btn"
                                onClick={() => setShowWowAndHistory((v) => !v)}
                                className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-[#14141c] transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {showWowAndHistory ? (
                                        <EyeOff size={15} className="text-amber-400" />
                                    ) : (
                                        <Eye size={15} className="text-amber-400" />
                                    )}
                                    <h3 className="font-display text-base font-bold text-white">
                                        Δ WoW + Storico Posizioni
                                    </h3>
                                </div>
                                <span className="text-[11px] tracking-widest uppercase text-amber-300 font-semibold">
                                    {showWowAndHistory ? t('modal.hide') : t('modal.show')}
                                </span>
                            </button>
                            {showWowAndHistory && (
                                <div className="px-5 pb-5 pt-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <LockedContent locked={locked} onUnlock={onUnlock} minHeight={280}>
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
                            </LockedContent>
                                </div>
                            )}
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
                                    <LockedContent locked={locked} onUnlock={onUnlock} minHeight={200}>
                                    <p className="text-[12px] text-amber-300/70 mb-4 leading-relaxed bg-amber-500/[0.04] border border-amber-500/15 rounded-xl px-3 py-2">
                                        {t('modal.perf_synth_note')}
                                    </p>
                                    {performanceLoading ? (
                                        <div className="flex items-center gap-2 text-gray-500 text-[13px]">
                                            <RefreshCw size={14} className="animate-spin text-amber-400/60" />
                                            {t('modal.perf_loading')}
                                        </div>
                                    ) : performance && performance.bands ? (
                                        <>
                                            {/* Band toggle: ALL / HIGH / VERY_HIGH */}
                                            <div className="flex gap-2 mb-2">
                                                {[
                                                    { key: 'ALL', label: 'TUTTI' },
                                                    { key: 'HIGH', label: 'HIGH ≥60' },
                                                    { key: 'VERY_HIGH', label: 'VERY HIGH ≥80' },
                                                ].map(({ key, label }) => (
                                                    <button
                                                        key={key}
                                                        data-testid={`band-${key.toLowerCase()}-btn`}
                                                        onClick={() => setPerfMode(key)}
                                                        className={cn(
                                                            'flex-1 px-3 py-2 rounded-xl text-[11px] font-semibold uppercase tracking-wider transition-all',
                                                            perfMode === key
                                                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                                                                : 'bg-black/30 text-gray-500 border border-white/5 hover:text-gray-300'
                                                        )}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[11px] text-gray-600 italic mb-4">
                                                {(performance.bands[perfMode] || performance.bands.ALL)?.description}
                                            </p>

                                            {/* Two windows side by side */}
                                            <div className="grid md:grid-cols-2 gap-3 mb-5">
                                                {[
                                                    { key: 'window24w', title: '24 SETTIMANE' },
                                                    { key: 'window52w', title: '52 SETTIMANE' },
                                                ].map(({ key, title }) => {
                                                    const band = performance.bands[perfMode] || performance.bands.ALL;
                                                    const m = band?.[key];
                                                    if (!m || m.total === 0) {
                                                        return (
                                                            <div key={key} className="bg-black/30 border border-white/5 rounded-2xl p-4">
                                                                <div className="text-[10px] tracking-widest uppercase text-gray-500 font-semibold mb-2">
                                                                    {title}
                                                                </div>
                                                                <div className="text-[12px] text-gray-500 italic">
                                                                    {t('modal.perf.no_signals')}
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    const acc = m.accuracy ?? 0;
                                                    const accColor =
                                                        acc >= 55 ? 'text-[#34d399]' : acc >= 50 ? 'text-amber-300' : 'text-[#fb7185]';
                                                    const denom = m.respected + m.notRespected || 1;
                                                    const respPct = (m.respected / denom) * 100;
                                                    return (
                                                        <div
                                                            key={key}
                                                            data-testid={`window-${key}`}
                                                            className="bg-black/30 border border-white/5 rounded-2xl p-4"
                                                        >
                                                            <div className="text-[10px] tracking-widest uppercase text-gray-500 font-semibold mb-3">
                                                                {title}
                                                            </div>
                                                            <div className="mb-3">
                                                                <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-0.5">
                                                                    {t('modal.perf.accuracy')}
                                                                </div>
                                                                <div className={cn('text-[32px] font-bold font-mono tnum leading-none', accColor)}>
                                                                    {acc != null ? `${acc}%` : '—'}
                                                                </div>
                                                            </div>
                                                            <div className="flex h-2 rounded-full overflow-hidden mb-3 bg-black/40">
                                                                {m.respected > 0 && (
                                                                    <div className="bg-[#34d399]" style={{ width: `${respPct}%` }} />
                                                                )}
                                                                {m.notRespected > 0 && (
                                                                    <div className="bg-[#fb7185]" style={{ width: `${100 - respPct}%` }} />
                                                                )}
                                                            </div>
                                                            <div className="space-y-1.5 text-[12px]">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">{t('modal.perf.respected')}</span>
                                                                    <span className="font-mono text-[#34d399] font-semibold">{m.respected}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">{t('modal.perf.not_respected')}</span>
                                                                    <span className="font-mono text-[#fb7185] font-semibold">{m.notRespected}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">{t('modal.perf.skipped')}</span>
                                                                    <span className="font-mono text-gray-500">{m.skipped}</span>
                                                                </div>
                                                                <div className="flex justify-between pt-1.5 border-t border-white/5 mt-1.5">
                                                                    <span className="text-gray-400">{t('modal.perf.avg_fav_range')}</span>
                                                                    <span className="font-mono text-[#34d399]/85 font-semibold">
                                                                        {m.avgFavorableRangePct != null ? `+${m.avgFavorableRangePct}%` : '—'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">{t('modal.perf.avg_adv_range')}</span>
                                                                    <span className="font-mono text-[#fb7185]/85 font-semibold">
                                                                        {m.avgAdverseRangePct != null ? `${m.avgAdverseRangePct}%` : '—'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* History table */}
                                            {performance.history && performance.history.length > 0 ? (
                                                <>
                                                    <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500 font-semibold mb-2">
                                                        {t('modal.perf.history_title')}
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-[12.5px]">
                                                            <thead>
                                                                <tr className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold border-b border-white/5">
                                                                    <th className="px-2 py-2 text-left">{t('modal.perf.col.report')}</th>
                                                                    <th className="px-2 py-2 text-right">CI</th>
                                                                    <th className="px-2 py-2 text-left">DIR</th>
                                                                    <th className="px-2 py-2 text-right">OUTCOME</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="font-mono">
                                                                {performance.history.slice(0, 20).map((r, i) => {
                                                                    const ci = r.confluenceIndex;
                                                                    const dir = (r.direction || 'neutral').toUpperCase();
                                                                    const respected = r.respected;
                                                                    const rangeVal = r.weekRangePct;
                                                                    // OUTCOME: respected=true → green ✓ +X%; respected=false → red ✗ -X%
                                                                    let outcomeDisplay = '—';
                                                                    let outcomeColor = 'text-gray-500';
                                                                    if (rangeVal != null && respected != null) {
                                                                        const sign = respected ? '+' : '-';
                                                                        const icon = respected ? '✓' : '✗';
                                                                        outcomeDisplay = `${icon} ${sign}${rangeVal.toFixed(2)}%`;
                                                                        outcomeColor = respected ? 'text-[#34d399]' : 'text-[#fb7185]';
                                                                    } else if (rangeVal != null) {
                                                                        outcomeDisplay = `${rangeVal.toFixed(2)}%`;
                                                                        outcomeColor = 'text-gray-400';
                                                                    }
                                                                    const ciColor =
                                                                        ci >= 80 ? 'text-amber-200' :
                                                                        ci >= 60 ? 'text-amber-300' :
                                                                        ci >= 40 ? 'text-gray-200' :
                                                                        'text-gray-500';
                                                                    return (
                                                                        <tr
                                                                            key={i}
                                                                            className={cn(
                                                                                'border-b border-white/[0.04]',
                                                                                i % 2 === 1 && 'bg-white/[0.02]'
                                                                            )}
                                                                        >
                                                                            <td className="px-2 py-2 text-gray-200">{r.reportDate}</td>
                                                                            <td className={cn('px-2 py-2 text-right font-semibold', ciColor)}>
                                                                                {ci != null ? ci.toFixed(0) : '—'}
                                                                            </td>
                                                                            <td className={cn(
                                                                                'px-2 py-2 font-semibold',
                                                                                dir === 'LONG' && 'text-[#34d399]',
                                                                                dir === 'SHORT' && 'text-[#fb7185]',
                                                                                dir === 'NEUTRAL' && 'text-gray-500'
                                                                            )}>
                                                                                {dir}
                                                                            </td>
                                                                            <td className={cn('px-2 py-2 text-right font-semibold', outcomeColor)}>
                                                                                {outcomeDisplay}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
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
                                    </LockedContent>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
