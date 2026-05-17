import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Users,
    UserPlus,
    Activity,
    TrendingUp,
    DollarSign,
    ArrowLeft,
    RefreshCw,
    Search,
    Trash2,
    Shield,
    Clock,
    BarChart3,
    Loader2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { adminApi } from './api';
import { cn } from '../utils';

export default function AdminPanel() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    if (authLoading) {
        return <CenteredLoading label="Verifico l'autenticazione…" />;
    }
    if (!user) {
        return (
            <Forbidden
                title="Devi accedere come admin"
                cta="Torna alla dashboard"
                onClick={() => navigate('/')}
            />
        );
    }
    if ((user.role || 'user') !== 'admin') {
        return (
            <Forbidden
                title="Accesso riservato agli amministratori"
                cta="Torna alla dashboard"
                onClick={() => navigate('/')}
            />
        );
    }

    return <AdminContent />;
}

function CenteredLoading({ label }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] text-gray-300">
            <div className="flex items-center gap-3 text-[13px]">
                <Loader2 size={16} className="animate-spin text-amber-400" />
                {label}
            </div>
        </div>
    );
}

function Forbidden({ title, cta, onClick }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] px-6">
            <div className="text-center max-w-md">
                <Shield size={36} className="text-amber-400 mx-auto mb-4" />
                <h1 className="font-display text-2xl font-bold text-white mb-2">{title}</h1>
                <p className="text-gray-400 text-[14px] mb-6">Questa area è riservata.</p>
                <button
                    onClick={onClick}
                    className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-[0.18em] text-[12px]"
                    data-testid="admin-back-btn"
                >
                    {cta}
                </button>
            </div>
        </div>
    );
}

function AdminContent() {
    const [kpis, setKpis] = useState(null);
    const [funnel, setFunnel] = useState(null);
    const [events, setEvents] = useState([]);
    const [topAssets, setTopAssets] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [tab, setTab] = useState('overview');

    const load = async () => {
        setRefreshing(true);
        try {
            const [k, f, e, ta] = await Promise.all([
                adminApi.kpis(),
                adminApi.funnel(30),
                adminApi.events({ limit: 100 }),
                adminApi.topAssets(30),
            ]);
            setKpis(k);
            setFunnel(f);
            setEvents(e.events || []);
            setTopAssets(ta.items || []);
        } catch (err) {
            console.error('admin load failed', err);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        load();
        const id = setInterval(load, 30000); // auto-refresh every 30s
        return () => clearInterval(id);
    }, []);

    return (
        <div className="min-h-screen bg-[#050505] text-gray-200 grain">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-xl border-b border-white/8">
                <div className="max-w-7xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Link
                            to="/"
                            data-testid="admin-home-link"
                            className="p-2 rounded-xl hover:bg-white/[0.06] text-gray-400 hover:text-white"
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <div>
                            <div className="text-[10px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-0.5">
                                Admin Control
                            </div>
                            <h1 className="font-display text-xl font-bold text-white">Pannello di controllo</h1>
                        </div>
                    </div>
                    <button
                        data-testid="admin-refresh-btn"
                        onClick={load}
                        disabled={refreshing}
                        className="px-4 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-amber-500/15 hover:border-amber-500/40 border border-white/10 text-[12px] font-semibold uppercase tracking-[0.18em] flex items-center gap-2 disabled:opacity-60"
                    >
                        <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
                        Aggiorna
                    </button>
                </div>

                {/* Tab nav */}
                <div className="max-w-7xl mx-auto px-6 sm:px-8 pb-3 flex items-center gap-1">
                    {[
                        { k: 'overview', l: 'Panoramica' },
                        { k: 'users', l: 'Utenti' },
                        { k: 'events', l: 'Eventi live' },
                    ].map((t) => (
                        <button
                            key={t.k}
                            data-testid={`admin-tab-${t.k}`}
                            onClick={() => setTab(t.k)}
                            className={cn(
                                'px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] rounded-xl transition-colors',
                                tab === t.k
                                    ? 'bg-amber-500 text-black'
                                    : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
                            )}
                        >
                            {t.l}
                        </button>
                    ))}
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 sm:px-8 py-8 space-y-8">
                {tab === 'overview' && (
                    <OverviewTab kpis={kpis} funnel={funnel} topAssets={topAssets} />
                )}
                {tab === 'users' && <UsersTab />}
                {tab === 'events' && <EventsTab events={events} />}
            </main>
        </div>
    );
}

/* --------------------------------- OVERVIEW --------------------------------- */
function OverviewTab({ kpis, funnel, topAssets }) {
    if (!kpis) return <CenteredLoading label="Carico le metriche…" />;

    const kpiCards = [
        { label: 'Utenti totali', value: kpis.total_users, icon: Users, accent: 'text-white' },
        { label: 'Nuovi 7gg', value: kpis.new_users_7d, icon: UserPlus, accent: 'text-emerald-300' },
        { label: 'Attivi 7gg', value: kpis.active_7d, icon: Activity, accent: 'text-amber-300' },
        { label: 'Attivi 30gg', value: kpis.active_30d, icon: Activity, accent: 'text-amber-200' },
        { label: 'In Trial', value: kpis.trialing, icon: Clock, accent: 'text-sky-300' },
        { label: 'Sottoscrizioni attive', value: kpis.active_subs, icon: TrendingUp, accent: 'text-emerald-300' },
        { label: 'Past due', value: kpis.past_due, icon: TrendingUp, accent: 'text-rose-300' },
        { label: 'Canceled', value: kpis.canceled, icon: TrendingUp, accent: 'text-gray-400' },
        { label: 'Conversion', value: `${kpis.conversion_pct}%`, icon: BarChart3, accent: 'text-amber-300' },
        { label: 'MRR (USD)', value: `$${kpis.mrr_usd}`, icon: DollarSign, accent: 'text-emerald-300' },
    ];

    return (
        <>
            <Section title="KPI principali">
                <div data-testid="admin-kpi-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {kpiCards.map((c) => (
                        <div
                            key={c.label}
                            data-testid={`admin-kpi-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                            className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#13131a] to-[#0b0b10] p-4"
                        >
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-gray-500 font-bold mb-2">
                                <c.icon size={12} />
                                {c.label}
                            </div>
                            <div className={cn('font-mono text-[22px] font-bold tnum leading-none', c.accent)}>
                                {c.value}
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Funnel — ultimi 30 giorni">
                <FunnelChart funnel={funnel} />
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Asset più visti (30gg)">
                    <TopAssetsBars items={topAssets} />
                </Section>
                <Section title="Pagamenti — ultimi 90gg">
                    <RevenueSeries series={kpis.revenue_series_90d || []} />
                </Section>
            </div>
        </>
    );
}

function FunnelChart({ funnel }) {
    if (!funnel) return null;
    const steps = funnel.steps || [];
    const top = Math.max(1, ...steps.map((s) => s.count));
    return (
        <div data-testid="admin-funnel" className="rounded-2xl border border-white/10 bg-[#0b0b10] p-5">
            <div className="space-y-3">
                {steps.map((s, i) => {
                    const pct = (s.count / top) * 100;
                    return (
                        <div key={s.key} data-testid={`funnel-step-${s.key}`} className="flex items-center gap-4">
                            <div className="w-44 shrink-0">
                                <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500 font-bold">
                                    Step {i + 1}
                                </div>
                                <div className="text-[13px] text-white font-semibold">{s.label}</div>
                            </div>
                            <div className="flex-1 h-9 rounded-xl bg-white/[0.04] overflow-hidden relative">
                                <div
                                    className="h-full bg-gradient-to-r from-amber-500/80 to-amber-400/40"
                                    style={{ width: `${pct}%` }}
                                />
                                <div className="absolute inset-0 flex items-center px-3 font-mono text-[14px] font-bold text-white tnum">
                                    {s.count.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function TopAssetsBars({ items }) {
    const list = items || [];
    if (!list.length) {
        return (
            <div className="rounded-2xl border border-white/10 bg-[#0b0b10] p-6 text-center text-[13px] text-gray-500">
                Nessun asset_view registrato ancora.
            </div>
        );
    }
    const max = Math.max(1, ...list.map((x) => x.count));
    return (
        <div className="rounded-2xl border border-white/10 bg-[#0b0b10] p-4 space-y-2">
            {list.slice(0, 12).map((row) => (
                <div key={row.assetId} className="flex items-center gap-3">
                    <div className="w-20 shrink-0 text-[12px] font-mono text-amber-300">{row.assetId}</div>
                    <div className="flex-1 h-5 bg-white/[0.04] rounded-md overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-amber-500/70 to-amber-400/30"
                            style={{ width: `${(row.count / max) * 100}%` }}
                        />
                    </div>
                    <div className="w-12 text-right font-mono text-[12px] text-gray-300 tnum">{row.count}</div>
                </div>
            ))}
        </div>
    );
}

function RevenueSeries({ series }) {
    if (!series.length) {
        return (
            <div className="rounded-2xl border border-white/10 bg-[#0b0b10] p-6 text-center text-[13px] text-gray-500">
                Nessun pagamento Stripe ricevuto negli ultimi 90 giorni.
            </div>
        );
    }
    const max = Math.max(1, ...series.map((d) => d.payments));
    return (
        <div className="rounded-2xl border border-white/10 bg-[#0b0b10] p-4">
            <div className="flex items-end gap-1 h-32">
                {series.map((d) => (
                    <div
                        key={d.date}
                        title={`${d.date}: ${d.payments}`}
                        className="flex-1 bg-gradient-to-t from-amber-500/80 to-amber-400/30 rounded-t"
                        style={{ height: `${(d.payments / max) * 100}%` }}
                    />
                ))}
            </div>
        </div>
    );
}

/* --------------------------------- USERS ---------------------------------- */
function UsersTab() {
    const [data, setData] = useState({ items: [], total: 0, page: 1, per_page: 50 });
    const [q, setQ] = useState('');
    const [plan, setPlan] = useState('all');
    const [busy, setBusy] = useState(false);

    const load = async (override = {}) => {
        setBusy(true);
        try {
            const res = await adminApi.users({ q: override.q ?? q, plan: override.plan ?? plan, per_page: 50 });
            setData(res);
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <Section title={`Utenti (${data.total})`}>
                <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                        <Search size={14} className="text-gray-500" />
                        <input
                            data-testid="admin-user-search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && load()}
                            placeholder="Cerca per email, nome o user_id…"
                            className="flex-1 bg-transparent outline-none text-[13px] text-white placeholder:text-gray-500"
                        />
                    </div>
                    <select
                        data-testid="admin-plan-filter"
                        value={plan}
                        onChange={(e) => {
                            setPlan(e.target.value);
                            load({ plan: e.target.value });
                        }}
                        className="bg-[#0b0b10] border border-white/10 rounded-2xl px-3 py-2.5 text-[12px] uppercase tracking-[0.18em]"
                    >
                        <option value="all">Tutti</option>
                        <option value="free">Free</option>
                        <option value="trialing">Trial</option>
                        <option value="active">Active</option>
                        <option value="past_due">Past Due</option>
                        <option value="canceled">Canceled</option>
                    </select>
                    <button
                        onClick={() => load()}
                        data-testid="admin-user-search-btn"
                        disabled={busy}
                        className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-[0.18em] text-[12px] disabled:opacity-60"
                    >
                        Filtra
                    </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0b0b10]">
                    <table data-testid="admin-users-table" className="w-full text-[13px]">
                        <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.22em] text-gray-500">
                            <tr>
                                <Th>Email</Th>
                                <Th>Plan</Th>
                                <Th>Trial fino al</Th>
                                <Th>Periodo fino al</Th>
                                <Th>Fav</Th>
                                <Th>Registrato</Th>
                                <Th>Ultimo login</Th>
                                <Th>Azioni</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.items.map((u) => (
                                <UserRow key={u.user_id} u={u} reload={load} />
                            ))}
                            {data.items.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="text-center text-gray-500 py-8">
                                        Nessun utente trovato.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Section>
        </>
    );
}

function UserRow({ u, reload }) {
    const planColor = {
        active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        trialing: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        past_due: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        canceled: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
        free: 'bg-white/10 text-gray-300 border-white/10',
    }[u.subscription_status] || 'bg-white/10 text-gray-300 border-white/10';

    const onExtend = async () => {
        await adminApi.extendTrial(u.user_id, 7);
        await reload();
    };
    const onPromote = async () => {
        await adminApi.setRole(u.user_id, u.role === 'admin' ? 'user' : 'admin');
        await reload();
    };
    const onDelete = async () => {
        if (!window.confirm(`Eliminare l'utente ${u.email}?`)) return;
        await adminApi.deleteUser(u.user_id);
        await reload();
    };

    return (
        <tr data-testid={`admin-user-row-${u.user_id}`} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
            <Td>
                <div className="flex items-center gap-2">
                    <span className={cn(u.role === 'admin' && 'text-amber-300 font-semibold')}>{u.email}</span>
                    {u.role === 'admin' && (
                        <span className="text-[9px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            admin
                        </span>
                    )}
                </div>
                <div className="text-[10px] text-gray-500 font-mono">{u.user_id}</div>
            </Td>
            <Td>
                <span className={cn('text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-full border', planColor)}>
                    {u.subscription_status}
                </span>
            </Td>
            <Td className="font-mono text-[11px]">{fmtDate(u.trial_ends_at)}</Td>
            <Td className="font-mono text-[11px]">{fmtDate(u.current_period_end)}</Td>
            <Td className="font-mono text-[11px] tnum">{u.favorites_count}</Td>
            <Td className="font-mono text-[11px]">{fmtDate(u.created_at)}</Td>
            <Td className="font-mono text-[11px]">{fmtDate(u.last_login_at)}</Td>
            <Td>
                <div className="flex items-center gap-1.5">
                    <button
                        data-testid={`admin-extend-${u.user_id}`}
                        onClick={onExtend}
                        title="Estendi trial 7gg"
                        className="p-1.5 rounded-lg hover:bg-amber-500/15 text-amber-300 border border-white/5"
                    >
                        <Clock size={13} />
                    </button>
                    <button
                        data-testid={`admin-role-${u.user_id}`}
                        onClick={onPromote}
                        title={u.role === 'admin' ? 'Demote a user' : 'Promuovi admin'}
                        className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-300 border border-white/5"
                    >
                        <Shield size={13} />
                    </button>
                    <button
                        data-testid={`admin-delete-${u.user_id}`}
                        onClick={onDelete}
                        title="Elimina"
                        className="p-1.5 rounded-lg hover:bg-rose-500/15 text-rose-300 border border-white/5"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            </Td>
        </tr>
    );
}

/* --------------------------------- EVENTS ---------------------------------- */
function EventsTab({ events }) {
    const [filter, setFilter] = useState('');
    const filtered = useMemo(
        () => (filter ? events.filter((e) => e.type === filter) : events),
        [events, filter]
    );
    const types = useMemo(() => Array.from(new Set(events.map((e) => e.type))), [events]);
    return (
        <Section title={`Eventi live — ultimi ${events.length}`}>
            <div className="flex items-center gap-2 mb-4">
                <button
                    onClick={() => setFilter('')}
                    className={cn(
                        'px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.18em]',
                        filter === '' ? 'bg-amber-500 text-black' : 'bg-white/[0.05] text-gray-300 hover:text-white'
                    )}
                >
                    Tutti
                </button>
                {types.map((tp) => (
                    <button
                        key={tp}
                        onClick={() => setFilter(tp)}
                        className={cn(
                            'px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.18em]',
                            filter === tp ? 'bg-amber-500 text-black' : 'bg-white/[0.05] text-gray-300 hover:text-white'
                        )}
                    >
                        {tp}
                    </button>
                ))}
            </div>
            <div data-testid="admin-events-list" className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0b0b10]">
                <table className="w-full text-[12px]">
                    <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.22em] text-gray-500">
                        <tr>
                            <Th>Quando</Th>
                            <Th>Tipo</Th>
                            <Th>Utente</Th>
                            <Th>IP</Th>
                            <Th>Meta</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((e, i) => (
                            <tr key={i} className="border-t border-white/[0.05]">
                                <Td className="font-mono text-[11px]">{fmtDate(e.ts)}</Td>
                                <Td>
                                    <span className="text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                        {e.type}
                                    </span>
                                </Td>
                                <Td className="text-[11px]">{e.email || <span className="text-gray-500">anon</span>}</Td>
                                <Td className="font-mono text-[11px] text-gray-400">{e.ip || '—'}</Td>
                                <Td className="font-mono text-[10px] text-gray-500 max-w-[300px] truncate">
                                    {e.meta ? JSON.stringify(e.meta) : '—'}
                                </Td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-gray-500">
                                    Nessun evento.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Section>
    );
}

/* --------------------------------- Helpers --------------------------------- */
function Section({ title, children }) {
    return (
        <section>
            <div className="text-[11px] tracking-[0.28em] uppercase font-bold text-amber-400 mb-3">{title}</div>
            {children}
        </section>
    );
}

function Th({ children }) {
    return <th className="text-left px-4 py-3 font-semibold">{children}</th>;
}
function Td({ children, className = '' }) {
    return <td className={cn('px-4 py-3', className)}>{children}</td>;
}

function fmtDate(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
}
