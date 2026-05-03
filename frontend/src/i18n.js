import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'spec-alpha-lang';

function detectLang() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'it' || stored === 'en') return stored;
    } catch {}
    try {
        const langs = (navigator.languages && navigator.languages.length
            ? navigator.languages
            : [navigator.language || 'en']);
        for (const l of langs) {
            const code = String(l || '').toLowerCase();
            if (code.startsWith('it')) return 'it';
            if (code.startsWith('en')) return 'en';
        }
    } catch {}
    return 'en';
}

// Dizionari. Le chiavi finanziarie comuni (Long, Short, Net Position, Δ WoW, OI Share,
// Equity, Win Rate, Cumulative P/L, Refresh, Bullish, Bearish, ecc.) restano identiche
// in entrambe le lingue perché sono termini standard del trading.
const STR = {
    it: {
        // Header / App
        'app.tagline': 'Institutional COT Intelligence',
        'app.section.kicker': 'Mercati Istituzionali',
        'app.section.title': 'Posizionamento Non-Commercial',
        'app.refresh': 'Refresh',
        'app.guide': 'Guide',
        'app.favorites': 'Favorites',
        'app.scope.core': 'Core',
        'app.scope.all': 'All',
        'app.next_sync': 'Next sync:',
        'app.error': 'Errore nel caricamento dati. Riprova fra qualche istante.',
        'app.empty.fav': 'Nessun asset preferito. Clicca sulla stella per aggiungerne.',
        'app.empty.data': 'Nessun dato disponibile.',
        'app.pending.sync': 'Sync flussi…',
        'app.footer.title': 'Data Source · Tradingster (CFTC Legacy Futures)',
        'app.footer.body':
            'Tutti i dati sono estratti dai report ufficiali CFTC Commitment of Traders. Aggiornamento automatico ogni sabato.',

        // AssetCard
        'card.analysis': 'Institutional Analysis',
        'card.sync_flows': 'Sincronizzazione flussi…',
        'card.oi_share': 'OI Share',
        'card.intensity': 'Intensity',
        'card.oi_tooltip_label': "Cos'è OI Share",
        'card.oi_tooltip_html':
            'OI Share = % di Open Interest detenuto dai grandi speculatori (Long + Short Non-Commercial). Più alto è il valore, più il mercato è guidato dai flussi istituzionali e meno dai commerciali. Sopra il 50% indica dominanza speculativa: trend più direzionali ma anche più sensibili a unwinding e squeeze.',

        // AssetDetailModal
        'modal.report': 'Report',
        'modal.pdf': 'PDF',
        'modal.exporting': 'Export…',
        'modal.sentiment': 'Sentiment Globale',
        'modal.long_term': 'Long-term:',
        'modal.short_term': 'Short-term:',
        'modal.net_position': 'Net Position',
        'modal.macro_intel': 'Macro Intelligence',
        'modal.macro_sentiment': 'Macro Sentiment · Last 7 days',
        'modal.events': 'events',
        'modal.macro_loading': 'Analisi macro da tradingeconomics…',
        'modal.final_verdict': 'Final Verdict',
        'modal.confidence': 'conf',
        'modal.verdict_loading': 'Generazione verdetto…',
        'modal.verdict_unavailable': 'Verdetto non disponibile.',
        'modal.entry': 'Entry:',
        'modal.report_label': 'Report:',
        'modal.chart_title': 'Grafico Storico',
        'modal.chart_subtitle': 'Net · Long · Short · Prezzo Non-Commercial',
        'modal.chart_loading': 'Caricamento serie storica…',
        'modal.chart_unavailable': 'Storico non disponibile',
        'modal.delta_recent': 'Δ WoW Recente',
        'modal.delta_subtitle': 'Variazione Settimanale Net Position',
        'modal.history_table': 'Tabella Storica',
        'modal.history_subtitle': 'Ultimi 8 Report Pubblicati',
        'modal.col.date': 'Date',
        'modal.col.long': 'Long',
        'modal.col.short': 'Short',
        'modal.col.net': 'Net',
        'modal.col.delta': 'Δ WoW',
        'modal.perf_title': 'Performance Verdetti Precedenti',
        'modal.show': 'Mostra',
        'modal.hide': 'Nascondi',
        'modal.perf_logic':
            'Logica: entry = close di lunedì · exit = close di venerdì della stessa settimana (prezzi daily da Yahoo Finance).',
        'modal.perf_synth_note':
            'Nota: i verdetti sono ricostruiti da una regola sintetica deterministica (segui il Δ WoW). Su orizzonte di una settimana il COT funziona spesso come indicatore contrarian agli estremi: un win-rate basso non sorprende. La logica live (con AI + macro + price action) tende a essere più affidabile dei backfill puramente meccanici.',
        'modal.perf_loading': 'Calcolo performance…',
        'modal.perf.total': 'Total',
        'modal.perf.evaluated': 'Valutati',
        'modal.perf.win': 'Win',
        'modal.perf.loss': 'Loss',
        'modal.perf.winrate': 'Win rate',
        'modal.perf.cumulative': 'Cumulative P/L %',
        'modal.perf.equity_label': (n) => `Equity Curve · ultimi ${n} verdetti`,
        'modal.perf.last5': 'Ultimi 5 verdetti',
        'modal.perf.col.report': 'Report',
        'modal.perf.col.verdict': 'Verdetto',
        'modal.perf.col.entry_date': 'Entry (Lun)',
        'modal.perf.col.entry_price': 'Price',
        'modal.perf.col.exit_date': 'Exit (Ven)',
        'modal.perf.col.exit_price': 'Price',
        'modal.perf.col.pnl': 'P/L %',
        'modal.perf.col.outcome': 'Outcome',
        'modal.perf.empty':
            'Nessuno storico disponibile. Apri questo asset nei prossimi report per accumulare verdetti valutabili.',

        // HelpModal
        'help.kb': 'Knowledge Base',
        'help.title': 'Guida ai Concetti COT',
        'help.s.net.title': 'Net Position (Posizionamento Netto)',
        'help.s.net.body':
            'La Net Position è la differenza fra contratti Long e Short detenuti dai grandi speculatori (Hedge Funds, CTA, Asset Manager). Net positiva = bias rialzista istituzionale. Net negativa = bias ribassista. Più alto è il valore assoluto, più convinto è il posizionamento.',
        'help.s.delta.title': 'Δ WoW — Variazione Settimanale',
        'help.s.delta.body':
            'Il Delta misura la velocità del cambiamento. Anche se la Net è negativa, un Delta positivo indica che gli istituzionali iniziano ad accumulare. È il segnale più rapido di rotazione dei flussi prima che si rifletta nel prezzo.',
        'help.s.ls.title': 'Long, Short e le loro variazioni',
        'help.s.ls.body':
            'Le card mostrano i contratti assoluti Long e Short e la loro variazione settimanale singola. Un calo di Short con Long stabili indica copertura/short squeeze; un aumento di Long con Short fermi indica vero accumulo direzionale.',
        'help.s.oi.title': 'OI Share — Open Interest Share',
        'help.s.oi.body':
            "L'Open Interest è il totale dei contratti aperti sul mercato. L'OI Share Non-Commercial è la percentuale di Open Interest controllata dai grandi speculatori (Long + Short). Sopra 50% = mercato dominato dagli speculativi: i trend possono essere più direzionali ma più vulnerabili a unwinding forzati. Sotto 30% = mercato guidato dagli operatori commerciali (hedger), trend più lenti e strutturali.",
        'help.s.intensity.title': 'Intensity Index (0-100)',
        'help.s.intensity.body':
            "L'Intensity Index è una misura sintetica della convinzione direzionale degli Non-Commercial, ottenuta normalizzando la Net Position sul totale delle posizioni speculative. 50 = posizionamento neutro (long ≈ short); valori > 70 = forte bias rialzista istituzionale; valori < 30 = forte bias ribassista. Valori estremi (> 85 o < 15) segnalano crowded trade: attenzione a unwinding o squeeze.",
        'help.s.fx.title': 'Forex Strength Index',
        'help.s.fx.body':
            'Confronta la forza assoluta di tutte le valute vs USD basandosi sui flussi Non-Commercial. Identifica automaticamente: la valuta più forte, la più debole, le opportunità su pair forex (es. EUR forte + JPY debole → EURJPY long) e i trend assoluti dove momentum e posizionamento si confermano.',
        'help.s.div.title': 'Divergenze e Setup Operativi',
        'help.s.div.body':
            'Quando il prezzo scende ma il Delta è positivo si parla di Accumulazione: le mani forti comprano debolezza. Quando il prezzo sale ma il Delta è negativo si parla di Distribuzione: i pro escono, attenzione ai topping pattern.',
        'help.s.refresh.title': 'Refresh — Aggiornamento Dati',
        'help.s.refresh.body':
            'I report COT sono pubblicati dalla CFTC ogni venerdì sera (con dati al martedì precedente). Il dashboard si aggiorna automaticamente ogni sabato 22:00 UTC. Premi il pulsante Refresh per forzare un aggiornamento manuale.',

        // HeatmapStrip
        'heat.kicker': 'Mappa dei Mercati',
        'heat.title': 'Heatmap Net Position Globale',
        'heat.body':
            "Quadro d'insieme di tutti gli strumenti monitorati: intensità del colore proporzionale alla forza del posizionamento istituzionale.",

        // CurrencyStrengthIndex
        'fx.kicker': 'Forex Strength Index',
        'fx.title': 'Forza Assoluta delle Valute',
        'fx.body':
            'Posizionamento Net Non-Commercial di ogni valuta vs USD. Ranking dal più forte al più debole, con tutte le opportunità di pair forex con divergenza significativa o momentum settimanale > 50%.',
        'fx.strongest': 'Valuta più forte',
        'fx.weakest': 'Valuta più debole',
        'fx.macro': 'Analisi Macro',
        'fx.opportunities': 'Opportunità Pair Forex (Divergenze + Momentum)',
        'fx.trends': 'Trend Assoluti Rilevanti',
        'fx.idea': 'Idea',
        'fx.score_gap': 'Score gap',
        'fx.momentum': 'Momentum',
        'fx.synth': 'Synth',
        'fx.aligned': (positive) =>
            `Trend ${positive ? 'long' : 'short'} confermato dal momentum WoW.`,
        'fx.unaligned': 'Possibile inversione: posizione assoluta forte ma momentum opposto.',
        'fx.dominance.extreme': 'estrema',
        'fx.dominance.strong': 'forte',
        'fx.dominance.moderate': 'moderata',
        'fx.narrative.aligned': (s, w) =>
            `Momentum settimanale conferma la divergenza: ${s} continua ad accumulare flussi long, ${w} viene ulteriormente venduto.`,
        'fx.narrative.reversing': (s, w) =>
            `Attenzione: il momentum è in inversione (${s} perde flussi, ${w} viene ricoperto). Possibile rotazione in atto.`,
        'fx.narrative.mixed':
            'Momentum misto: monitorare il prossimo report COT per conferme prima di operare.',
        'fx.narrative.summary': (sName, sNet, wName, wNet, dom, mom) =>
            `${sName} è la valuta più forte secondo i flussi Non-Commercial (Net ${sNet}); ${wName} è la più debole (Net ${wNet}). Dominanza relativa ${dom}. ${mom}`,
        'fx.ccy.EUR': 'Euro',
        'fx.ccy.GBP': 'Sterlina',
        'fx.ccy.JPY': 'Yen Giapponese',
        'fx.ccy.AUD': 'Dollaro Australiano',
        'fx.ccy.CAD': 'Dollaro Canadese',
        'fx.ccy.CHF': 'Franco Svizzero',
        'fx.ccy.NZD': 'Dollaro Neozelandese',
        'fx.ccy.USD': 'Dollaro USA (sintetico)',

        // Trend signals (utils.js)
        'trend.bullish': 'BULLISH',
        'trend.bearish': 'BEARISH',
        'trend.accumulation': 'ACCUMULAZIONE',
        'trend.distribution': 'DISTRIBUZIONE',
        'trend.neutral': 'NEUTRAL',

        // Performance — R-multiple based metrics
        'modal.perf.r_cumulative': 'R cumulativo',
        'modal.perf.r_net_cumulative': 'Net R cumulativo',
        'modal.perf.col.entry_price': 'Entry',
        'modal.perf.col.week_min': 'Week Low',
        'modal.perf.col.week_max': 'Week High',
        'modal.perf.col.mfe': 'MFE',
        'modal.perf.col.mae': 'MAE',
        'modal.perf.col.r': 'R',
        'modal.perf.col.net_r': 'Net R',
        'modal.perf.equity_label_r': (n) => `R Curve · ultimi ${n} verdetti valutati`,
        'modal.perf.last_n': (n) => `Ultimi ${n} verdetti`,
        'modal.perf_logic_r':
            'Logica: entry = close di lunedì · risk window = lunedì → venerdì · MFE = max favorable excursion · MAE = max adverse excursion · R = MFE/MAE · Net R = R − 1.',
        'modal.perf_synth_note_r':
            'Nota: i verdetti sono ricostruiti da una regola sintetica deterministica (segui il Δ WoW). Le metriche R sono calcolate sui min/max settimanali (non su entry/exit fissi), quindi premiano i setup che hanno respirato più a favore che contro nei 5 giorni successivi al report. La logica live (AI + macro + price action) tende a essere più affidabile dei backfill puramente meccanici.',

        // PDF
        'pdf.title': 'Speculative Alpha · COT Report',
        'pdf.generated': 'Generato',
        'pdf.section.summary': 'Snapshot Posizionamento',
        'pdf.section.macro': 'Macro Sentiment',
        'pdf.section.verdict': 'Final Verdict',
        'pdf.section.history': 'Storico COT (ultimi 8 report)',
        'pdf.section.performance': 'Performance Verdetti (R-multiple)',
        'pdf.field.report_date': 'Report Date',
        'pdf.field.type': 'Tipo',
        'pdf.field.signal': 'Sentiment',
        'pdf.field.confidence': 'Confidence',
        'pdf.field.summary': 'Sintesi',
        'pdf.field.entry': 'Entry',
        'pdf.field.events_count': 'N. eventi',
        'pdf.stats.total': 'Total',
        'pdf.stats.evaluated': 'Valutati',
        'pdf.stats.wins': 'Win',
        'pdf.stats.losses': 'Loss',
        'pdf.stats.winrate': 'Win rate',
        'pdf.stats.cum_r': 'R cumulativo',
        'pdf.stats.cum_net_r': 'Net R cumulativo',
        'pdf.footer': 'Sorgenti: CFTC (Tradingster) · TradingEconomics · Yahoo Finance · Gemini AI',
        'pdf.no_data': 'Dati non disponibili.',
    },
    en: {
        'app.tagline': 'Institutional COT Intelligence',
        'app.section.kicker': 'Institutional Markets',
        'app.section.title': 'Non-Commercial Positioning',
        'app.refresh': 'Refresh',
        'app.guide': 'Guide',
        'app.favorites': 'Favorites',
        'app.scope.core': 'Core',
        'app.scope.all': 'All',
        'app.next_sync': 'Next sync:',
        'app.error': 'Failed to load data. Please retry shortly.',
        'app.empty.fav': 'No favorite assets yet. Click the star to add one.',
        'app.empty.data': 'No data available.',
        'app.pending.sync': 'Syncing flows…',
        'app.footer.title': 'Data Source · Tradingster (CFTC Legacy Futures)',
        'app.footer.body':
            'All data is sourced from official CFTC Commitment of Traders reports. Auto-updated every Saturday.',

        'card.analysis': 'Institutional Analysis',
        'card.sync_flows': 'Syncing flows…',
        'card.oi_share': 'OI Share',
        'card.intensity': 'Intensity',
        'card.oi_tooltip_label': 'What is OI Share',
        'card.oi_tooltip_html':
            'OI Share = % of Open Interest held by large speculators (Long + Short Non-Commercial). The higher, the more the market is driven by institutional flows rather than commercials. Above 50% means speculative dominance: more directional trends but also more vulnerable to unwinding and squeezes.',

        'modal.report': 'Report',
        'modal.pdf': 'PDF',
        'modal.exporting': 'Exporting…',
        'modal.sentiment': 'Global Sentiment',
        'modal.long_term': 'Long-term:',
        'modal.short_term': 'Short-term:',
        'modal.net_position': 'Net Position',
        'modal.macro_intel': 'Macro Intelligence',
        'modal.macro_sentiment': 'Macro Sentiment · Last 7 days',
        'modal.events': 'events',
        'modal.macro_loading': 'Macro analysis from tradingeconomics…',
        'modal.final_verdict': 'Final Verdict',
        'modal.confidence': 'conf',
        'modal.verdict_loading': 'Generating verdict…',
        'modal.verdict_unavailable': 'Verdict unavailable.',
        'modal.entry': 'Entry:',
        'modal.report_label': 'Report:',
        'modal.chart_title': 'Historical Chart',
        'modal.chart_subtitle': 'Net · Long · Short · Non-Commercial Price',
        'modal.chart_loading': 'Loading historical series…',
        'modal.chart_unavailable': 'History unavailable',
        'modal.delta_recent': 'Recent Δ WoW',
        'modal.delta_subtitle': 'Weekly Net Position Change',
        'modal.history_table': 'History Table',
        'modal.history_subtitle': 'Last 8 Published Reports',
        'modal.col.date': 'Date',
        'modal.col.long': 'Long',
        'modal.col.short': 'Short',
        'modal.col.net': 'Net',
        'modal.col.delta': 'Δ WoW',
        'modal.perf_title': 'Previous Verdicts Performance',
        'modal.show': 'Show',
        'modal.hide': 'Hide',
        'modal.perf_logic':
            'Logic: entry = Monday close · exit = Friday close of the same week (daily prices from Yahoo Finance).',
        'modal.perf_synth_note':
            'Note: backfilled verdicts come from a deterministic synthetic rule (follow Δ WoW). On a 1-week horizon, COT often acts as a contrarian indicator at extremes — a low win-rate is expected. The live logic (AI + macro + price action) tends to be more reliable than purely mechanical backfills.',
        'modal.perf_loading': 'Computing performance…',
        'modal.perf.total': 'Total',
        'modal.perf.evaluated': 'Evaluated',
        'modal.perf.win': 'Win',
        'modal.perf.loss': 'Loss',
        'modal.perf.winrate': 'Win rate',
        'modal.perf.cumulative': 'Cumulative P/L %',
        'modal.perf.equity_label': (n) => `Equity Curve · last ${n} verdicts`,
        'modal.perf.last5': 'Last 5 verdicts',
        'modal.perf.col.report': 'Report',
        'modal.perf.col.verdict': 'Verdict',
        'modal.perf.col.entry_date': 'Entry (Mon)',
        'modal.perf.col.entry_price': 'Price',
        'modal.perf.col.exit_date': 'Exit (Fri)',
        'modal.perf.col.exit_price': 'Price',
        'modal.perf.col.pnl': 'P/L %',
        'modal.perf.col.outcome': 'Outcome',
        'modal.perf.empty':
            'No history available. Open this asset in upcoming reports to accumulate evaluable verdicts.',

        'help.kb': 'Knowledge Base',
        'help.title': 'COT Concepts Guide',
        'help.s.net.title': 'Net Position',
        'help.s.net.body':
            'Net Position is the difference between Long and Short contracts held by large speculators (Hedge Funds, CTAs, Asset Managers). Positive net = institutional bullish bias. Negative net = bearish bias. The larger the absolute value, the more conviction in positioning.',
        'help.s.delta.title': 'Δ WoW — Weekly Change',
        'help.s.delta.body':
            'Delta measures the speed of change. Even if Net is negative, a positive Delta means institutions are starting to accumulate. It is the fastest signal of flow rotation before it shows up in price.',
        'help.s.ls.title': 'Long, Short and their changes',
        'help.s.ls.body':
            'Cards show absolute Long and Short contracts and their individual weekly change. A drop in Short with stable Long indicates short covering / short squeeze; an increase in Long with flat Short indicates true directional accumulation.',
        'help.s.oi.title': 'OI Share — Open Interest Share',
        'help.s.oi.body':
            'Open Interest is the total of open contracts in the market. Non-Commercial OI Share is the percentage of Open Interest controlled by large speculators (Long + Short). Above 50% = market dominated by speculators: trends can be more directional but also more vulnerable to forced unwinding. Below 30% = market driven by commercial hedgers, slower and more structural trends.',
        'help.s.intensity.title': 'Intensity Index (0-100)',
        'help.s.intensity.body':
            'The Intensity Index is a synthetic measure of Non-Commercial directional conviction, normalising Net Position over total speculative positions. 50 = neutral (long ≈ short); values > 70 = strong institutional bullish bias; values < 30 = strong bearish bias. Extreme values (> 85 or < 15) indicate crowded trades: watch for unwinding or squeezes.',
        'help.s.fx.title': 'Forex Strength Index',
        'help.s.fx.body':
            'Compares the absolute strength of every currency vs USD based on Non-Commercial flows. Automatically identifies: the strongest currency, the weakest, forex pair opportunities (e.g. strong EUR + weak JPY → long EURJPY) and absolute trends where momentum and positioning agree.',
        'help.s.div.title': 'Divergences and Trade Setups',
        'help.s.div.body':
            'When price falls but Delta is positive → Accumulation: smart money buys weakness. When price rises but Delta is negative → Distribution: pros are exiting, watch for topping patterns.',
        'help.s.refresh.title': 'Refresh — Data Update',
        'help.s.refresh.body':
            'COT reports are released by the CFTC every Friday evening (data as of the prior Tuesday). The dashboard auto-updates every Saturday 22:00 UTC. Hit the Refresh button to force a manual update.',

        'heat.kicker': 'Markets Map',
        'heat.title': 'Global Net Position Heatmap',
        'heat.body':
            'Overview of all monitored instruments: colour intensity is proportional to the strength of institutional positioning.',

        'fx.kicker': 'Forex Strength Index',
        'fx.title': 'Absolute Currency Strength',
        'fx.body':
            'Non-Commercial Net positioning of each currency vs USD. Ranked from strongest to weakest, with every forex pair opportunity showing significant divergence or weekly momentum > 50%.',
        'fx.strongest': 'Strongest currency',
        'fx.weakest': 'Weakest currency',
        'fx.macro': 'Macro Analysis',
        'fx.opportunities': 'Forex Pair Opportunities (Divergences + Momentum)',
        'fx.trends': 'Relevant Absolute Trends',
        'fx.idea': 'Idea',
        'fx.score_gap': 'Score gap',
        'fx.momentum': 'Momentum',
        'fx.synth': 'Synth',
        'fx.aligned': (positive) =>
            `${positive ? 'Long' : 'Short'} trend confirmed by WoW momentum.`,
        'fx.unaligned': 'Possible reversal: strong absolute position but opposite momentum.',
        'fx.dominance.extreme': 'extreme',
        'fx.dominance.strong': 'strong',
        'fx.dominance.moderate': 'moderate',
        'fx.narrative.aligned': (s, w) =>
            `Weekly momentum confirms the divergence: ${s} keeps accumulating long flows while ${w} is sold further.`,
        'fx.narrative.reversing': (s, w) =>
            `Caution: momentum is reversing (${s} losing flows, ${w} being covered). Possible rotation underway.`,
        'fx.narrative.mixed':
            'Mixed momentum: monitor the next COT report for confirmation before trading.',
        'fx.narrative.summary': (sName, sNet, wName, wNet, dom, mom) =>
            `${sName} is the strongest currency by Non-Commercial flows (Net ${sNet}); ${wName} is the weakest (Net ${wNet}). Relative dominance ${dom}. ${mom}`,
        'fx.ccy.EUR': 'Euro',
        'fx.ccy.GBP': 'Pound Sterling',
        'fx.ccy.JPY': 'Japanese Yen',
        'fx.ccy.AUD': 'Australian Dollar',
        'fx.ccy.CAD': 'Canadian Dollar',
        'fx.ccy.CHF': 'Swiss Franc',
        'fx.ccy.NZD': 'New Zealand Dollar',
        'fx.ccy.USD': 'US Dollar (synthetic)',

        'trend.bullish': 'BULLISH',
        'trend.bearish': 'BEARISH',
        'trend.accumulation': 'ACCUMULATION',
        'trend.distribution': 'DISTRIBUTION',
        'trend.neutral': 'NEUTRAL',

        // Performance — R-multiple based metrics
        'modal.perf.r_cumulative': 'Cumulative R',
        'modal.perf.r_net_cumulative': 'Cumulative Net R',
        'modal.perf.col.entry_price': 'Entry',
        'modal.perf.col.week_min': 'Week Low',
        'modal.perf.col.week_max': 'Week High',
        'modal.perf.col.mfe': 'MFE',
        'modal.perf.col.mae': 'MAE',
        'modal.perf.col.r': 'R',
        'modal.perf.col.net_r': 'Net R',
        'modal.perf.equity_label_r': (n) => `R Curve · last ${n} evaluated verdicts`,
        'modal.perf.last_n': (n) => `Last ${n} verdicts`,
        'modal.perf_logic_r':
            'Logic: entry = Monday close · risk window = Monday → Friday · MFE = max favorable excursion · MAE = max adverse excursion · R = MFE/MAE · Net R = R − 1.',
        'modal.perf_synth_note_r':
            'Note: backfilled verdicts come from a deterministic synthetic rule (follow Δ WoW). R metrics are computed on weekly min/max excursions (not fixed entry/exit), rewarding setups that breathed more in favour than against during the 5 days following the report. The live logic (AI + macro + price action) tends to be more reliable than purely mechanical backfills.',

        // PDF
        'pdf.title': 'Speculative Alpha · COT Report',
        'pdf.generated': 'Generated',
        'pdf.section.summary': 'Positioning Snapshot',
        'pdf.section.macro': 'Macro Sentiment',
        'pdf.section.verdict': 'Final Verdict',
        'pdf.section.history': 'COT History (last 8 reports)',
        'pdf.section.performance': 'Verdict Performance (R-multiple)',
        'pdf.field.report_date': 'Report Date',
        'pdf.field.type': 'Type',
        'pdf.field.signal': 'Sentiment',
        'pdf.field.confidence': 'Confidence',
        'pdf.field.summary': 'Summary',
        'pdf.field.entry': 'Entry',
        'pdf.field.events_count': 'Events',
        'pdf.stats.total': 'Total',
        'pdf.stats.evaluated': 'Evaluated',
        'pdf.stats.wins': 'Win',
        'pdf.stats.losses': 'Loss',
        'pdf.stats.winrate': 'Win rate',
        'pdf.stats.cum_r': 'Cumulative R',
        'pdf.stats.cum_net_r': 'Cumulative Net R',
        'pdf.footer': 'Sources: CFTC (Tradingster) · TradingEconomics · Yahoo Finance · Gemini AI',
        'pdf.no_data': 'Data unavailable.',
    },
};

const LangCtx = createContext({
    lang: 'it',
    setLang: () => {},
    t: (k) => k,
});

export function LangProvider({ children }) {
    const [lang, setLangState] = useState(detectLang);
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, lang);
            document.documentElement.lang = lang;
        } catch {}
    }, [lang]);

    const setLang = useCallback((l) => setLangState(l === 'en' ? 'en' : 'it'), []);

    const t = useCallback(
        (key, ...args) => {
            const dict = STR[lang] || STR.it;
            let v = dict[key];
            if (v === undefined) v = STR.it[key];
            if (v === undefined) return key;
            if (typeof v === 'function') return v(...args);
            return v;
        },
        [lang]
    );

    return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useT() {
    return useContext(LangCtx);
}
