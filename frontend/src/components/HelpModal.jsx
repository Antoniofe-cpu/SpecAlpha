import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle } from 'lucide-react';

const sections = [
    {
        title: "Cos'è il Posizionamento (Net Position)?",
        body:
            "La Net Position è la differenza tra i contratti Long e Short detenuti dai grandi speculatori (Hedge Funds, CTA). Un valore positivo indica un posizionamento istituzionale rialzista; un valore negativo indica un posizionamento ribassista.",
    },
    {
        title: 'Cos\'è il Delta WoW?',
        body:
            "Il Delta è la variazione settimanale della Net Position. Misura la velocità con cui i flussi istituzionali stanno cambiando. Un Delta positivo su Net negativo segnala accumulazione (possibile inversione rialzista).",
    },
    {
        title: 'Divergenze e Setup Operativi',
        body:
            "Quando il prezzo scende ma il Delta è positivo si parla di Accumulazione: le mani forti comprano debolezza. Quando il prezzo sale ma il Delta è negativo si parla di Distribuzione: i pro escono, attenzione ai topping pattern.",
    },
    {
        title: 'Open Interest Share',
        body:
            "Percentuale di Open Interest detenuta dai Non-Commercial Long + Short. Valori molto alti indicano dominanza speculativa (mercato direzionale ma fragile a copertura forzata).",
    },
    {
        title: 'Refresh Pubblico CFTC',
        body:
            "I report COT sono pubblicati ogni venerdì sera (dati a martedì). Il dashboard si aggiorna automaticamente ogni sabato 22:00 UTC. Premi il pulsante Refresh per forzare un aggiornamento manuale.",
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
                        initial={{ scale: 0.95, y: 12, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#0a0a0a] border border-white/10 rounded-2xl max-w-3xl w-full p-8 max-h-[85vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                                    <HelpCircle className="text-amber-400" size={18} />
                                </div>
                                <div>
                                    <div className="text-[10px] tracking-[0.3em] uppercase text-amber-400 font-bold mb-0.5">
                                        Knowledge Base
                                    </div>
                                    <h2 className="font-display text-xl font-bold text-white">Guida ai Concetti COT</h2>
                                </div>
                            </div>
                            <button
                                data-testid="help-close-btn"
                                onClick={onClose}
                                className="p-2 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-5">
                            {sections.map((s, i) => (
                                <div key={i} className="border-l-2 border-amber-500/40 pl-4">
                                    <h3 className="font-display text-sm font-semibold text-white mb-1">{s.title}</h3>
                                    <p className="text-[12.5px] leading-relaxed text-gray-400">{s.body}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
