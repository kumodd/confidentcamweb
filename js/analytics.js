// ============================================
// PRIVACY-RESPECTING ANALYTICS & AI REFERRAL TRACKING
// Detects organic search, AI discovery platforms, and CTA conversions.
// Respects Global Privacy Control (GPC) and Do Not Track (DNT).
// Sends external telemetry ONLY if ga4MeasurementId or plausibleDomain is set in APP_CONFIG.
// ============================================

(function () {
    'use strict';

    const AI_REFERRER_MAP = [
        { match: ['chatgpt.com', 'chat.openai.com'], source: 'chatgpt' },
        { match: ['perplexity.ai'], source: 'perplexity' },
        { match: ['gemini.google.com', 'bard.google.com'], source: 'gemini' },
        { match: ['copilot.microsoft.com', 'edgeservices.bing.com'], source: 'copilot' },
        { match: ['claude.ai'], source: 'claude' },
        { match: ['you.com'], source: 'you' },
        { match: ['phind.com'], source: 'phind' },
        { match: ['kagi.com'], source: 'kagi' },
    ];

    const SEARCH_REFERRER_MAP = [
        { match: ['google.'], source: 'google_search' },
        { match: ['bing.com'], source: 'bing_search' },
        { match: ['duckduckgo.com'], source: 'duckduckgo' },
        { match: ['search.yahoo.com'], source: 'yahoo' },
        { match: ['search.brave.com'], source: 'brave_search' },
        { match: ['ecosia.org'], source: 'ecosia' },
    ];

    function hasOptedOut() {
        try {
            if (navigator.globalPrivacyControl === true) return true;
            if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    function classifyAttribution() {
        const params = new URLSearchParams(window.location.search);
        const utmSource = (params.get('utm_source') || '').toLowerCase();
        const utmMedium = (params.get('utm_medium') || '').toLowerCase();
        const utmCampaign = params.get('utm_campaign') || '';
        const rawRef = document.referrer || '';

        let refHost = '';
        if (rawRef) {
            try {
                refHost = new URL(rawRef).hostname.toLowerCase();
            } catch (_) {
                refHost = '';
            }
        }

        let channel = 'direct';
        let source = 'direct';

        // Check UTM source first (e.g., ChatGPT Search appends utm_source=chatgpt.com)
        const combinedSignal = `${utmSource} ${refHost}`.trim();
        for (const entry of AI_REFERRER_MAP) {
            if (entry.match.some(domain => combinedSignal.includes(domain))) {
                channel = 'ai_discovery';
                source = entry.source;
                break;
            }
        }

        if (channel === 'direct' && refHost) {
            for (const entry of SEARCH_REFERRER_MAP) {
                if (entry.match.some(domain => refHost.includes(domain))) {
                    channel = 'organic_search';
                    source = entry.source;
                    break;
                }
            }
        }

        if (channel === 'direct' && utmSource) {
            channel = utmMedium || 'campaign';
            source = utmSource;
        } else if (channel === 'direct' && refHost && !refHost.includes('confidentcreator.app')) {
            if (refHost.includes('play.google.com')) {
                channel = 'app_store';
                source = 'google_play';
            } else if (refHost.includes('instagram.com') || refHost.includes('youtube.com') || refHost.includes('reddit.com') || refHost.includes('x.com') || refHost.includes('linkedin.com')) {
                channel = 'social_community';
                source = refHost.replace(/^www\./, '');
            } else {
                channel = 'referral';
                source = refHost.replace(/^www\./, '');
            }
        }

        return {
            channel,
            source,
            utm_source: utmSource || null,
            utm_medium: utmMedium || null,
            utm_campaign: utmCampaign || null,
            landing_path: window.location.pathname
        };
    }

    function getSessionAttribution() {
        const KEY = 'cc_session_attribution';
        try {
            const existing = sessionStorage.getItem(KEY);
            if (existing) return JSON.parse(existing);
            const computed = classifyAttribution();
            sessionStorage.setItem(KEY, JSON.stringify(computed));
            return computed;
        } catch (_) {
            return classifyAttribution();
        }
    }

    function loadExternalProviders(cfg) {
        if (!cfg || hasOptedOut()) return;

        if (cfg.ga4MeasurementId && !window.gtag) {
            window.dataLayer = window.dataLayer || [];
            window.gtag = function () { window.dataLayer.push(arguments); };
            window.gtag('js', new Date());
            window.gtag('config', cfg.ga4MeasurementId, {
                anonymize_ip: true,
                allow_google_signals: false,
                allow_ad_personalization_signals: false
            });

            const s = document.createElement('script');
            s.async = true;
            s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.ga4MeasurementId)}`;
            document.head.appendChild(s);
        }

        if (cfg.plausibleDomain && !window.plausible) {
            const s = document.createElement('script');
            s.defer = true;
            s.setAttribute('data-domain', cfg.plausibleDomain);
            s.src = 'https://plausible.io/js/script.tagged-events.js';
            document.head.appendChild(s);
        }
    }

    function trackEvent(eventName, props = {}) {
        if (hasOptedOut()) return;

        const attribution = getSessionAttribution();
        const payload = {
            ...props,
            discovery_channel: attribution.channel,
            discovery_source: attribution.source,
            page_path: window.location.pathname
        };

        if (typeof window.gtag === 'function') {
            window.gtag('event', eventName, payload);
        }
        if (typeof window.plausible === 'function') {
            window.plausible(eventName, { props: payload });
        }

        window.dispatchEvent(new CustomEvent('cc:analytics', {
            detail: { event: eventName, props: payload }
        }));
    }

    function bindCtaTracking() {
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-track-cta]');
            if (!target) return;
            const ctaName = target.getAttribute('data-track-cta');
            const destination = target.getAttribute('href') || target.getAttribute('id') || 'button';
            trackEvent('cta_click', {
                cta_name: ctaName,
                cta_destination: destination
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const cfg = window.APP_CONFIG || {};
        loadExternalProviders(cfg);
        const attribution = getSessionAttribution();
        trackEvent('page_discovery', {
            page_title: document.title,
            landing_path: attribution.landing_path
        });
        bindCtaTracking();
    });

    window.ccAnalytics = {
        trackEvent,
        getSessionAttribution,
        hasOptedOut
    };
})();
