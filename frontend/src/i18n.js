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

        // Landing
        'landing.kicker': 'Speculative Alpha',
        'landing.title_a': 'Vedi',
        'landing.title_b': 'cosa muove',
        'landing.title_c': 'i mercati prima',
        'landing.title_d': 'degli altri.',
        'landing.subtitle': 'Posizionamento COT istituzionale, opzioni e sentiment dei commercials fusi in un unico segnale: il Confluence Index. Un solo numero per capire dove i grandi capitali si stanno muovendo davvero.',
        'landing.cta_pulse_a': 'Provala adesso',
        'landing.cta_pulse_b': 'Apri la dashboard',
        'landing.cta_meta': '7 giorni gratis · 18 asset · aggiornato ogni venerdì',
        'landing.features_kicker': "Tutto in un'unica dashboard",
        'landing.features_title': 'Le funzioni che fanno la differenza',
        'landing.feat1_t': 'Confluence Index',
        'landing.feat1_d': 'Un solo numero 0-100 per capire quando istituzionali, opzioni e hedger sono allineati.',
        'landing.feat2_t': 'Track Record verificato',
        'landing.feat2_d': 'Backtest settimanale su 12 mesi: la direzione è confermata quando il CI è alto.',
        'landing.feat3_t': 'Macro & Opzioni live',
        'landing.feat3_d': 'Eventi macro 2/3 stelle, max pain, gamma walls, regime GEX — tutto integrato.',
        'landing.feat4_t': 'COT Trend Opportunities',
        'landing.feat4_d': 'Ranking settimanale dei setup più forti, ordinati per Confluence Index.',
        'landing.feat5_t': '18 asset coperti',
        'landing.feat5_d': 'Forex majors, indici equity, commodities — tutto sotto un unico schermo.',
        'landing.feat6_t': 'Heatmap & Currency Strength',
        'landing.feat6_d': "Vedi a colpo d'occhio quale valuta è forte e quale debole, in tempo reale.",
        'landing.feat7_t': 'AI insights settimanali',
        'landing.feat7_d': 'Verdetti generati automaticamente ogni sabato dopo il rilascio COT.',
        'landing.0dte_kicker': 'In arrivo · Q2 2026',
        'landing.0dte_title_a': 'Il prossimo livello.',
        'landing.0dte_title_b': 'Opzioni 0DTE intraday.',
        'landing.0dte_desc': "Gamma in tempo reale, walls dinamici, dealer positioning. Una rivoluzione per chi cerca scalping di precisione.",
        'landing.0dte_soon': 'coming soon',
        'landing.cta2_title': 'Pronto a vedere il quadro completo?',
        'landing.cta2_desc': "Esplora gli asset con la prova gratuita. 7 giorni, nessuna carta richiesta per iniziare.",
        'landing.cta2_desc_user': 'La tua dashboard ti aspetta.',
        'landing.footer_data': 'Dati · CFTC Commitment of Traders',
        'landing.header_login': 'Registrati',
        'landing.header_dashboard': 'Dashboard',
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
        'app.expand_hint': 'Clicca una card per espandere i dettagli',
        'app.show_all_kicker': 'Sblocca asset',
        'app.show_all_title': 'Mostra tutti gli asset',
        'app.show_all_hint': '+11 strumenti aggiuntivi',

        // OptionsPanel
        'options.title_full': 'Options Levels & GEX',
        'options.subtitle_full': 'Settimanale · Max Pain · OI Walls · Gamma Exposure',
        'options.title_skew': 'Volatility Skew',
        'options.subtitle_skew': 'Settimanale · Risk Reversal · OTM Put vs Call IV',
        'options.weekly_label': 'CME Weekly · da Yahoo Options',
        'options.loading': 'Caricamento options chain…',
        'options.unavailable': 'Options chain non disponibile per questo asset.',
        'options.spot': 'Spot',
        'options.max_pain': 'Max Pain',
        'options.call_wall': 'Call Wall',
        'options.call_wall_sub': 'Resistenza · max OI calls',
        'options.put_wall': 'Put Wall',
        'options.put_wall_sub': 'Supporto · max OI puts',
        'options.net_gex': 'Net GEX',
        'options.gex_profile': 'GEX Profile per Strike',
        'options.strikes': 'strikes',
        'options.flip': 'Gamma Flip',
        'options.calls_oi': 'Calls OI',
        'options.puts_oi': 'Puts OI',
        'options.regime.long_gamma': 'Long Gamma — Range',
        'options.regime.short_gamma': 'Short Gamma — Volatile',
        'options.regime.neutral': 'Gamma Neutral',
        'options.regime.long_gamma_desc':
            'I dealer sono lunghi di gamma: tendono ad assorbire i movimenti, riducendo la volatilità realizzata. Il prezzo è spesso "magnetizzato" verso il Max Pain. Strategia: range/mean-reversion entro le walls.',
        'options.regime.short_gamma_desc':
            'I dealer sono corti di gamma: amplificano i movimenti con hedging dinamico. Volatilità in espansione, attenzione a breakout esplosivi. Strategia: momentum/breakout, evitare fading.',
        'options.regime.neutral_desc':
            'Posizionamento gamma bilanciato: mercato senza forte bias direzionale dei flussi options.',
        'options.legend.long_gamma': 'Long Gamma',
        'options.legend.short_gamma': 'Short Gamma',
        'options.legend.spot': 'Spot',
        'options.legend.max_pain': 'Max Pain',
        // Skew
        'options.atm_iv': 'ATM IV',
        'options.atm_iv_sub': 'Volatilità implicita ATM',
        'options.risk_reversal': 'Risk Reversal',
        'options.rr_sub': 'IV(call OTM) − IV(put OTM)',
        'options.skew_state': 'Skew',
        'options.skew_sub': 'Lettura direzionale options',
        'options.iv_breakdown': 'IV breakdown · OTM ~7%',
        'options.otm_call': 'OTM Call',
        'options.otm_put': 'OTM Put',
        'options.skew.bullish': 'Bullish',
        'options.skew.bearish': 'Bearish',
        'options.skew.neutral': 'Neutral',
        'options.skew.no_data': '— dati insufficienti',
        'options.skew.bullish_desc':
            'Le call OTM sono più costose delle put equivalenti: il mercato options paga per esposizione rialzista. Confermerebbe un trend long se accompagnato da Net WoW positivo.',
        'options.skew.bearish_desc':
            'Le put OTM sono più costose delle call equivalenti: tipica struttura di "fear premium". Anche se il prezzo sale, le mani forti pagano per protezione — possibile rialzo fragile o trappola.',
        'options.skew.neutral_desc':
            'IV simmetrica tra OTM put e call: nessun bias direzionale dai flussi options.',
        'options.skew.no_data_desc':
            'OI options troppo basso o non disponibile per calcolare un Risk Reversal affidabile.',

        // Help / Info popover
        'options.help.kicker': 'Guida alla lettura',
        'options.help.full.title': 'Options Levels & GEX — Come usarli',
        'options.help.full.what': 'COSA SONO',
        'options.help.full.what_desc':
            'Mappa settimanale del posizionamento options sull\'asset. I market maker (dealer) coprono i loro book con futures, e i loro flussi di hedging influenzano dove e come si muove il prezzo. Questi numeri ti dicono dove sono i livelli "magnetici" della settimana e in che regime di volatilità sei.',
        'options.help.full.maxpain': 'MAX PAIN',
        'options.help.full.maxpain_desc':
            'Lo strike a cui il maggior numero di opzioni scadono inutili (maxima perdita per chi le ha comprate). Spesso il prezzo "viene tirato" verso il Max Pain a ridosso della scadenza. Δ% indica quanto è lontano dallo spot.',
        'options.help.full.walls': 'CALL WALL & PUT WALL',
        'options.help.full.walls_desc':
            'Strike con la massima Open Interest di call (resistenza) e put (supporto). Il prezzo tende a rimbalzare contro questi muri perché i dealer vendono futures vicino alla Call Wall e ne comprano vicino alla Put Wall, contenendo i movimenti.',
        'options.help.full.gex': 'GEX & GAMMA REGIME',
        'options.help.full.gex_desc':
            'Net GEX positivo (verde, "Long Gamma") = dealer comprano in calo e vendono in salita → vol bassa, range, mean-reversion verso il Max Pain. Net GEX negativo (rosso, "Short Gamma") = dealer fanno l\'opposto, AMPLIFICANDO i movimenti → breakout, vol esplosiva. Il "Gamma Flip" è lo strike a cui il regime cambia.',
        'options.help.full.use': 'COME USARLI NEI TRADE',
        'options.help.full.use_desc':
            '• LONG GAMMA: trada il range tra Put Wall e Call Wall, mira al Max Pain, taglia stop oltre i muri. ' +
            '• SHORT GAMMA: cerca breakout dei muri, lascia correre i trend, evita di fare "fading" delle estensioni. ' +
            '• Combina con il segnale COT: se LONG-TERM è bullish + Long Gamma → setup di compressione che spesso esplode al rilascio (post-CPI/FOMC).',
        'options.help.full.warn': 'ATTENZIONE',
        'options.help.full.warn_desc':
            'I dati derivano dall\'ETF proxy (SPY/QQQ/GLD/etc.) — gli strike sono auto-convertiti al valore del futures sottostante. Vicino alle scadenze (≤1 DTE) il GEX si comprime velocemente: i livelli sono più affidabili a 3-7 giorni dalla scadenza.',
        'options.help.skew.title': 'Volatility Skew — Come usarlo',
        'options.help.skew.what': 'COSA È',
        'options.help.skew.what_desc':
            'Misura quanto il mercato options paga in più per protezione vs upside. Il Risk Reversal (RR) confronta la volatilità implicita di una call OTM (~7% sopra) con quella di una put OTM (~7% sotto). Differenza in punti vol = lo "skew".',
        'options.help.skew.read': 'COME LEGGERLO',
        'options.help.skew.read_desc':
            'RR > 0 (Bullish Skew): le call costano più delle put → trader pagano per esposizione al rialzo. ' +
            'RR < 0 (Bearish Skew / Fear Premium): le put costano più delle call → tutti vogliono protezione, tipico nei top di mercato. ' +
            'RR ≈ 0: posizionamento simmetrico, nessun bias.',
        'options.help.skew.use': 'COME USARLO NEI TRADE',
        'options.help.skew.use_desc':
            '• Bullish Skew + COT bullish → conferma forte, trend long affidabile. ' +
            '• Bearish Skew nonostante prezzo che sale → "rally fragile", possibile trappola: prendi profitto presto. ' +
            '• Estremi (RR > +5 o < -5) sono spesso punti di esaurimento: il mercato è sbilanciato e tende a invertirsi.',
        'options.help.skew.warn': 'ATTENZIONE',
        'options.help.skew.warn_desc':
            'Lo skew si calcola sull\'ETF proxy (FXE, FXB, ecc.) e su scadenze ≤2 settimane. È un segnale CONTESTUALE: non operare mai SOLO sullo skew, sempre incrociato con segnale COT, divergenza Net WoW e prezzo.',
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
        'modal.macro_intel': 'COT Intelligence',
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
        'modal.perf_title': 'Confluence Index Track Record',
        'modal.show': 'Mostra',
        'modal.hide': 'Nascondi',
        'modal.perf_logic':
            'Metodo: per ogni report COT della settimana A, ricostruiamo il Confluence Index storico (COT NET + Sentiment via retail NET + Opzioni via proxy VIX-family (VIX/VXN/VXD/RVX/GVZ/OVX), pesi 40/40/20) e osserviamo l\'azione del prezzo nella settimana successiva A+1 (lun-ven). Il segnale è "rispettato" se la direzione implicita è stata confermata: per LONG il minimo settimanale deve arrivare PRIMA del massimo; per SHORT il massimo deve arrivare PRIMA del minimo.',
        'modal.perf_synth_note':
            'Disclaimer: questa metrica NON è un backtest di trading (no entry, no stop, no slippage). Misura quanto frequentemente la direzione del Confluence Index si è verificata nella settimana successiva. Filtri per band (HIGH ≥60 / VERY HIGH ≥80): mostrano come l\'accuracy aumenta quando i 3 stream sono fortemente concordi. >55% è rilevante; 50% è random.',
        'modal.perf_loading': 'Calcolo track record…',
        'modal.perf.mode_lts': 'LONG-TERM & SHORT-TERM',
        'modal.perf.mode_st': 'SHORT-TERM',
        'modal.perf.mode_lts_desc': 'Segnale solo se Net Position e Δ WoW concordi',
        'modal.perf.mode_st_desc': 'Segnale in base al solo Δ WoW (momentum settimanale)',
        'modal.perf.window_12w': 'Ultime 24 settimane (6 mesi)',
        'modal.perf.window_24w': 'Ultime 52 settimane (1 anno)',
        'modal.perf.accuracy': 'Accuracy',
        'modal.perf.respected': 'Rispettati',
        'modal.perf.not_respected': 'Non rispettati',
        'modal.perf.skipped': 'WAIT (skip)',
        'modal.perf.pending': 'In attesa',
        'modal.perf.avg_fav_range': 'Range medio in favore',
        'modal.perf.avg_adv_range': 'Range medio contro',
        'modal.perf.high_conf': 'Accuracy con confidence ≥ 4',
        'modal.perf.no_signals': 'Nessun segnale valido in questa finestra',
        'modal.perf.history_title': 'Storico segnali settimanali',
        'modal.perf.col.report': 'Report',
        'modal.perf.col.week': 'Week A+1',
        'modal.perf.col.signal_lts': 'LTS',
        'modal.perf.col.signal_st': 'ST',
        'modal.perf.col.signal': 'Segnale',
        'modal.perf.col.conf': 'Conf',
        'modal.perf.col.range': 'Range %',
        'modal.perf.col.respected_lts': 'Risp. LTS',
        'modal.perf.col.respected_st': 'Risp. ST',
        'modal.perf.respected_yes': '✓',
        'modal.perf.respected_no': '✗',
        'modal.perf.respected_na': '—',
        'modal.perf.empty':
            'Nessuno storico disponibile per calcolare la signal accuracy.',

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
            "L'Intensity Index misura la FORZA INTRINSECA del posizionamento dei Non-Commercial, indipendentemente dalla direzione. È il valore assoluto di Net Position / Open Interest speculativo: 0 = libro perfettamente bilanciato (long ≈ short), 100 = posizionamento massimamente unilaterale (tutti long oppure tutti short). Un Intensity di 70 indica conviction estrema, sia che il book sia 85% long o 85% short. Valori > 80 sono tipici di crowded trade: attenzione a unwinding e squeeze in entrambe le direzioni.",
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

        // Performance — semplificata: R per trade è +1 (win) o -1 (loss)
        'modal.perf.r_cumulative': 'R cumulativo',
        'modal.perf.net_pct_cumulative': 'Net P/L cumulativo',
        'modal.perf.col.entry_price': 'Entry',
        'modal.perf.col.exit_price': 'Exit',
        'modal.perf.col.week_min': 'Week Low',
        'modal.perf.col.week_max': 'Week High',
        'modal.perf.col.r': 'R',
        'modal.perf.col.net_pct': 'P/L %',
        'modal.perf.equity_label_pct': (n) => `Equity Curve · ultimi ${n} verdetti valutati (P/L %)`,
        'modal.perf.last_n': (n) => `Ultimi ${n} verdetti`,
        'modal.perf_logic_r':
            'Logica: trade intra-settimana (settimana A2 dopo il report) sui massimi/minimi giornalieri (High/Low daily Yahoo). LONG: se il giorno del minimo è PRIMA del giorno del massimo → WIN (entry=Low del giorno, exit=High del giorno); altrimenti LOSS (entry=High, exit=Low). SHORT: simmetrico. Cattura gli estremi intraday reali, non solo i close.',
        'modal.perf_synth_note_r':
            'Nota: i verdetti sono ricostruiti da una regola sintetica deterministica (LONG solo se Net e Δ WoW concordi long, SHORT solo se concordi short, altrimenti WAIT esclusi). Il backtest misura il potenziale massimo del segnale con tempismo intra-settimanale ideale; la logica live (AI + macro + price action) tende comunque a essere più affidabile dei backfill meccanici.',

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
        'pdf.stats.cum_net_pct': 'Net Excursion %',
        'pdf.footer': 'Sorgenti: CFTC (Tradingster) · TradingEconomics · Yahoo Finance · Gemini AI',
        'pdf.no_data': 'Dati non disponibili.',
    },
    en: {
        'app.tagline': 'Institutional COT Intelligence',
        'app.section.kicker': 'Institutional Markets',

        // Landing
        'landing.kicker': 'Speculative Alpha',
        'landing.title_a': 'See',
        'landing.title_b': 'what moves',
        'landing.title_c': 'the markets before',
        'landing.title_d': 'anyone else.',
        'landing.subtitle': 'Institutional COT positioning, options flow and commercial hedger sentiment fused into a single 0-100 signal: the Confluence Index. One number to know where smart money is really going.',
        'landing.cta_pulse_a': 'Try it now',
        'landing.cta_pulse_b': 'Open the dashboard',
        'landing.cta_meta': '7 days free · 18 assets · refreshed every Friday',
        'landing.features_kicker': 'All in one dashboard',
        'landing.features_title': 'Features that make the difference',
        'landing.feat1_t': 'Confluence Index',
        'landing.feat1_d': 'A single 0-100 score that tells you when institutionals, options and hedgers all agree.',
        'landing.feat2_t': 'Verified Track Record',
        'landing.feat2_d': 'Rolling 12-month backtest: the direction is confirmed when CI is high.',
        'landing.feat3_t': 'Macro & Options live',
        'landing.feat3_d': '2/3-star macro events, max pain, gamma walls, GEX regime — all integrated.',
        'landing.feat4_t': 'COT Trend Opportunities',
        'landing.feat4_d': 'Weekly ranking of the strongest setups, ordered by Confluence Index.',
        'landing.feat5_t': '18 assets covered',
        'landing.feat5_d': 'Forex majors, equity indices, commodities — all under a single screen.',
        'landing.feat6_t': 'Heatmap & Currency Strength',
        'landing.feat6_d': 'See at a glance which currency is strong and which is weak, in real time.',
        'landing.feat7_t': 'Weekly AI insights',
        'landing.feat7_d': 'Verdicts generated automatically every Saturday after the COT release.',
        'landing.0dte_kicker': 'Coming · Q2 2026',
        'landing.0dte_title_a': 'The next level.',
        'landing.0dte_title_b': 'Intraday 0DTE options.',
        'landing.0dte_desc': 'Real-time gamma, dynamic walls, dealer positioning. A revolution for precision scalping.',
        'landing.0dte_soon': 'coming soon',
        'landing.cta2_title': 'Ready to see the full picture?',
        'landing.cta2_desc': 'Explore the assets with the free trial. 7 days, no card required to start.',
        'landing.cta2_desc_user': 'Your dashboard is ready.',
        'landing.footer_data': 'Data · CFTC Commitment of Traders',
        'landing.header_login': 'Sign up',
        'landing.header_dashboard': 'Dashboard',
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
        'app.expand_hint': 'Click any card to expand details',
        'app.show_all_kicker': 'Unlock more',
        'app.show_all_title': 'Show all assets',
        'app.show_all_hint': '+11 additional instruments',

        // OptionsPanel
        'options.title_full': 'Options Levels & GEX',
        'options.subtitle_full': 'Weekly · Max Pain · OI Walls · Gamma Exposure',
        'options.title_skew': 'Volatility Skew',
        'options.subtitle_skew': 'Weekly · Risk Reversal · OTM Put vs Call IV',
        'options.weekly_label': 'CME Weekly · via Yahoo Options',
        'options.loading': 'Loading options chain…',
        'options.unavailable': 'Options chain not available for this asset.',
        'options.spot': 'Spot',
        'options.max_pain': 'Max Pain',
        'options.call_wall': 'Call Wall',
        'options.call_wall_sub': 'Resistance · top calls OI',
        'options.put_wall': 'Put Wall',
        'options.put_wall_sub': 'Support · top puts OI',
        'options.net_gex': 'Net GEX',
        'options.gex_profile': 'GEX Profile by Strike',
        'options.strikes': 'strikes',
        'options.flip': 'Gamma Flip',
        'options.calls_oi': 'Calls OI',
        'options.puts_oi': 'Puts OI',
        'options.regime.long_gamma': 'Long Gamma — Range',
        'options.regime.short_gamma': 'Short Gamma — Volatile',
        'options.regime.neutral': 'Gamma Neutral',
        'options.regime.long_gamma_desc':
            'Dealers are long gamma: they absorb moves, suppressing realised volatility. Price tends to magnetise toward Max Pain. Playbook: range/mean-reversion inside the walls.',
        'options.regime.short_gamma_desc':
            'Dealers are short gamma: their dynamic hedging amplifies moves. Volatility expansion, watch for explosive breakouts. Playbook: momentum/breakout, avoid fading.',
        'options.regime.neutral_desc':
            'Balanced gamma positioning: no strong directional bias from options flows.',
        'options.legend.long_gamma': 'Long Gamma',
        'options.legend.short_gamma': 'Short Gamma',
        'options.legend.spot': 'Spot',
        'options.legend.max_pain': 'Max Pain',
        // Skew
        'options.atm_iv': 'ATM IV',
        'options.atm_iv_sub': 'At-the-money implied vol',
        'options.risk_reversal': 'Risk Reversal',
        'options.rr_sub': 'IV(OTM call) − IV(OTM put)',
        'options.skew_state': 'Skew',
        'options.skew_sub': 'Options directional bias',
        'options.iv_breakdown': 'IV breakdown · OTM ~7%',
        'options.otm_call': 'OTM Call',
        'options.otm_put': 'OTM Put',
        'options.skew.bullish': 'Bullish',
        'options.skew.bearish': 'Bearish',
        'options.skew.neutral': 'Neutral',
        'options.skew.no_data': '— insufficient data',
        'options.skew.bullish_desc':
            'OTM calls are more expensive than equivalent puts: the options market pays up for upside exposure. Confirms a long trend when accompanied by positive Net WoW.',
        'options.skew.bearish_desc':
            'OTM puts are more expensive than equivalent calls: typical "fear premium" structure. Even if price is rising, smart money pays for protection — fragile rally / potential trap.',
        'options.skew.neutral_desc':
            'IV symmetric between OTM puts and calls: no directional bias from options flows.',
        'options.skew.no_data_desc':
            'Options OI too thin or unavailable to compute a reliable Risk Reversal.',

        // Help / Info popover
        'options.help.kicker': 'Reading guide',
        'options.help.full.title': 'Options Levels & GEX — How to use',
        'options.help.full.what': 'WHAT IT IS',
        'options.help.full.what_desc':
            'A weekly map of options positioning on the asset. Market makers (dealers) hedge their books with futures, and their hedging flows shape WHERE and HOW the price moves. These numbers tell you the "magnet" levels of the week and the volatility regime you\'re in.',
        'options.help.full.maxpain': 'MAX PAIN',
        'options.help.full.maxpain_desc':
            'The strike at which the largest number of options expire worthless (max pain for buyers). Price often gravitates toward Max Pain into expiry. Δ% shows distance from spot.',
        'options.help.full.walls': 'CALL WALL & PUT WALL',
        'options.help.full.walls_desc':
            'Strikes with the largest Open Interest in calls (resistance) and puts (support). Price tends to bounce off these walls because dealers SELL futures near the Call Wall and BUY near the Put Wall, capping the move.',
        'options.help.full.gex': 'GEX & GAMMA REGIME',
        'options.help.full.gex_desc':
            'Positive Net GEX (green, "Long Gamma") = dealers buy on dips and sell on rallies → low vol, range, mean-reversion toward Max Pain. Negative Net GEX (red, "Short Gamma") = dealers do the opposite, AMPLIFYING moves → breakouts, vol expansion. The "Gamma Flip" is the strike where the regime changes sign.',
        'options.help.full.use': 'HOW TO USE IN TRADES',
        'options.help.full.use_desc':
            '• LONG GAMMA: trade the range between Put Wall and Call Wall, target Max Pain, stops just beyond the walls. ' +
            '• SHORT GAMMA: hunt breakouts of the walls, let trends run, avoid fading extensions. ' +
            '• Pair with COT: if LONG-TERM is bullish + Long Gamma → coiled-spring setup that often explodes on the release (CPI/FOMC).',
        'options.help.full.warn': 'CAVEATS',
        'options.help.full.warn_desc':
            'Data is sourced from the ETF proxy (SPY/QQQ/GLD/etc.) — strikes are auto-translated to the futures-equivalent value. Near expiry (≤1 DTE) GEX collapses quickly: levels are most reliable 3–7 days out.',
        'options.help.skew.title': 'Volatility Skew — How to use',
        'options.help.skew.what': 'WHAT IT IS',
        'options.help.skew.what_desc':
            'Measures how much more the options market pays for protection vs upside. Risk Reversal (RR) compares the implied vol of an OTM call (~7% above) with an OTM put (~7% below). Difference in vol points = the skew.',
        'options.help.skew.read': 'HOW TO READ',
        'options.help.skew.read_desc':
            'RR > 0 (Bullish Skew): calls cost more than puts → traders pay up for upside. ' +
            'RR < 0 (Bearish Skew / Fear Premium): puts cost more → everyone wants protection, typical at market tops. ' +
            'RR ≈ 0: symmetric positioning, no bias.',
        'options.help.skew.use': 'HOW TO USE IN TRADES',
        'options.help.skew.use_desc':
            '• Bullish Skew + bullish COT → strong confirmation, reliable long trend. ' +
            '• Bearish Skew while price rises → "fragile rally", possible trap: take profit early. ' +
            '• Extremes (RR > +5 or < −5) are often exhaustion points: market is one-sided and tends to revert.',
        'options.help.skew.warn': 'CAVEATS',
        'options.help.skew.warn_desc':
            'Skew is computed on the ETF proxy (FXE, FXB, etc.) and on expiries ≤2 weeks. Use it as CONTEXT: never trade off skew alone — always cross-check with COT signal, Net WoW divergence and price action.',
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
        'modal.macro_intel': 'COT Intelligence',
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
        'modal.perf_title': 'Confluence Index Track Record',
        'modal.show': 'Show',
        'modal.hide': 'Hide',
        'modal.perf_logic':
            'Method: for each historical COT week we recompute the Confluence Index (COT NET + Sentiment via retail NET + Options via VIX-family proxy (VIX/VXN/VXD/RVX/GVZ/OVX), weights 40/40/20) and observe price action in the following week (Mon-Fri). A signal is "respected" if its implied direction was confirmed chronologically: for LONG the weekly low must come BEFORE the weekly high; for SHORT the weekly high must come BEFORE the weekly low.',
        'modal.perf_synth_note':
            'Disclaimer: NOT a trading backtest (no entry, stop, slippage). Measures how often the Confluence Index direction was confirmed the following week. Filtering by band (HIGH ≥60 / VERY HIGH ≥80) reveals how accuracy scales with stream agreement. >55% is meaningful; 50% is random.',
        'modal.perf_loading': 'Computing track record…',
        'modal.perf.mode_lts': 'LONG-TERM & SHORT-TERM',
        'modal.perf.mode_st': 'SHORT-TERM',
        'modal.perf.mode_lts_desc': 'Signal fires only when Net Position and Δ WoW agree',
        'modal.perf.mode_st_desc': 'Signal fires on Δ WoW direction alone (weekly momentum)',
        'modal.perf.window_12w': 'Last 24 weeks (6 months)',
        'modal.perf.window_24w': 'Last 52 weeks (1 year)',
        'modal.perf.accuracy': 'Accuracy',
        'modal.perf.respected': 'Respected',
        'modal.perf.not_respected': 'Not respected',
        'modal.perf.skipped': 'WAIT (skip)',
        'modal.perf.pending': 'Pending',
        'modal.perf.avg_fav_range': 'Avg favorable range',
        'modal.perf.avg_adv_range': 'Avg adverse range',
        'modal.perf.high_conf': 'Accuracy with confidence ≥ 4',
        'modal.perf.no_signals': 'No valid signals in this window',
        'modal.perf.history_title': 'Weekly signal history',
        'modal.perf.col.report': 'Report',
        'modal.perf.col.week': 'Week A+1',
        'modal.perf.col.signal_lts': 'LTS',
        'modal.perf.col.signal_st': 'ST',
        'modal.perf.col.signal': 'Signal',
        'modal.perf.col.conf': 'Conf',
        'modal.perf.col.range': 'Range %',
        'modal.perf.col.respected_lts': 'LTS Resp.',
        'modal.perf.col.respected_st': 'ST Resp.',
        'modal.perf.respected_yes': '✓',
        'modal.perf.respected_no': '✗',
        'modal.perf.respected_na': '—',
        'modal.perf.empty':
            'No history available to compute signal accuracy.',

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
            'The Intensity Index measures the INTRINSIC STRENGTH of Non-Commercial positioning, regardless of direction. It is the absolute value of Net Position / speculative Open Interest: 0 = perfectly balanced book (long ≈ short), 100 = maximally one-sided positioning (all long or all short). An Intensity of 70 signals extreme conviction whether the book is 85% long or 85% short. Values > 80 are typical of crowded trades: watch for unwinding and squeezes in either direction.',
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

        // Performance — R cumulative (+1/-1 per trade)
        'modal.perf.r_cumulative': 'Cumulative R',
        'modal.perf.net_pct_cumulative': 'Cumulative Net P/L',
        'modal.perf.col.entry_price': 'Entry',
        'modal.perf.col.exit_price': 'Exit',
        'modal.perf.col.week_min': 'Week Low',
        'modal.perf.col.week_max': 'Week High',
        'modal.perf.col.r': 'R',
        'modal.perf.col.net_pct': 'P/L %',
        'modal.perf.equity_label_pct': (n) => `Equity Curve · last ${n} evaluated verdicts (P/L %)`,
        'modal.perf.last_n': (n) => `Last ${n} verdicts`,
        'modal.perf_logic_r':
            'Logic: intra-week trade (week A2 after the report) on daily highs/lows (Yahoo Daily OHLC). LONG: if the day of the Low comes BEFORE the day of the High → WIN (entry=day\'s Low, exit=day\'s High); otherwise LOSS (entry=High, exit=Low). SHORT: mirrored. Captures real intraday extremes, not just closes.',
        'modal.perf_synth_note_r':
            'Note: backfilled verdicts come from a deterministic synthetic rule (LONG only when Net and Δ WoW are both long, SHORT only when both short, otherwise WAIT excluded). The backtest measures the signal\'s maximum potential with ideal intra-week timing; the live logic (AI + macro + price action) still tends to be more reliable than mechanical backfills.',

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
        'pdf.stats.cum_net_pct': 'Net Excursion %',
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
