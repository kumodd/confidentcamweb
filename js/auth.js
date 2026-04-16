// ============================================
// AUTHENTICATION SERVICE
// ============================================

class AuthService {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.isQRAuthenticated = false;
        this.onAuthStateChange = null;
    }

    init() {
        this.supabase = getSupabase();
        this._checkQRAuth(); // Check QR auth FIRST before Supabase listener
        this._setupAuthListener();
        return this;
    }

    _setupAuthListener() {
        this.supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);

            // Don't override QR auth user with null from Supabase
            if (session?.user) {
                this.currentUser = session.user;
                this.isQRAuthenticated = false; // Supabase auth takes precedence
            } else if (!this.isQRAuthenticated) {
                this.currentUser = null;
            }

            if (this.onAuthStateChange) {
                this.onAuthStateChange(event, session);
            }

            // Handle auth events
            if (event === 'SIGNED_IN') {
                this._onSignIn(session);
            } else if (event === 'SIGNED_OUT') {
                this._onSignOut();
            }
        });
    }

    _checkQRAuth() {
        const qrAuth = localStorage.getItem('cc_qr_auth');
        if (qrAuth) {
            try {
                const data = JSON.parse(qrAuth);
                if (data.userId) {
                    this.isQRAuthenticated = true;
                    // Create a minimal user object for QR auth
                    this.currentUser = {
                        id: data.userId,
                        email: data.email || '',
                        user_metadata: { display_name: data.displayName || 'User' }
                    };
                    console.log('✅ QR authenticated user found:', data.userId);
                    return true;
                }
            } catch (e) {
                console.error('Error parsing QR auth data:', e);
                localStorage.removeItem('cc_qr_auth');
            }
        }
        return false;
    }

    _onSignIn(session) {
        console.log('✅ User signed in:', session.user.email);
        localStorage.setItem('cc_auth_session', JSON.stringify(session));
        // Clear QR auth if user signs in normally
        localStorage.removeItem('cc_qr_auth');
        this.isQRAuthenticated = false;
    }

    _onSignOut() {
        console.log('👋 User signed out');
        localStorage.removeItem('cc_auth_session');
        localStorage.removeItem('cc_qr_auth');
        this.isQRAuthenticated = false;
        this.currentUser = null;
    }

    // ============================================
    // Email/Password Authentication
    // ============================================

    async signInWithEmail(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            return { success: true, user: data.user };
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, error: error.message };
        }
    }

    async signUp(email, password, displayName) {
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        display_name: displayName
                    }
                }
            });

            if (error) throw error;
            return { success: true, user: data.user };
        } catch (error) {
            console.error('Sign up error:', error);
            return { success: false, error: error.message };
        }
    }

    async signOut() {
        try {
            await this.supabase.auth.signOut();

            // Clear all auth data
            localStorage.removeItem('cc_qr_auth');
            localStorage.removeItem('cc_auth_session');
            this.isQRAuthenticated = false;
            this.currentUser = null;

            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            // Still clear local data even if Supabase fails
            localStorage.removeItem('cc_qr_auth');
            localStorage.removeItem('cc_auth_session');
            this.isQRAuthenticated = false;
            this.currentUser = null;
            return { success: true };
        }
    }

    async resetPassword(email) {
        try {
            const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html'
            });
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Reset password error:', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // Session Management
    // ============================================

    async getSession() {
        const { data: { session } } = await this.supabase.auth.getSession();
        return session;
    }

    async getUser() {
        // If we have a QR authenticated user, return it immediately
        if (this.isQRAuthenticated && this.currentUser) {
            return this.currentUser;
        }

        // Otherwise check Supabase
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) {
            this.currentUser = user;
            return user;
        }

        return this.currentUser; // Return whatever we have
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    // ============================================
    // Auth Guard - Redirect if not authenticated
    // ============================================

    async requireAuth() {
        // Check QR auth first (synchronous, already loaded in init)
        if (this.isQRAuthenticated && this.currentUser) {
            console.log('✅ Using QR authentication for:', this.currentUser.id);
            return true;
        }

        // Check Supabase session
        const session = await this.getSession();
        if (session) {
            this.currentUser = session.user;
            return true;
        }

        // Not authenticated, redirect to login
        console.log('❌ Not authenticated, redirecting to login');
        window.location.href = 'login.html';
        return false;
    }

    async redirectIfAuthenticated() {
        // Check QR auth first
        if (this.isQRAuthenticated && this.currentUser) {
            console.log('Already QR authenticated, redirecting to dashboard');
            window.location.href = 'dashboard.html';
            return true;
        }

        // Check Supabase session
        const session = await this.getSession();
        if (session) {
            window.location.href = 'dashboard.html';
            return true;
        }

        return false;
    }
}

// Create global instance
window.authService = new AuthService();
