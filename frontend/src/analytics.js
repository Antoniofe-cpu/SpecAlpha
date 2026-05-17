/**
 * Lightweight wrapper around Google Ads gtag for conversion tracking.
 * The base tag (AW-18169761925) is loaded in /public/index.html.
 *
 * Usage:
 *   import { trackConversion } from './analytics';
 *   trackConversion('signup');
 *   trackConversion('trial_start', { value: 24.99, currency: 'USD' });
 *
 * Conversion action labels (`send_to`) live in Google Ads → Conversions →
 * "Tag setup → Use Google Ads tag". Configure one per funnel step and map
 * them in CONVERSIONS below. Until you replace the placeholder labels with
 * real ones from Google Ads, the calls are no-ops so they never break.
 */

const GADS_ID = 'AW-18169761925';

// Map app events → Google Ads conversion labels.
// Replace 'LABEL_xxx' with the real labels Google Ads gives you for each
// conversion action (Conversions → Tag setup → "Use Google Ads tag" → copy
// the `send_to` value, e.g. "AW-18169761925/AbCdEfGh1234").
const CONVERSIONS = {
    signup:       null,                          // e.g. `${GADS_ID}/LABEL_signup`
    trial_start:  null,                          // e.g. `${GADS_ID}/LABEL_trial`
    subscription: null,                          // e.g. `${GADS_ID}/LABEL_paid`
};

function gtagAvail() {
    return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

/**
 * Fire a Google Ads conversion event. Safe no-op if gtag isn't loaded yet
 * (e.g. ad-blockers, slow networks) or the conversion label hasn't been
 * configured for the event.
 */
export function trackConversion(eventName, params = {}) {
    if (!gtagAvail()) return;
    const sendTo = CONVERSIONS[eventName];
    const payload = { ...params };
    if (sendTo) payload.send_to = sendTo;
    try {
        window.gtag('event', sendTo ? 'conversion' : eventName, payload);
    } catch (e) {
        // Never let analytics crash the app
        // eslint-disable-next-line no-console
        console.warn('gtag event failed', e);
    }
}

/** Fire a generic Google Ads page_view (already fired automatically by the
 *  base config, but useful for SPA navigations).
 */
export function trackPageView(path) {
    if (!gtagAvail()) return;
    try {
        window.gtag('event', 'page_view', {
            page_path: path || window.location.pathname,
            send_to: GADS_ID,
        });
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('gtag pageview failed', e);
    }
}
