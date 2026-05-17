import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User as UserIcon, Loader2 } from 'lucide-react';
import { useAuth, formatApiError } from './AuthContext';

export default function AuthModal({ open, onClose, initialMode = 'login' }) {
    const { login, register, loginWithGoogle } = useAuth();
    const [mode, setMode] = useState(initialMode); // 'login' | 'register'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    if (!open) return null;

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            if (mode === 'login') await login(email.trim().toLowerCase(), password);
            else await register(email.trim().toLowerCase(), password, name.trim());
            onClose?.();
            // Reset form
            setEmail(''); setPassword(''); setName('');
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail) || err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                data-testid="auth-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/70 backdrop-blur-md"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, y: 18, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 18, scale: 0.97 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-gradient-to-b from-[#0c0c10] to-[#070708] p-7 shadow-[0_30px_120px_-20px_rgba(0,0,0,0.9)]"
                >
                    <button
                        data-testid="auth-modal-close"
                        onClick={onClose}
                        className="absolute right-4 top-4 p-2 rounded-xl hover:bg-white/[0.06] text-gray-400 hover:text-white transition"
                    >
                        <X size={18} />
                    </button>

                    <div className="text-[11px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-1.5">
                        {mode === 'login' ? 'Accedi' : 'Registrati'}
                    </div>
                    <h2 className="font-display text-2xl font-bold text-white mb-1">
                        {mode === 'login' ? 'Bentornato' : 'Crea il tuo account'}
                    </h2>
                    <p className="text-[13px] text-gray-400 mb-5">
                        {mode === 'login'
                            ? 'Accedi per sbloccare il Confluence Index completo.'
                            : '7 giorni di prova gratuita. Annulla quando vuoi.'}
                    </p>

                    <button
                        data-testid="auth-google-btn"
                        type="button"
                        onClick={loginWithGoogle}
                        className="w-full mb-4 px-4 py-3 rounded-2xl border border-white/15 bg-white text-black hover:bg-white/90 transition flex items-center justify-center gap-3 font-semibold text-[14px]"
                    >
                        <GoogleIcon /> Continua con Google
                    </button>

                    <div className="flex items-center gap-3 mb-4 text-[11px] text-gray-500 uppercase tracking-[0.22em]">
                        <span className="flex-1 h-px bg-white/10" /> oppure <span className="flex-1 h-px bg-white/10" />
                    </div>

                    <form onSubmit={submit} className="space-y-3">
                        {mode === 'register' && (
                            <Field icon={UserIcon} type="text" placeholder="Nome" value={name} onChange={setName} testid="auth-name" />
                        )}
                        <Field icon={Mail} type="email" placeholder="Email" value={email} onChange={setEmail} testid="auth-email" required />
                        <Field icon={Lock} type="password" placeholder="Password (min 8)" value={password} onChange={setPassword} testid="auth-password" required />

                        {error && (
                            <div data-testid="auth-error" className="text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                                {error}
                            </div>
                        )}

                        <button
                            data-testid="auth-submit-btn"
                            type="submit"
                            disabled={busy}
                            className="w-full px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-[0.18em] text-[12px] transition flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            {busy && <Loader2 size={14} className="animate-spin" />}
                            {mode === 'login' ? 'Accedi' : 'Crea account'}
                        </button>
                    </form>

                    <div className="mt-5 text-center text-[12px] text-gray-400">
                        {mode === 'login' ? (
                            <>
                                Non hai un account?{' '}
                                <button data-testid="auth-switch-register" onClick={() => { setMode('register'); setError(''); }} className="text-amber-400 hover:underline font-semibold">
                                    Registrati
                                </button>
                            </>
                        ) : (
                            <>
                                Hai già un account?{' '}
                                <button data-testid="auth-switch-login" onClick={() => { setMode('login'); setError(''); }} className="text-amber-400 hover:underline font-semibold">
                                    Accedi
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function Field({ icon: Icon, type, placeholder, value, onChange, testid, required }) {
    return (
        <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] focus-within:border-amber-400/40 focus-within:bg-white/[0.06] px-3 py-2.5 transition">
            <Icon size={15} className="text-gray-500 shrink-0" />
            <input
                data-testid={testid}
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required={required}
                className="flex-1 bg-transparent outline-none text-[14px] text-white placeholder:text-gray-500"
                autoComplete={type === 'password' ? (placeholder?.includes('min') ? 'new-password' : 'current-password') : 'on'}
            />
        </label>
    );
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.46.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.78.43 3.47 1.18 4.96l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>
        </svg>
    );
}
