// ============================================
// SUPABASE CLIENT INITIALIZATION
// ============================================

let supabaseClient = null;

function initSupabase() {
    if (supabaseClient) return supabaseClient;

    const { createClient } = supabase;
    supabaseClient = createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );

    console.log('✅ Supabase client initialized');
    return supabaseClient;
}

function getSupabase() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

// Export
window.initSupabase = initSupabase;
window.getSupabase = getSupabase;
