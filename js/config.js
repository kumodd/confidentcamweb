// ============================================
// SUPABASE CONFIGURATION
// ============================================

const SUPABASE_CONFIG = {
    url: 'https://govbpayonsbfwrfxzbgq.supabase.co',
    anonKey: 'sb_publishable_Bg4FZF-KFlpRfX4Oqt9V4A_oWtvysow'
};

// App Configuration
const APP_CONFIG = {
    appName: 'Confident Creator',
    siteUrl: 'https://confidentcreator.app',
    version: '1.0.0',
    sessionPollInterval: 2000, // 2 seconds for QR polling
    sessionTimeout: 300000, // 5 minutes
    defaultTeleprompterSpeed: 50, // pixels per second

    // Login Method Flags
    enableQRLogin: true,      // Set to false to hide QR login tab
    enableEmailLogin: false,   // Set to false to hide email login/signup tab

    // Landing Page Dynamic CMS Override
    // Disabled by default until stale Supabase landing_content / landing_testimonials rows are updated via /admin
    enableDynamicLandingContent: false,

    // How to Use App — YouTube video URL
    howToUseVideoUrl: '',  // Set your YouTube URL here e.g. 'https://youtu.be/xxx'

    // Privacy-first Analytics & AI Referral Tracking (configure your IDs to enable external reporting)
    ga4MeasurementId: '',  // e.g. 'G-XXXXXXXXXX'
    plausibleDomain: '',   // e.g. 'confidentcreator.app'
};

// Export for use in other modules
window.SUPABASE_CONFIG = SUPABASE_CONFIG;
window.APP_CONFIG = APP_CONFIG;
