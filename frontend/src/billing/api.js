import axios from 'axios';
import { trackConversion } from '../analytics';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ax = axios.create({ baseURL: API, withCredentials: true, timeout: 20000 });

/**
 * Redirect the user to the Stripe Payment Link.
 * Requires the user to be authenticated (cookie). Throws on failure.
 */
export async function startCheckout() {
    const { data } = await ax.post('/billing/checkout', {
        origin_url: window.location.origin,
    });
    if (data?.url) {
        // Google Ads conversion: user about to land on Stripe Checkout.
        // Fire BEFORE the redirect so the tag has time to send.
        try { trackConversion('trial_start', { value: 24.99, currency: 'USD' }); } catch {}
        window.location.href = data.url;
    } else {
        throw new Error('No checkout URL');
    }
}

/**
 * Open the Stripe Customer Portal in the same tab.
 * User must have an active stripe_customer_id.
 */
export async function openBillingPortal() {
    const { data } = await ax.post('/billing/portal', {
        origin_url: window.location.origin,
    });
    if (data?.url) {
        window.location.href = data.url;
    } else {
        throw new Error('No portal URL');
    }
}

/** Pull a fresh subscription status from Stripe via our backend. */
export async function fetchBillingStatus() {
    const { data } = await ax.get('/billing/status');
    return data;
}
