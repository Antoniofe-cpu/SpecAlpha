import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    User as UserIcon,
    Mail,
    Calendar,
    CreditCard,
    Shield,
    Star,
    LogOut,
    ExternalLink,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Sparkles,
} from 'lucide-react';
import { useAuth, isPremium } from '../auth/AuthContext';
import { useT } from '../i18n';
import { startCheckout, openBillingPortal, fetchBillingStatus } from '../billing/api';
import { cn } from '../utils';

/**
 * /account — Subscription & profile management page.
 * Wires into Stripe Customer Portal for plan changes, cancellation,
 * card update and invoice history.
 */
export default function AccountPage() {
    const { user, loading, logout, refreshMe } = useAuth();
    const { t } = useT();
    const navigate = useNavigate();
    const [billingStatus, setBillingStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Redirect unauthenticated users to the landing. We only run this guard
    // on the *initial* mount transition (loading=true → loading=false). Once
    // we have ever seen a logged-in user we never auto-bounce them out, even
    // if /me momentarily returns null due to a transient backend error.
    const everHadUser = React.useRef(false);
    useEffect(() => { if (user) everHadUser.current = true; }, [user]);
    const bootChecked = React.useRef(false);
    useEffect(() => {
        if (loading) return;
        if (bootChecked.current) return;
        bootChecked.current = true;
        if (!user && !everHadUser.current) navigate('/', { replace: true });
    }, [loading, user, navigate]);

    // Pull the latest billing snapshot from Stripe (self-heal) once.
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        fetchBillingStatus()
            .then((d) => { if (!cancelled) setBillingStatus(d); })
            .catch(() => {});
        // Refresh /me too so the user doc gains stripe_customer_id / period_end
        refreshMe();
        return () => { cancelled = true; };
    }, [user, refreshMe]);

    const premium = isPremium(user);
    const status = user?.subscription_status || 'free';
    const hasCustomer = Boolean(user?.stripe_customer_id || billingStatus?.stripe_customer_id);

    const handleCheckout = async () => {
        setBusy(true); setError('');
        try { await startCheckout(); }
        catch (e) { setError(e.message || 'Errore'); setBusy(false); }
    };
    const handlePortal = async () => {
        setBusy(true); setError('');
        try { await openBillingPortal(); }
        catch (e) { setError(e.message || 'Errore'); setBusy(false); }
    };

    if (loading || !user) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-amber-400" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-gray-200 grain">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-[#050505]/90 backdrop-blur-xl border-b border-white/8">
                <div className="max-w-5xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between">
                    <Link
                        to="/dashboard"
                        data-testid="account-back-link"
                        className="flex items-center gap-2 text-gray-400 hover:text-white text-[12px] font-semibold uppercase tracking-[0.18em]"
                    >
                        <ArrowLeft size={14} /> {t('account.back_to_dashboard')}
                    </Link>
                    <button
                        data-testid="account-logout-btn"
                        onClick={async () => { await logout(); navigate('/', { replace: true }); }}
                        className="p-2.5 rounded-2xl bg-white/[0.06] hover:bg-rose-500/15 hover:border-rose-500/40 border border-white/10 text-gray-300"
                        title={t('account.logout')}
                    >
                        <LogOut size={14} />
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 sm:px-8 py-10 space-y-8">
                {/* Page title */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45 }}
                >
                    <div className="text-[11px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-1.5">
                        {t('account.kicker')}
                    </div>
                    <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
                        {t('account.title')}
                    </h1>
                </motion.div>

                {/* Profile card */}
                <Section title={t('account.profile_title')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InfoRow icon={Mail} label={t('account.email')} value={user.email} />
                        <InfoRow icon={UserIcon} label={t('account.name')} value={user.name || '\u2014'} />
                        <InfoRow icon={Calendar} label={t('account.member_since')} value={fmtDate(user.created_at)} />
                        <InfoRow
                            icon={Shield}
                            label={t('account.role')}
                            value={user.role === 'admin' ? 'Admin' : t('account.role_user')}
                            valueClass={user.role === 'admin' ? 'text-amber-300 font-bold' : ''}
                        />
                    </div>
                </Section>

                {/* Subscription card */}
                <Section title={t('account.subscription_title')}>
                    <PlanBadge status={status} premium={premium} trialEnd={user.trial_ends_at} t={t} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                        <InfoRow
                            icon={CreditCard}
                            label={t('account.plan')}
                            value={planLabel(status, premium, t)}
                        />
                        <InfoRow
                            icon={Sparkles}
                            label={t('account.price')}
                            value={status === 'free' ? t('account.price_free') : t('account.price_value')}
                        />
                        {user.trial_ends_at && status === 'trialing' && (
                            <InfoRow
                                icon={Clock}
                                label={t('account.trial_ends')}
                                value={fmtDate(user.trial_ends_at)}
                                valueClass="text-sky-300 font-mono"
                            />
                        )}
                        {(user.current_period_end || billingStatus?.current_period_end) && status !== 'free' && (
                            <InfoRow
                                icon={Calendar}
                                label={status === 'canceled' ? t('account.access_until') : t('account.next_billing')}
                                value={fmtDate(user.current_period_end || billingStatus?.current_period_end)}
                                valueClass="font-mono"
                            />
                        )}
                        {user.cancel_at_period_end && status !== 'free' && (
                            <InfoRow
                                icon={AlertTriangle}
                                label={t('account.cancel_status')}
                                value={t('account.cancel_status_value')}
                                valueClass="text-rose-300"
                            />
                        )}
                    </div>

                    {error && (
                        <div className="mt-4 text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="mt-6 flex flex-wrap gap-3">
                        {/* Free user, never trialed → start trial */}
                        {!premium && !user.stripe_subscription_id && !user.has_used_trial && (
                            <button
                                data-testid="account-start-trial-btn"
                                onClick={handleCheckout}
                                disabled={busy}
                                className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-[0.18em] text-[12px] transition flex items-center gap-2 disabled:opacity-60"
                            >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {t('account.cta_start_trial')}
                            </button>
                        )}
                        {/* Free user, already trialed once → subscribe directly */}
                        {!premium && !user.stripe_subscription_id && user.has_used_trial && (
                            <button
                                data-testid="account-subscribe-btn"
                                onClick={handleCheckout}
                                disabled={busy}
                                className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-[0.18em] text-[12px] transition flex items-center gap-2 disabled:opacity-60"
                            >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {t('account.cta_subscribe')}
                            </button>
                        )}
                        {/* Has sub → manage in Stripe Portal */}
                        {hasCustomer && (
                            <button
                                data-testid="account-manage-btn"
                                onClick={handlePortal}
                                disabled={busy}
                                className="px-5 py-3 rounded-2xl bg-white/[0.06] hover:bg-amber-500/15 hover:border-amber-500/40 border border-white/10 text-amber-200 font-bold uppercase tracking-[0.18em] text-[12px] transition flex items-center gap-2 disabled:opacity-60"
                            >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                                {t('account.cta_manage')}
                            </button>
                        )}
                    </div>

                    {/* Trial-already-used notice */}
                    {!premium && user.has_used_trial && !user.stripe_subscription_id && (
                        <p className="text-[11px] text-amber-300/80 mt-4 leading-relaxed bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-3 py-2.5">
                            {t('account.trial_already_used')}
                        </p>
                    )}

                    <p className="text-[11px] text-gray-500 mt-5 leading-relaxed">
                        {t('account.manage_hint')}
                    </p>
                </Section>

                {/* Stats */}
                <Section title={t('account.stats_title')}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <StatTile
                            icon={Star}
                            label={t('account.favorites')}
                            value={(user.favorites || []).length}
                        />
                        <StatTile
                            icon={UserIcon}
                            label={t('account.user_id')}
                            value={user.user_id?.slice(0, 12) + '\u2026'}
                            mono
                        />
                        <StatTile
                            icon={CheckCircle2}
                            label={t('account.access_level')}
                            value={premium ? 'PRO' : 'FREE'}
                            valueClass={premium ? 'text-amber-300' : 'text-gray-400'}
                        />
                    </div>
                </Section>
            </main>
        </div>
    );
}

/* ------------------------------- helpers ------------------------------- */

function Section({ title, children }) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.02] to-transparent backdrop-blur-md p-6 sm:p-7"
        >
            <div className="text-[10px] tracking-[0.3em] uppercase font-bold text-gray-500 mb-5">
                {title}
            </div>
            {children}
        </motion.section>
    );
}

function InfoRow({ icon: Icon, label, value, valueClass = '' }) {
    return (
        <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                <Icon size={13} className="text-gray-400" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-bold mb-0.5">
                    {label}
                </div>
                <div className={cn('text-[14px] text-white truncate', valueClass)} title={value}>
                    {value}
                </div>
            </div>
        </div>
    );
}

function StatTile({ icon: Icon, label, value, valueClass = '', mono = false }) {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-2">
                <Icon size={12} className="text-amber-400" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">{label}</span>
            </div>
            <div className={cn(
                'text-xl font-bold',
                mono && 'font-mono text-[14px]',
                valueClass || 'text-white'
            )}>
                {value}
            </div>
        </div>
    );
}

function PlanBadge({ status, premium, trialEnd, t }) {
    const cfg = useMemo(() => {
        if (status === 'active') return { label: t('account.badge_pro'), color: 'emerald', glow: true };
        if (status === 'trialing') return { label: t('account.badge_trial'), color: 'sky', glow: true };
        if (status === 'past_due') return { label: t('account.badge_past_due'), color: 'rose', glow: false };
        if (status === 'canceled') return { label: t('account.badge_canceled'), color: 'gray', glow: false };
        return { label: t('account.badge_free'), color: 'gray', glow: false };
    }, [status, t]);

    const colorClasses = {
        emerald: 'from-emerald-500/15 to-emerald-500/[0.02] border-emerald-500/30 text-emerald-300',
        sky: 'from-sky-500/15 to-sky-500/[0.02] border-sky-500/30 text-sky-300',
        rose: 'from-rose-500/15 to-rose-500/[0.02] border-rose-500/30 text-rose-300',
        gray: 'from-white/[0.05] to-white/[0.01] border-white/10 text-gray-300',
    }[cfg.color];

    return (
        <div className={cn(
            'rounded-2xl border bg-gradient-to-br px-5 py-4 flex items-center justify-between flex-wrap gap-3',
            colorClasses
        )}>
            <div className="flex items-center gap-3">
                {premium ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80">
                        {t('account.current_plan')}
                    </div>
                    <div className="font-display text-xl font-bold">{cfg.label}</div>
                </div>
            </div>
            {status === 'trialing' && trialEnd && (
                <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[0.22em] opacity-70 font-bold">
                        {t('account.trial_ends_short')}
                    </div>
                    <div className="font-mono text-[13px]">{fmtDate(trialEnd)}</div>
                </div>
            )}
        </div>
    );
}

function planLabel(status, premium, t) {
    if (status === 'active') return t('account.plan_pro');
    if (status === 'trialing') return t('account.plan_trial');
    if (status === 'past_due') return t('account.plan_past_due');
    if (status === 'canceled') return t('account.plan_canceled');
    return t('account.plan_free');
}

function fmtDate(iso) {
    if (!iso) return '\u2014';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return String(iso).slice(0, 10);
    }
}
