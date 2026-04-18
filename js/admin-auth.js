// ============================================
// ADMIN AUTHENTICATION SERVICE
// ============================================

class AdminAuth {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.isAdmin = false;
        this.adminRole = null;
    }

    init() {
        this.supabase = getSupabase();
        return this;
    }

    /**
     * Sign in with email + password, then verify admin role.
     */
    async signIn(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            // Verify this user is in admin_users table
            const isAdmin = await this.verifyAdmin();
            if (!isAdmin) {
                // Sign out — not an admin
                await this.supabase.auth.signOut();
                return { success: false, error: 'Not authorized. This account does not have admin access.' };
            }

            this.currentUser = data.user;
            return { success: true, user: data.user, role: this.adminRole };
        } catch (error) {
            console.error('Admin sign in error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if the currently authenticated user exists in admin_users table.
     */
    async verifyAdmin() {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) return false;

            const { data, error } = await this.supabase
                .from('admin_users')
                .select('user_id, email, role')
                .eq('user_id', user.id)
                .single();

            if (error || !data) {
                this.isAdmin = false;
                this.adminRole = null;
                return false;
            }

            this.isAdmin = true;
            this.adminRole = data.role;
            this.currentUser = user;
            return true;
        } catch (e) {
            console.error('Admin verification failed:', e);
            return false;
        }
    }

    /**
     * Sign out and clear state.
     */
    async signOut() {
        try {
            await this.supabase.auth.signOut();
        } catch (e) {
            console.error('Sign out error:', e);
        }
        this.currentUser = null;
        this.isAdmin = false;
        this.adminRole = null;
    }

    /**
     * Auth guard for admin pages. Call on page load.
     * Redirects to admin/login.html if not authenticated or not admin.
     */
    async requireAdmin() {
        // Check Supabase session
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return false;
        }

        // Verify admin role
        const isAdmin = await this.verifyAdmin();
        if (!isAdmin) {
            await this.supabase.auth.signOut();
            window.location.href = 'login.html?error=not_admin';
            return false;
        }

        return true;
    }

    /**
     * Redirect to dashboard if already authenticated as admin.
     */
    async redirectIfAdmin() {
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            const isAdmin = await this.verifyAdmin();
            if (isAdmin) {
                window.location.href = 'index.html';
                return true;
            }
        }
        return false;
    }

    getUser() {
        return this.currentUser;
    }

    getRole() {
        return this.adminRole;
    }
}

// Create global instance
window.adminAuth = new AdminAuth();
