import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle } from 'lucide-react';

const sections = [
    {
        title: "Net Position (Posizionamento Netto)",
        body:
            "La Net Position è la differenza fra contratti Long e Short detenuti dai grandi speculatori (Hedge Funds, CTA, Asset Manager). Net positiva = bias rialzista istituzionale. Net negativa = bias ribassista. Più alto è il valore assoluto, più convinto è il posizionamento.",
    },
    {
        title: 'Δ WoW — Variazione Settimanale',
        body:
            "Il Delta misura la velocità del cambiamento. Anche se la Net è negativa, un Delta positivo indica che gli istituzionali iniziano ad accumulare. È il segnale più rapido di rotazione dei flussi prima che si rifletta nel prezzo.",
    },
    {
        title: 'Long, Short e le loro variazioni',
        body:
            "Le card mostrano i contratti assoluti Long e Short e la loro variazione settimanale singola. Un calo di Short con Long stabili indica copertura/short squeeze; un aumento di Long con Short fermi indica vero accumulo direzionale.",
    },
    {
        title: 'OI Share — Open Interest Share',
        body:
            "L'Open Interest è il totale dei contratti aperti sul mercato. L'OI Share Non-Commercial è la percentuale di Open Interest controllata dai grandi speculatori (Long + Short). Sopra 50% = mercato dominato dagli speculativi: i trend possono essere più direzionali ma più vulnerabili a unwinding forzati. Sotto 30% = mercato guidato dagli operatori commerciali (hedger), trend più lenti e strutturali.",
    },
    {
        title: 'Intensity Index (0-100)',
        body:
            "L'Intensity Index è una misura sintetica della convinzione direzionale degli Non-Commercial, ottenuta normalizzando la Net Position sul totale delle posizioni speculative. 50 = posizionamento neutro (long ≈ short); valori > 70 = forte bias rialzista istituzionale; valori < 30 = forte bias ribassista. Valori estremi (> 85 o < 15) segnalano crowded trade: attenzione a unwinding o squeeze.",
    },
    {
        title: 'Forex Strength Index',
        body:
            "Confronta la forza assoluta di tutte le valute vs USD basandosi sui flussi Non-Commercial. Identifica automaticamente: la valuta più forte, la più debole, le opportunità su pair forex (es. EUR forte + JPY debole → EURJPY long) e i trend assoluti dove momentum e posizionamento si confermano.",
    },
    {
        title: 'Divergenze e Setup Operativi',
        body:
            "Quando il prezzo scende ma il Delta è positivo si parla di Accumulazione: le mani forti comprano debolezza. Quando il prezzo sale ma il Delta è negativo si parla di Distribuzione: i pro escono, attenzione ai topping pattern.",
    },
    {
        title: 'Refresh — Aggiornamento Dati',
        body:
            "I report COT sono pubblicati dalla CFTC ogni venerdì sera (con dati al martedì precedente). Il dashboard si aggiorna automaticamente ogni sabato 22:00 UTC. Premi il pulsante Refresh per forzare un aggiornamento manuale.",
    },
];

export default function HelpModal({ open, onClose }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    data-testid="help-modal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
                >
                    <motion.div
                        initial={{ scale: 0.96, y: 14, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.96, opacity: 0 }}
                        transition={{ duration: 0.32 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#0a0a0d] border border-white/10 rounded-[32px] max-w-3xl w-full p-8 sm:p-10 max-h-[88vh] overflow-y-auto soft-shadow"
                    >
                        <div className="flex items-center justify-between mb-7">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                                    <HelpCircle className="text-amber-400" size={22} />
                                </div>
                                <div>
                                    <div className="text-[12px] tracking-[0.3em] uppercase text-amber-400 font-bold mb-1">
                                        Knowledge Base
                                    </div>
                                    <h2 className="font-display text-2xl font-bold text-white">
                                        Guida ai Concetti COT
                                    </h2>
                                </div>
                            </div>
                            <button
                                data-testid="help-close-btn"
                                onClick={onClose}
                                className="p-2.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-6">
                            {sections.map((s, i) => (
                                <div
                                    key={i}
                                    className="border-l-2 border-amber-500/40 pl-5 py-1"
                                >
                                    <h3 className="font-display text-lg font-bold text-white mb-1.5">
                                        {s.title}
                                    </h3>
                                    <p className="text-[14.5px] leading-relaxed text-gray-300">{s.body}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
