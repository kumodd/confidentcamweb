// ============================================
// SCRIPTS SERVICE
// CRUD operations for content_scripts
// ============================================

class ScriptsService {
    constructor() {
        this.supabase = null;
        this.cache = [];
    }

    init() {
        this.supabase = getSupabase();
        return this;
    }

    // ============================================
    // READ OPERATIONS
    // ============================================

    async getScripts(userId) {
        try {
            const { data, error } = await this.supabase
                .from('content_scripts')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.cache = data || [];
            return { success: true, scripts: this.cache };
        } catch (error) {
            console.error('Failed to fetch scripts:', error);
            return { success: false, error: error.message };
        }
    }

    async getScriptById(scriptId) {
        try {
            const { data, error } = await this.supabase
                .from('content_scripts')
                .select('*')
                .eq('id', scriptId)
                .single();

            if (error) throw error;
            return { success: true, script: data };
        } catch (error) {
            console.error('Failed to fetch script:', error);
            return { success: false, error: error.message };
        }
    }

    getRecentScripts(limit = 5) {
        return this.cache.slice(0, limit);
    }

    getStats() {
        const total = this.cache.length;
        const recorded = this.cache.filter(s => s.is_recorded).length;
        const pending = total - recorded;

        return { total, recorded, pending };
    }

    // ============================================
    // CREATE OPERATIONS
    // ============================================

    async createScript(userId, scriptData) {
        try {
            const newScript = {
                user_id: userId,
                title: scriptData.title,
                part1: scriptData.part1 || '',
                part2: scriptData.part2 || '',
                part3: scriptData.part3 || '',
                prompt_template: scriptData.prompt_template || null,
                questionnaire: scriptData.questionnaire || null,
                is_recorded: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('content_scripts')
                .insert(newScript)
                .select()
                .single();

            if (error) throw error;

            // Update cache
            this.cache.unshift(data);

            return { success: true, script: data };
        } catch (error) {
            console.error('Failed to create script:', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // UPDATE OPERATIONS
    // ============================================

    async updateScript(scriptId, updates) {
        try {
            const updateData = {
                ...updates,
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('content_scripts')
                .update(updateData)
                .eq('id', scriptId)
                .select()
                .single();

            if (error) throw error;

            // Update cache
            const index = this.cache.findIndex(s => s.id === scriptId);
            if (index !== -1) {
                this.cache[index] = data;
            }

            return { success: true, script: data };
        } catch (error) {
            console.error('Failed to update script:', error);
            return { success: false, error: error.message };
        }
    }

    async markAsRecorded(scriptId) {
        return this.updateScript(scriptId, { is_recorded: true });
    }

    // ============================================
    // DELETE OPERATIONS
    // ============================================

    async deleteScript(scriptId) {
        try {
            const { error } = await this.supabase
                .from('content_scripts')
                .delete()
                .eq('id', scriptId);

            if (error) throw error;

            // Update cache
            this.cache = this.cache.filter(s => s.id !== scriptId);

            return { success: true };
        } catch (error) {
            console.error('Failed to delete script:', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // SEARCH & FILTER
    // ============================================

    searchScripts(query) {
        const lowerQuery = query.toLowerCase();
        return this.cache.filter(script =>
            script.title.toLowerCase().includes(lowerQuery) ||
            script.part1.toLowerCase().includes(lowerQuery) ||
            script.part2.toLowerCase().includes(lowerQuery) ||
            script.part3.toLowerCase().includes(lowerQuery)
        );
    }

    filterByStatus(isRecorded) {
        return this.cache.filter(script => script.is_recorded === isRecorded);
    }
}

// Create global instance
window.scriptsService = new ScriptsService();
