import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle } from 'lucide-react';
import { useT } from '../i18n';

const SECTION_KEYS = [
    'help.s.net',
    'help.s.delta',
    'help.s.ls',
    'help.s.oi',
    'help.s.intensity',
    'help.s.fx',
    'help.s.div',
    'help.s.refresh',
];

export default function HelpModal({ open, onClose }) {
    const { t } = useT();
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
                                        {t('help.kb')}
                                    </div>
                                    <h2 className="font-display text-2xl font-bold text-white">
                                        {t('help.title')}
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
                            {SECTION_KEYS.map((k) => (
                                <div
                                    key={k}
                                    className="border-l-2 border-amber-500/40 pl-5 py-1"
                                >
                                    <h3 className="font-display text-lg font-bold text-white mb-1.5">
                                        {t(`${k}.title`)}
                                    </h3>
                                    <p className="text-[14.5px] leading-relaxed text-gray-300">{t(`${k}.body`)}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
