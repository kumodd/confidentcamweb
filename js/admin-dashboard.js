// ============================================
// ADMIN DASHBOARD CONTROLLER
// ============================================

class AdminDashboard {
    constructor() {
        this.supabase = null;
        this.configData = [];
        this.promptsData = [];
        this.flagsData = [];
        this.currentCategory = 'all';
        this.editingKey = null;
    }

    async init() {
        this.supabase = getSupabase();

        // Setup navigation
        this._setupTabs();
        this._setupUserInfo();

        // Load overview by default
        await this.loadOverview();
    }

    // ============================================
    // TAB NAVIGATION
    // ============================================

    _setupTabs() {
        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = item.dataset.tab;
                this._switchTab(tab);
            });
        });
    }

    _switchTab(tabId) {
        // Update nav
        document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');

        // Update content
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tabId}`)?.classList.add('active');

        // Load data for tab
        switch (tabId) {
            case 'overview': this.loadOverview(); break;
            case 'app-config': this.loadAppConfig(); break;
            case 'prompts': this.loadPrompts(); break;
            case 'flags': this.loadFlags(); break;
        }
    }

    _setupUserInfo() {
        const user = adminAuth.getUser();
        const role = adminAuth.getRole();
        if (user) {
            const el = document.getElementById('admin-email');
            if (el) el.textContent = user.email;
            const roleEl = document.getElementById('admin-role');
            if (roleEl) roleEl.textContent = role || 'admin';
        }

        document.getElementById('admin-logout')?.addEventListener('click', async () => {
            await adminAuth.signOut();
            window.location.href = 'login.html';
        });
    }

    // ============================================
    // OVERVIEW TAB
    // ============================================

    async loadOverview() {
        try {
            const [configRes, promptsRes, flagsRes] = await Promise.all([
                this.supabase.from('app_config').select('key, category, is_active, updated_at'),
                this.supabase.from('prompt_templates').select('prompt_key, version, is_active, updated_at'),
                this.supabase.from('feature_flags').select('flag_key, is_enabled, updated_at'),
            ]);

            const configCount = configRes.data?.length || 0;
            const promptCount = promptsRes.data?.length || 0;
            const flagsEnabled = flagsRes.data?.filter(f => f.is_enabled).length || 0;
            const flagsTotal = flagsRes.data?.length || 0;

            document.getElementById('stat-config-count').textContent = configCount;
            document.getElementById('stat-prompt-count').textContent = promptCount;
            document.getElementById('stat-flags-active').textContent = `${flagsEnabled}/${flagsTotal}`;

            // Categories breakdown
            const categories = {};
            configRes.data?.forEach(r => {
                categories[r.category] = (categories[r.category] || 0) + 1;
            });
            const catEl = document.getElementById('config-categories');
            if (catEl) {
                catEl.innerHTML = Object.entries(categories)
                    .map(([cat, count]) => `<span class="admin-badge">${cat} <strong>${count}</strong></span>`)
                    .join('');
            }
        } catch (e) {
            console.error('Failed to load overview:', e);
            this.showToast('Failed to load overview', 'error');
        }
    }

    // ============================================
    // APP CONFIG TAB
    // ============================================

    async loadAppConfig(category) {
        this.currentCategory = category || 'all';
        try {
            let query = this.supabase.from('app_config').select('*').order('category').order('key');
            if (this.currentCategory !== 'all') {
                query = query.eq('category', this.currentCategory);
            }
            const { data, error } = await query;
            if (error) throw error;
            this.configData = data || [];
            this._renderConfigTable();
            this._renderCategoryFilters();
        } catch (e) {
            console.error('Failed to load config:', e);
            this.showToast('Failed to load config', 'error');
        }
    }

    _renderCategoryFilters() {
        const categories = [...new Set(this.configData.map(r => r.category))];
        const container = document.getElementById('config-filters');
        if (!container) return;

        const allActive = this.currentCategory === 'all' ? 'active' : '';
        let html = `<button class="filter-pill ${allActive}" onclick="dashboard.loadAppConfig('all')">All</button>`;
        // Also show all known categories even if filtered
        const allCats = ['app_info', 'splash', 'theme', 'developer', 'ai', 'auth', 'video', 'challenge', 'network', 'cache', 'billing'];
        allCats.forEach(cat => {
            const active = this.currentCategory === cat ? 'active' : '';
            html += `<button class="filter-pill ${active}" onclick="dashboard.loadAppConfig('${cat}')">${cat}</button>`;
        });
        container.innerHTML = html;
    }

    _renderConfigTable() {
        const tbody = document.getElementById('config-table-body');
        if (!tbody) return;

        if (this.configData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No config entries found</td></tr>';
            return;
        }

        tbody.innerHTML = this.configData.map(row => `
            <tr id="row-${row.key}" class="${row.is_active ? '' : 'row-inactive'}">
                <td class="cell-key"><code>${row.key}</code></td>
                <td class="cell-value" id="val-${row.key}">
                    ${this._renderValueCell(row)}
                </td>
                <td><span class="type-badge">${row.value_type}</span></td>
                <td><span class="admin-badge">${row.category}</span></td>
                <td>
                    <label class="toggle-switch small">
                        <input type="checkbox" ${row.is_active ? 'checked' : ''}
                            onchange="dashboard.toggleConfigActive('${row.key}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td class="cell-actions">
                    <button class="btn btn-ghost btn-sm" onclick="dashboard.editConfigRow('${row.key}')" title="Edit">✏️</button>
                    <button class="btn btn-ghost btn-sm" onclick="dashboard.deleteConfigRow('${row.key}')" title="Delete">🗑️</button>
                </td>
            </tr>
        `).join('');
    }

    _renderValueCell(row) {
        const val = row.value || '';
        if (row.key === 'openai_api_key' && val.length > 10) {
            return `<span class="value-masked">${val.substring(0, 8)}...${val.substring(val.length - 4)}</span>`;
        }
        if (val.length > 60) {
            return `<span title="${val.replace(/"/g, '&quot;')}">${val.substring(0, 57)}...</span>`;
        }
        return `<span>${val}</span>`;
    }

    async editConfigRow(key) {
        const row = this.configData.find(r => r.key === key);
        if (!row) return;

        document.getElementById('edit-config-key').value = row.key;
        document.getElementById('edit-config-value').value = row.value;
        document.getElementById('edit-config-type').value = row.value_type;
        document.getElementById('edit-config-category').value = row.category;
        document.getElementById('edit-config-description').value = row.description || '';
        document.getElementById('edit-config-key').disabled = true;
        document.getElementById('config-modal-title').textContent = `Edit: ${key}`;

        this._showModal('config-edit-modal');
    }

    showAddConfigModal() {
        document.getElementById('edit-config-key').value = '';
        document.getElementById('edit-config-value').value = '';
        document.getElementById('edit-config-type').value = 'string';
        document.getElementById('edit-config-category').value = 'general';
        document.getElementById('edit-config-description').value = '';
        document.getElementById('edit-config-key').disabled = false;
        document.getElementById('config-modal-title').textContent = 'Add New Config';

        this._showModal('config-edit-modal');
    }

    async saveConfigRow() {
        const key = document.getElementById('edit-config-key').value.trim();
        const value = document.getElementById('edit-config-value').value;
        const valueType = document.getElementById('edit-config-type').value;
        const category = document.getElementById('edit-config-category').value.trim();
        const description = document.getElementById('edit-config-description').value.trim();

        if (!key) { this.showToast('Key is required', 'error'); return; }

        try {
            const { error } = await this.supabase.from('app_config').upsert({
                key,
                value,
                value_type: valueType,
                category,
                description: description || null,
                is_active: true,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });

            if (error) throw error;

            this._hideModal('config-edit-modal');
            this.showToast(`Config "${key}" saved`, 'success');
            await this.loadAppConfig(this.currentCategory);
        } catch (e) {
            console.error('Save config error:', e);
            this.showToast(`Failed to save: ${e.message}`, 'error');
        }
    }

    async deleteConfigRow(key) {
        if (!confirm(`Delete config "${key}"? This cannot be undone.`)) return;

        try {
            const { error } = await this.supabase.from('app_config').delete().eq('key', key);
            if (error) throw error;
            this.showToast(`Config "${key}" deleted`, 'success');
            await this.loadAppConfig(this.currentCategory);
        } catch (e) {
            this.showToast(`Failed to delete: ${e.message}`, 'error');
        }
    }

    async toggleConfigActive(key, isActive) {
        try {
            const { error } = await this.supabase.from('app_config')
                .update({ is_active: isActive, updated_at: new Date().toISOString() })
                .eq('key', key);
            if (error) throw error;
            this.showToast(`"${key}" ${isActive ? 'activated' : 'deactivated'}`, 'success');
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
        }
    }

    // ============================================
    // PROMPTS TAB
    // ============================================

    async loadPrompts() {
        try {
            const { data, error } = await this.supabase
                .from('prompt_templates')
                .select('*')
                .order('prompt_key');
            if (error) throw error;
            this.promptsData = data || [];
            this._renderPrompts();
        } catch (e) {
            this.showToast('Failed to load prompts', 'error');
        }
    }

    _renderPrompts() {
        const container = document.getElementById('prompts-container');
        if (!container) return;

        if (this.promptsData.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">No prompt templates found</p>';
            return;
        }

        container.innerHTML = this.promptsData.map(p => `
            <div class="prompt-card ${p.is_active ? '' : 'inactive'}">
                <div class="prompt-card-header">
                    <div>
                        <h3 class="prompt-key">${p.prompt_key}</h3>
                        <span class="admin-badge">v${p.version}</span>
                        ${p.is_active ? '<span class="status-dot active"></span>' : '<span class="status-dot"></span>'}
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="dashboard.editPrompt('${p.prompt_key}')">✏️ Edit</button>
                </div>
                ${p.system_prompt ? `
                <div class="prompt-section">
                    <label>System Prompt</label>
                    <pre class="prompt-preview">${this._truncate(p.system_prompt, 200)}</pre>
                </div>` : ''}
                ${p.user_prompt_template ? `
                <div class="prompt-section">
                    <label>User Prompt Template</label>
                    <pre class="prompt-preview">${this._truncate(p.user_prompt_template, 200)}</pre>
                </div>` : ''}
                <div class="prompt-meta">
                    <span class="text-muted">Updated: ${new Date(p.updated_at).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('');
    }

    _truncate(str, maxLen) {
        if (!str) return '';
        const escaped = str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (escaped.length <= maxLen) return escaped;
        return escaped.substring(0, maxLen) + '...';
    }

    editPrompt(key) {
        const prompt = this.promptsData.find(p => p.prompt_key === key);
        if (!prompt) return;

        document.getElementById('edit-prompt-key').value = prompt.prompt_key;
        document.getElementById('edit-prompt-key').disabled = true;
        document.getElementById('edit-prompt-system').value = prompt.system_prompt || '';
        document.getElementById('edit-prompt-user').value = prompt.user_prompt_template || '';
        document.getElementById('edit-prompt-version').textContent = `v${prompt.version}`;
        document.getElementById('prompt-modal-title').textContent = `Edit: ${key}`;

        this._showModal('prompt-edit-modal');
    }

    async savePrompt() {
        const key = document.getElementById('edit-prompt-key').value;
        const systemPrompt = document.getElementById('edit-prompt-system').value;
        const userTemplate = document.getElementById('edit-prompt-user').value;

        const prompt = this.promptsData.find(p => p.prompt_key === key);
        const newVersion = (prompt?.version || 0) + 1;

        try {
            const { error } = await this.supabase.from('prompt_templates')
                .update({
                    system_prompt: systemPrompt || null,
                    user_prompt_template: userTemplate,
                    version: newVersion,
                    updated_at: new Date().toISOString(),
                })
                .eq('prompt_key', key);

            if (error) throw error;

            this._hideModal('prompt-edit-modal');
            this.showToast(`Prompt "${key}" saved (v${newVersion})`, 'success');
            await this.loadPrompts();
        } catch (e) {
            this.showToast(`Failed to save: ${e.message}`, 'error');
        }
    }

    // ============================================
    // FEATURE FLAGS TAB
    // ============================================

    async loadFlags() {
        try {
            const { data, error } = await this.supabase
                .from('feature_flags')
                .select('*')
                .order('flag_key');
            if (error) throw error;
            this.flagsData = data || [];
            this._renderFlags();
        } catch (e) {
            this.showToast('Failed to load flags', 'error');
        }
    }

    _renderFlags() {
        const container = document.getElementById('flags-container');
        if (!container) return;

        container.innerHTML = this.flagsData.map(f => `
            <div class="flag-card">
                <div class="flag-info">
                    <h3 class="flag-key">${f.flag_key}</h3>
                    <p class="flag-desc text-muted">${f.description || 'No description'}</p>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${f.is_enabled ? 'checked' : ''}
                        onchange="dashboard.toggleFlag('${f.flag_key}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `).join('');
    }

    async toggleFlag(key, enabled) {
        try {
            const { error } = await this.supabase.from('feature_flags')
                .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
                .eq('flag_key', key);
            if (error) throw error;
            this.showToast(`"${key}" ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
            // Revert toggle
            const input = document.querySelector(`[onchange*="${key}"]`);
            if (input) input.checked = !enabled;
        }
    }

    // ============================================
    // MODAL HELPERS
    // ============================================

    _showModal(id) {
        document.getElementById(id)?.classList.add('active');
    }

    _hideModal(id) {
        document.getElementById(id)?.classList.remove('active');
    }

    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span class="toast-message">${message}</span>
        `;
        container.appendChild(toast);

        // Auto remove after 3s
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Global instance
window.dashboard = new AdminDashboard();
