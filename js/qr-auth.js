// ============================================
// QR AUTHENTICATION SERVICE
// WhatsApp-style QR login for web portal
// ============================================

class QRAuthService {
    constructor() {
        this.supabase = null;
        this.sessionToken = null;
        this.pollInterval = null;
        this.onAuthenticated = null;
        this.onExpired = null;
    }

    init() {
        this.supabase = getSupabase();
        return this;
    }

    // Generate unique session token
    _generateToken() {
        return 'cc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    }

    // ============================================
    // Create QR Session
    // ============================================

    async createSession() {
        this.sessionToken = this._generateToken();

        try {
            const { data, error } = await this.supabase
                .from('web_sessions')
                .insert({
                    session_token: this.sessionToken,
                    status: 'pending',
                    device_info: {
                        userAgent: navigator.userAgent,
                        platform: navigator.platform,
                        timestamp: new Date().toISOString()
                    }
                })
                .select()
                .single();

            if (error) throw error;

            console.log('✅ QR session created:', this.sessionToken);
            return {
                success: true,
                sessionToken: this.sessionToken,
                expiresAt: data.expires_at
            };
        } catch (error) {
            console.error('Failed to create QR session:', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // Generate QR Code Data
    // ============================================

    getQRData() {
        // Data to encode in QR - will be scanned by mobile app
        return JSON.stringify({
            type: 'cc_web_auth',
            token: this.sessionToken,
            origin: window.location.origin,
            timestamp: Date.now()
        });
    }

    // ============================================
    // Poll for Authentication
    // ============================================

    startPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        console.log('🔄 Starting QR session polling...');

        this.pollInterval = setInterval(async () => {
            await this._checkSession();
        }, APP_CONFIG.sessionPollInterval);

        // Also check immediately
        this._checkSession();
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            console.log('⏹️ Stopped QR session polling');
        }
    }

    async _checkSession() {
        if (!this.sessionToken) return;

        try {
            const { data, error } = await this.supabase
                .from('web_sessions')
                .select('*')
                .eq('session_token', this.sessionToken)
                .single();

            if (error) throw error;

            if (data.status === 'authenticated' && data.user_id) {
                console.log('✅ Session authenticated by mobile app!');
                this.stopPolling();

                // Sign in using the authenticated user's session
                await this._handleAuthentication(data.user_id);

            } else if (data.status === 'expired' || new Date(data.expires_at) < new Date()) {
                console.log('⏰ Session expired');
                this.stopPolling();

                if (this.onExpired) {
                    this.onExpired();
                }
            }
        } catch (error) {
            console.error('Error checking session:', error);
        }
    }

    async _handleAuthentication(userId) {
        // The mobile app has authenticated this session
        // Fetch user profile and store locally

        try {
            // Fetch user profile from users table
            let userProfile = { id: userId };

            try {
                const { data: userData, error } = await this.supabase
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (!error && userData) {
                    userProfile = {
                        id: userId,
                        email: userData.email,
                        displayName: userData.display_name || userData.email?.split('@')[0] || 'User'
                    };
                }
            } catch (e) {
                console.log('Could not fetch user profile, using minimal data');
            }

            // Store authenticated session info with user profile
            localStorage.setItem('cc_qr_auth', JSON.stringify({
                userId: userProfile.id,
                email: userProfile.email,
                displayName: userProfile.displayName,
                sessionToken: this.sessionToken,
                authenticatedAt: new Date().toISOString()
            }));

            console.log('✅ QR auth data stored:', userProfile);

            if (this.onAuthenticated) {
                this.onAuthenticated(userId);
            }
        } catch (error) {
            console.error('Error handling authentication:', error);
        }
    }

    // ============================================
    // Cleanup
    // ============================================

    async cleanup() {
        this.stopPolling();

        if (this.sessionToken) {
            try {
                await this.supabase
                    .from('web_sessions')
                    .update({ status: 'expired' })
                    .eq('session_token', this.sessionToken);
            } catch (error) {
                console.error('Error cleaning up session:', error);
            }
        }

        this.sessionToken = null;
    }
}

// Create global instance
window.qrAuthService = new QRAuthService();
