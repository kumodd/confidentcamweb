// ============================================
// ADMIN DASHBOARD CONTROLLER
// ============================================

class AdminDashboard {
    constructor() {
        this.supabase = null;
        this.configData = [];
        this.knownCategories = new Set([
            'general', 'app_info', 'splash', 'theme', 'developer',
            'ai', 'auth', 'video', 'challenge', 'network', 'cache', 'billing'
        ]);
        this.promptsData = [];
        this.flagsData = [];
        this.guidesData = [];
        this.supportsExtendedGuideCols = false;
        this.currentCategory = 'all';
        this.editingKey = null;
        // Landing page state
        this.landingSections = {};
        this.landingFeatures = [];
        this.landingTestimonials = [];
        this.editingSectionKey = null;
        this.isEditingPrompt = false;
    }

    async init() {
        this.supabase = getSupabase();

        // Wire tabs, static modal buttons, ESC/backdrop handlers, and delegated actions
        this._setupTabs();
        this._setupUserInfo();
        this._setupStaticHandlers();
        this._setupDelegatedActions();
        this._setupModals();

        // Load overview by default
        await this.loadOverview();
    }

    // ============================================
    // SECURITY & VALIDATION HELPERS
    // ============================================

    /** Escape text safely for HTML and attribute interpolation */
    _esc(val) {
        return String(val ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Allow only safe CSS hex colors for inline swatch rendering */
    _safeHexColor(color, fallback = '#4E592B') {
        return typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color.trim())
            ? color.trim()
            : fallback;
    }

    /** Validate config value against its declared value_type before saving */
    _validateConfigValue(value, valueType) {
        const trimmed = String(value ?? '').trim();
        switch (valueType) {
            case 'json':
                try {
                    JSON.parse(trimmed);
                    return null;
                } catch {
                    return 'Invalid JSON syntax';
                }
            case 'int':
                return /^-?\d+$/.test(trimmed) ? null : 'Value must be an integer';
            case 'double':
                return trimmed !== '' && Number.isFinite(Number(trimmed)) ? null : 'Value must be a valid number';
            case 'bool':
                return /^(true|false)$/i.test(trimmed) ? null : 'Boolean value must be "true" or "false"';
            default:
                return null;
        }
    }

    // ============================================
    // TAB NAVIGATION & STATIC LISTENERS
    // ============================================

    _setupTabs() {
        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this._switchTab(item.dataset.tab);
            });
        });
    }

    _switchTab(tabId) {
        document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');

        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tabId}`)?.classList.add('active');

        switch (tabId) {
            case 'overview': this.loadOverview(); break;
            case 'app-config': this.loadAppConfig(this.currentCategory); break;
            case 'prompts': this.loadPrompts(); break;
            case 'flags': this.loadFlags(); break;
            case 'landing': this.loadLanding(); break;
            case 'guides': this.loadGuides(); break;
        }
    }

    _setupUserInfo() {
        const user = adminAuth.getUser();
        const role = adminAuth.getRole();
        if (user) {
            const emailEl = document.getElementById('admin-email');
            if (emailEl) emailEl.textContent = user.email;
            const roleEl = document.getElementById('admin-role');
            if (roleEl) roleEl.textContent = role || 'admin';
            const avatarEl = document.getElementById('admin-avatar');
            if (avatarEl && user.email) {
                avatarEl.textContent = user.email.trim().charAt(0).toUpperCase() || 'A';
            }
        }

        document.getElementById('admin-logout')?.addEventListener('click', async () => {
            await adminAuth.signOut();
            window.location.href = 'login.html';
        });
    }

    _setupStaticHandlers() {
        document.getElementById('add-config-btn')?.addEventListener('click', () => this.showAddConfigModal());
        document.getElementById('add-prompt-btn')?.addEventListener('click', () => this.showAddPromptModal());
        document.getElementById('add-feature-btn')?.addEventListener('click', () => this.showAddFeatureModal());
        document.getElementById('add-testimonial-btn')?.addEventListener('click', () => this.showAddTestimonialModal());
        document.getElementById('add-guide-btn')?.addEventListener('click', () => this.showAddGuideModal());

        document.getElementById('save-config-btn')?.addEventListener('click', () => this.saveConfigRow());
        document.getElementById('save-prompt-btn')?.addEventListener('click', () => this.savePrompt());
        document.getElementById('save-guide-btn')?.addEventListener('click', () => this.saveGuide());
        document.getElementById('save-section-btn')?.addEventListener('click', () => this.saveLandingSection());
        document.getElementById('save-feature-btn')?.addEventListener('click', () => this.saveLandingFeature());
        document.getElementById('save-testimonial-btn')?.addEventListener('click', () => this.saveLandingTestimonial());

        // Auto-generate guide_key from title when creating a new chapter
        const titleInput = document.getElementById('edit-guide-title');
        const keyInput = document.getElementById('edit-guide-key');
        titleInput?.addEventListener('input', () => {
            if (!document.getElementById('edit-guide-id')?.value && keyInput) {
                keyInput.value = titleInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            }
        });
    }

    /** Single delegated handler for all dynamic buttons & toggles (immune to quote/XSS injection) */
    _setupDelegatedActions() {
        const main = document.querySelector('.admin-main');
        if (!main) return;

        main.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const { action, key, id } = btn.dataset;

            switch (action) {
                case 'filter-config': this.loadAppConfig(key); break;
                case 'edit-config': this.editConfigRow(key); break;
                case 'delete-config': this.deleteConfigRow(key); break;
                case 'edit-prompt': this.editPrompt(key); break;
                case 'edit-section': this.editLandingSection(key); break;
                case 'edit-feature': this.editLandingFeature(id); break;
                case 'delete-feature': this.deleteLandingFeature(id); break;
                case 'edit-testimonial': this.editLandingTestimonial(id); break;
                case 'delete-testimonial': this.deleteLandingTestimonial(id); break;
                case 'edit-guide': this.editGuide(id); break;
                case 'delete-guide': this.deleteGuide(id); break;
            }
        });

        main.addEventListener('change', (e) => {
            const input = e.target.closest('input[type="checkbox"][data-toggle-action]');
            if (!input) return;
            const { toggleAction, key, id } = input.dataset;

            switch (toggleAction) {
                case 'config': this.toggleConfigActive(key, input.checked, input); break;
                case 'prompt': this.togglePromptActive(key, input.checked, input); break;
                case 'flag': this.toggleFlag(key, input.checked, input); break;
                case 'guide': this.toggleGuideActive(id, input.checked, input); break;
            }
        });
    }

    _setupModals() {
        // Close buttons
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => this._hideModal(btn.dataset.closeModal));
        });

        // Backdrop click dismiss
        document.querySelectorAll('.admin-modal').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    this._hideModal(backdrop.id);
                }
            });
        });

        // Escape key closes topmost open modal
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            document.querySelectorAll('.admin-modal.active').forEach(modal => {
                this._hideModal(modal.id);
            });
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

            if (configRes.error) throw configRes.error;
            if (promptsRes.error) throw promptsRes.error;
            if (flagsRes.error) throw flagsRes.error;

            const configCount = configRes.data?.length || 0;
            const promptCount = promptsRes.data?.length || 0;
            const flagsEnabled = flagsRes.data?.filter(f => f.is_enabled).length || 0;
            const flagsTotal = flagsRes.data?.length || 0;

            document.getElementById('stat-config-count').textContent = configCount;
            document.getElementById('stat-prompt-count').textContent = promptCount;
            document.getElementById('stat-flags-active').textContent = `${flagsEnabled}/${flagsTotal}`;

            const categories = {};
            (configRes.data || []).forEach(r => {
                const cat = r.category || 'general';
                categories[cat] = (categories[cat] || 0) + 1;
                this.knownCategories.add(cat);
            });
            const catEl = document.getElementById('config-categories');
            if (catEl) {
                catEl.innerHTML = Object.entries(categories)
                    .map(([cat, count]) => `<span class="admin-badge">${this._esc(cat)} <strong>${count}</strong></span>`)
                    .join('') || '<span class="text-muted">No config categories yet</span>';
            }
        } catch (e) {
            console.error('Failed to load overview:', e);
            this.showToast(`Failed to load overview: ${e.message}`, 'error');
            const catEl = document.getElementById('config-categories');
            if (catEl) catEl.textContent = 'Failed to load summary.';
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
            this.configData.forEach(r => {
                if (r.category) this.knownCategories.add(r.category);
            });
            this._renderConfigTable();
            this._renderCategoryFilters();
        } catch (e) {
            console.error('Failed to load config:', e);
            this.showToast(`Failed to load config: ${e.message}`, 'error');
            const tbody = document.getElementById('config-table-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Failed to load config entries</td></tr>';
            }
        }
    }

    _renderCategoryFilters() {
        const container = document.getElementById('config-filters');
        if (!container) return;

        const allActive = this.currentCategory === 'all' ? 'active' : '';
        let html = `<button type="button" class="filter-pill ${allActive}" data-action="filter-config" data-key="all">All</button>`;
        [...this.knownCategories].sort().forEach(cat => {
            const active = this.currentCategory === cat ? 'active' : '';
            const safeCat = this._esc(cat);
            html += `<button type="button" class="filter-pill ${active}" data-action="filter-config" data-key="${safeCat}">${safeCat}</button>`;
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

        tbody.innerHTML = this.configData.map(row => {
            const safeKey = this._esc(row.key);
            return `
                <tr data-config-row="${safeKey}" class="${row.is_active ? '' : 'row-inactive'}">
                    <td class="cell-key"><code>${safeKey}</code></td>
                    <td class="cell-value">${this._renderValueCell(row)}</td>
                    <td><span class="type-badge">${this._esc(row.value_type)}</span></td>
                    <td><span class="admin-badge">${this._esc(row.category)}</span></td>
                    <td>
                        <label class="toggle-switch small">
                            <input type="checkbox" ${row.is_active ? 'checked' : ''}
                                data-toggle-action="config" data-key="${safeKey}" aria-label="Toggle ${safeKey}">
                            <span class="toggle-slider"></span>
                        </label>
                    </td>
                    <td class="cell-actions">
                        <button type="button" class="btn btn-ghost btn-sm" data-action="edit-config" data-key="${safeKey}" title="Edit">✏️</button>
                        <button type="button" class="btn btn-ghost btn-sm" data-action="delete-config" data-key="${safeKey}" title="Delete">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    _renderValueCell(row) {
        const val = String(row.value ?? '');
        if (row.key === 'openai_api_key' && val.length > 10) {
            return `<span class="value-masked">${this._esc(val.substring(0, 8))}...${this._esc(val.substring(val.length - 4))}</span>`;
        }
        if (val.length > 60) {
            return `<span title="${this._esc(val)}">${this._esc(val.substring(0, 57))}...</span>`;
        }
        return `<span>${this._esc(val)}</span>`;
    }

    editConfigRow(key) {
        const row = this.configData.find(r => r.key === key);
        if (!row) return;

        this.editingKey = key;
        document.getElementById('edit-config-key').value = row.key;
        document.getElementById('edit-config-value').value = row.value ?? '';
        document.getElementById('edit-config-type').value = row.value_type;
        document.getElementById('edit-config-category').value = row.category || 'general';
        document.getElementById('edit-config-description').value = row.description || '';
        document.getElementById('edit-config-key').disabled = true;
        document.getElementById('config-modal-title').textContent = `Edit: ${key}`;

        this._showModal('config-edit-modal');
    }

    showAddConfigModal() {
        this.editingKey = null;
        document.getElementById('edit-config-key').value = '';
        document.getElementById('edit-config-value').value = '';
        document.getElementById('edit-config-type').value = 'string';
        document.getElementById('edit-config-category').value = this.currentCategory !== 'all' ? this.currentCategory : 'general';
        document.getElementById('edit-config-description').value = '';
        document.getElementById('edit-config-key').disabled = false;
        document.getElementById('config-modal-title').textContent = 'Add New Config';

        this._showModal('config-edit-modal');
    }

    async saveConfigRow() {
        const key = document.getElementById('edit-config-key').value.trim();
        const value = document.getElementById('edit-config-value').value;
        const valueType = document.getElementById('edit-config-type').value;
        const category = document.getElementById('edit-config-category').value.trim() || 'general';
        const description = document.getElementById('edit-config-description').value.trim();

        if (!key) { this.showToast('Key is required', 'error'); return; }

        const validationErr = this._validateConfigValue(value, valueType);
        if (validationErr) { this.showToast(validationErr, 'error'); return; }

        const existing = this.editingKey ? this.configData.find(r => r.key === this.editingKey) : null;
        const isActive = existing ? existing.is_active : true;

        try {
            const { error } = await this.supabase.from('app_config').upsert({
                key,
                value,
                value_type: valueType,
                category,
                description: description || null,
                is_active: isActive,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });

            if (error) throw error;

            this.knownCategories.add(category);
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

    async toggleConfigActive(key, isActive, checkboxEl) {
        const rowEl = checkboxEl?.closest('tr');
        try {
            const { error } = await this.supabase.from('app_config')
                .update({ is_active: isActive, updated_at: new Date().toISOString() })
                .eq('key', key);
            if (error) throw error;

            const item = this.configData.find(r => r.key === key);
            if (item) item.is_active = isActive;
            rowEl?.classList.toggle('row-inactive', !isActive);
            this.showToast(`"${key}" ${isActive ? 'activated' : 'deactivated'}`, 'success');
        } catch (e) {
            if (checkboxEl) checkboxEl.checked = !isActive;
            rowEl?.classList.toggle('row-inactive', isActive);
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
            this.showToast(`Failed to load prompts: ${e.message}`, 'error');
        }
    }

    _renderPrompts() {
        const container = document.getElementById('prompts-container');
        if (!container) return;

        if (this.promptsData.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">No prompt templates found</p>';
            return;
        }

        container.innerHTML = this.promptsData.map(p => {
            const safeKey = this._esc(p.prompt_key);
            return `
                <div class="prompt-card ${p.is_active ? '' : 'inactive'}">
                    <div class="prompt-card-header">
                        <div>
                            <h3 class="prompt-key">${safeKey}</h3>
                            <span class="admin-badge">v${Number(p.version) || 1}</span>
                            <span class="status-dot ${p.is_active ? 'active' : ''}"></span>
                        </div>
                        <div>
                            <label class="toggle-switch small" title="Toggle active">
                                <input type="checkbox" ${p.is_active ? 'checked' : ''}
                                    data-toggle-action="prompt" data-key="${safeKey}" aria-label="Toggle ${safeKey}">
                                <span class="toggle-slider"></span>
                            </label>
                            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-prompt" data-key="${safeKey}">✏️ Edit</button>
                        </div>
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
                        <span class="text-muted">Updated: ${p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    _truncate(str, maxLen) {
        if (!str) return '';
        const text = String(str);
        const sliced = text.length <= maxLen ? text : `${text.substring(0, maxLen)}...`;
        return this._esc(sliced);
    }

    showAddPromptModal() {
        this.isEditingPrompt = false;
        const keyInput = document.getElementById('edit-prompt-key');
        keyInput.value = '';
        keyInput.disabled = false;
        document.getElementById('edit-prompt-system').value = '';
        document.getElementById('edit-prompt-user').value = '';
        document.getElementById('edit-prompt-version').textContent = 'v1';
        document.getElementById('prompt-modal-title').textContent = 'Add Prompt Template';
        this._showModal('prompt-edit-modal');
    }

    editPrompt(key) {
        const prompt = this.promptsData.find(p => p.prompt_key === key);
        if (!prompt) return;

        this.isEditingPrompt = true;
        const keyInput = document.getElementById('edit-prompt-key');
        keyInput.value = prompt.prompt_key;
        keyInput.disabled = true;
        document.getElementById('edit-prompt-system').value = prompt.system_prompt || '';
        document.getElementById('edit-prompt-user').value = prompt.user_prompt_template || '';
        document.getElementById('edit-prompt-version').textContent = `v${prompt.version}`;
        document.getElementById('prompt-modal-title').textContent = `Edit: ${key}`;

        this._showModal('prompt-edit-modal');
    }

    async savePrompt() {
        const key = document.getElementById('edit-prompt-key').value.trim();
        const systemPrompt = document.getElementById('edit-prompt-system').value;
        const userTemplate = document.getElementById('edit-prompt-user').value;

        if (!key) { this.showToast('Prompt key is required', 'error'); return; }

        const prompt = this.promptsData.find(p => p.prompt_key === key);
        const newVersion = this.isEditingPrompt ? ((prompt?.version || 0) + 1) : 1;

        try {
            if (this.isEditingPrompt) {
                const { error } = await this.supabase.from('prompt_templates')
                    .update({
                        system_prompt: systemPrompt || null,
                        user_prompt_template: userTemplate,
                        version: newVersion,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('prompt_key', key);
                if (error) throw error;
            } else {
                const { error } = await this.supabase.from('prompt_templates')
                    .insert({
                        prompt_key: key,
                        system_prompt: systemPrompt || null,
                        user_prompt_template: userTemplate,
                        version: 1,
                        is_active: true,
                        updated_at: new Date().toISOString(),
                    });
                if (error) throw error;
            }

            this._hideModal('prompt-edit-modal');
            this.showToast(`Prompt "${key}" saved (v${newVersion})`, 'success');
            await this.loadPrompts();
        } catch (e) {
            this.showToast(`Failed to save: ${e.message}`, 'error');
        }
    }

    async togglePromptActive(key, isActive, checkboxEl) {
        const cardEl = checkboxEl?.closest('.prompt-card');
        try {
            const { error } = await this.supabase.from('prompt_templates')
                .update({ is_active: isActive, updated_at: new Date().toISOString() })
                .eq('prompt_key', key);
            if (error) throw error;

            const p = this.promptsData.find(x => x.prompt_key === key);
            if (p) p.is_active = isActive;
            cardEl?.classList.toggle('inactive', !isActive);
            const dot = cardEl?.querySelector('.status-dot');
            dot?.classList.toggle('active', isActive);
            this.showToast(`Prompt "${key}" ${isActive ? 'activated' : 'deactivated'}`, 'success');
        } catch (e) {
            if (checkboxEl) checkboxEl.checked = !isActive;
            this.showToast(`Failed: ${e.message}`, 'error');
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
            this.showToast(`Failed to load flags: ${e.message}`, 'error');
        }
    }

    _renderFlags() {
        const container = document.getElementById('flags-container');
        if (!container) return;

        if (this.flagsData.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">No feature flags found</p>';
            return;
        }

        container.innerHTML = this.flagsData.map(f => {
            const safeKey = this._esc(f.flag_key);
            return `
                <div class="flag-card">
                    <div class="flag-info">
                        <h3 class="flag-key">${safeKey}</h3>
                        <p class="flag-desc text-muted">${this._esc(f.description || 'No description')}</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${f.is_enabled ? 'checked' : ''}
                            data-toggle-action="flag" data-key="${safeKey}" aria-label="Toggle ${safeKey}">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `;
        }).join('');
    }

    async toggleFlag(key, enabled, checkboxEl) {
        try {
            const { error } = await this.supabase.from('feature_flags')
                .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
                .eq('flag_key', key);
            if (error) throw error;

            const flag = this.flagsData.find(f => f.flag_key === key);
            if (flag) flag.is_enabled = enabled;
            this.showToast(`"${key}" ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } catch (e) {
            if (checkboxEl) checkboxEl.checked = !enabled;
            this.showToast(`Failed: ${e.message}`, 'error');
        }
    }

    // ============================================
    // LANDING PAGE TAB
    // ============================================

    _getLandingSectionSchema() {
        return {
            seo: {
                label: '🔍 SEO Settings',
                fields: [
                    'page_title', 'meta_description', 'og_title', 'og_description',
                    'og_image_url', 'canonical_url', 'schema_name', 'schema_type',
                    'schema_description', 'schema_logo_url', 'schema_rating_value', 'schema_rating_count'
                ]
            },
            hero: {
                label: '🦸 Hero Section',
                fields: [
                    'badge', 'title', 'title_highlight', 'description',
                    'ios_btn', 'android_btn', 'instagram_url', 'instagram_handle',
                    'metric1_value', 'metric1_label', 'metric2_value', 'metric2_label'
                ]
            },
            features_header: { label: '⭐ Features Header', fields: ['title', 'subtitle'] },
            portal: {
                label: '🌐 Web Portal Section',
                fields: ['badge', 'title', 'description', 'check1_title', 'check1_desc', 'check2_title', 'check2_desc', 'cta_text', 'cta_url']
            },
            testimonials_header: { label: '💬 Testimonials Header', fields: ['title', 'subtitle'] },
            cta: { label: '📣 CTA Section', fields: ['title', 'description', 'ios_btn', 'android_btn'] },
            footer: { label: '🦶 Footer', fields: ['brand_name', 'instagram_url', 'instagram_handle', 'copyright'] },
            modal: { label: '🚀 Coming Soon Modal', fields: ['icon', 'title', 'body', 'btn_text', 'btn_url'] },
        };
    }

    async loadLanding() {
        try {
            const [sectionsRes, featuresRes, testimonialsRes] = await Promise.all([
                this.supabase.from('landing_content').select('*'),
                this.supabase.from('landing_features').select('*').order('sort_order'),
                this.supabase.from('landing_testimonials').select('*').order('sort_order'),
            ]);

            if (sectionsRes.error) throw sectionsRes.error;
            if (featuresRes.error) throw featuresRes.error;
            if (testimonialsRes.error) throw testimonialsRes.error;

            this.landingSections = {};
            (sectionsRes.data || []).forEach(r => { this.landingSections[r.section_key] = r.content || {}; });
            this.landingFeatures = featuresRes.data || [];
            this.landingTestimonials = testimonialsRes.data || [];

            this._renderLandingSections();
            this._renderLandingFeatures();
            this._renderLandingTestimonials();
        } catch (e) {
            console.error('Failed to load landing:', e);
            this.showToast(`Failed to load landing content: ${e.message}`, 'error');
        }
    }

    _renderLandingSections() {
        const container = document.getElementById('landing-sections-container');
        if (!container) return;

        const sectionSchema = this._getLandingSectionSchema();

        container.innerHTML = Object.entries(sectionSchema).map(([key, meta]) => {
            const data = this.landingSections[key] || {};
            const fieldCount = Object.keys(data).length;
            const preview = meta.fields
                .slice(0, 2)
                .map(f => data[f] ? `${f}: "${String(data[f]).substring(0, 40)}..."` : '')
                .filter(Boolean)
                .join(', ');
            const safeKey = this._esc(key);

            return `
                <div class="prompt-card" style="margin-bottom: 12px;">
                    <div class="prompt-card-header">
                        <div>
                            <h3 class="prompt-key">${this._esc(meta.label)}</h3>
                            <span class="admin-badge">${fieldCount} fields</span>
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-section" data-key="${safeKey}">✏️ Edit</button>
                    </div>
                    <p class="text-muted" style="font-size: 13px; margin: 0;">${this._esc(preview) || 'No content yet'}</p>
                </div>
            `;
        }).join('');
    }

    editLandingSection(key) {
        this.editingSectionKey = key;
        const data = this.landingSections[key] || {};
        const sectionSchema = this._getLandingSectionSchema();
        const schemaInfo = sectionSchema[key] || { label: key, fields: [] };

        document.getElementById('section-modal-title').textContent = `Edit: ${schemaInfo.label}`;

        const fieldsContainer = document.getElementById('section-modal-fields');
        const longFields = ['description', 'meta_description', 'og_description', 'body', 'schema_description'];
        const allFieldNames = [...new Set([...schemaInfo.fields, ...Object.keys(data)])];

        fieldsContainer.innerHTML = allFieldNames.map(field => {
            const value = data[field] ?? '';
            const isLong = longFields.includes(field) || String(value).length > 80;
            const safeField = this._esc(field);
            const fieldId = `section-field-${safeField}`;
            return `
                <div class="form-group">
                    <label class="form-label" for="${fieldId}">${safeField}</label>
                    ${isLong
                        ? `<textarea id="${fieldId}" class="form-input form-textarea" data-section-field="${safeField}" rows="3">${this._esc(value)}</textarea>`
                        : `<input id="${fieldId}" type="text" class="form-input" data-section-field="${safeField}" value="${this._esc(value)}">`
                    }
                </div>
            `;
        }).join('');

        this._showModal('section-edit-modal');
    }

    async saveLandingSection() {
        const key = this.editingSectionKey;
        if (!key) return;

        const fields = document.querySelectorAll('[data-section-field]');
        const content = {};
        fields.forEach(f => { content[f.dataset.sectionField] = f.value; });

        try {
            const { error } = await this.supabase.from('landing_content')
                .upsert({ section_key: key, content, updated_at: new Date().toISOString() }, { onConflict: 'section_key' });
            if (error) throw error;

            this._hideModal('section-edit-modal');
            this.showToast(`Section "${key}" saved`, 'success');
            this.landingSections[key] = content;
            this._renderLandingSections();
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
        }
    }

    // --- Landing Features ---

    _renderLandingFeatures() {
        const container = document.getElementById('landing-features-container');
        if (!container) return;

        if (this.landingFeatures.length === 0) {
            container.innerHTML = '<p class="text-muted">No features yet</p>';
            return;
        }

        container.innerHTML = this.landingFeatures.map(f => {
            const safeId = this._esc(f.id);
            return `
                <div class="prompt-card ${f.is_active ? '' : 'inactive'}" style="margin-bottom: 12px;">
                    <div class="prompt-card-header">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">${this._esc(f.icon)}</span>
                            <div>
                                <h3 class="prompt-key" style="margin: 0;">${this._esc(f.title)}</h3>
                                <span class="admin-badge">Order: ${Number(f.sort_order) || 0}</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-feature" data-id="${safeId}" title="Edit">✏️</button>
                            <button type="button" class="btn btn-ghost btn-sm" data-action="delete-feature" data-id="${safeId}" title="Delete">🗑️</button>
                        </div>
                    </div>
                    <p class="text-muted" style="margin: 0; font-size: 13px;">${this._esc(f.description)}</p>
                </div>
            `;
        }).join('');
    }

    showAddFeatureModal() {
        document.getElementById('edit-feature-id').value = '';
        document.getElementById('edit-feature-icon').value = '⭐';
        document.getElementById('edit-feature-title').value = '';
        document.getElementById('edit-feature-desc').value = '';
        document.getElementById('edit-feature-sort').value = this.landingFeatures.length + 1;
        document.getElementById('feature-modal-title').textContent = 'Add Feature';
        this._showModal('feature-edit-modal');
    }

    editLandingFeature(id) {
        const f = this.landingFeatures.find(x => String(x.id) === String(id));
        if (!f) return;
        document.getElementById('edit-feature-id').value = f.id;
        document.getElementById('edit-feature-icon').value = f.icon || '';
        document.getElementById('edit-feature-title').value = f.title || '';
        document.getElementById('edit-feature-desc').value = f.description || '';
        document.getElementById('edit-feature-sort').value = f.sort_order ?? 0;
        document.getElementById('feature-modal-title').textContent = `Edit: ${f.title}`;
        this._showModal('feature-edit-modal');
    }

    async saveLandingFeature() {
        const id = document.getElementById('edit-feature-id').value;
        const existing = id ? this.landingFeatures.find(x => String(x.id) === String(id)) : null;

        const row = {
            icon: document.getElementById('edit-feature-icon').value,
            title: document.getElementById('edit-feature-title').value.trim(),
            description: document.getElementById('edit-feature-desc').value.trim(),
            sort_order: parseInt(document.getElementById('edit-feature-sort').value, 10) || 0,
            is_active: existing ? existing.is_active : true,
            updated_at: new Date().toISOString(),
        };
        if (!row.title) { this.showToast('Title required', 'error'); return; }

        try {
            if (id) {
                const { error } = await this.supabase.from('landing_features').update(row).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await this.supabase.from('landing_features').insert(row);
                if (error) throw error;
            }
            this._hideModal('feature-edit-modal');
            this.showToast('Feature saved', 'success');
            await this.loadLanding();
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
        }
    }

    async deleteLandingFeature(id) {
        if (!confirm('Delete this feature?')) return;
        try {
            const { error } = await this.supabase.from('landing_features').delete().eq('id', id);
            if (error) throw error;
            this.showToast('Feature deleted', 'success');
            await this.loadLanding();
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
        }
    }

    // --- Landing Testimonials ---

    _renderLandingTestimonials() {
        const container = document.getElementById('landing-testimonials-container');
        if (!container) return;

        if (this.landingTestimonials.length === 0) {
            container.innerHTML = '<p class="text-muted">No testimonials yet</p>';
            return;
        }

        container.innerHTML = this.landingTestimonials.map(t => {
            const safeId = this._esc(t.id);
            const starCount = Math.min(5, Math.max(0, Number(t.stars) || 5));
            const stars = '★'.repeat(starCount) + '☆'.repeat(5 - starCount);
            const socials = [t.instagram_handle, t.youtube_channel, t.twitter_handle, t.tiktok_handle].filter(Boolean).join(' · ');
            const quote = String(t.quote || '');

            return `
                <div class="prompt-card ${t.is_active ? '' : 'inactive'}" style="margin-bottom: 12px;">
                    <div class="prompt-card-header">
                        <div>
                            <h3 class="prompt-key" style="margin: 0;">${this._esc(t.author_name)} ${t.is_verified ? '✓' : ''}</h3>
                            <span class="text-muted" style="font-size: 12px;">${this._esc(t.author_role)} · ${stars}</span>
                            ${t.follower_count ? `<span class="admin-badge" style="margin-left: 8px;">${this._esc(t.follower_count)} on ${this._esc(t.follower_platform || 'Instagram')}</span>` : ''}
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-testimonial" data-id="${safeId}" title="Edit">✏️</button>
                            <button type="button" class="btn btn-ghost btn-sm" data-action="delete-testimonial" data-id="${safeId}" title="Delete">🗑️</button>
                        </div>
                    </div>
                    <p class="text-muted" style="margin: 4px 0; font-size: 13px; font-style: italic;">"${this._esc(quote.substring(0, 120))}${quote.length > 120 ? '...' : ''}"</p>
                    ${socials ? `<p class="text-muted" style="margin: 0; font-size: 11px;">${this._esc(socials)}</p>` : ''}
                </div>
            `;
        }).join('');
    }

    showAddTestimonialModal() {
        document.getElementById('edit-testimonial-id').value = '';
        document.getElementById('edit-testimonial-quote').value = '';
        document.getElementById('edit-testimonial-name').value = '';
        document.getElementById('edit-testimonial-stars').value = '5';
        document.getElementById('edit-testimonial-role').value = '';
        document.getElementById('edit-testimonial-initial').value = '';
        document.getElementById('edit-testimonial-sort').value = this.landingTestimonials.length + 1;
        document.getElementById('edit-testimonial-image').value = '';
        document.getElementById('edit-testimonial-ig-url').value = '';
        document.getElementById('edit-testimonial-ig-handle').value = '';
        document.getElementById('edit-testimonial-yt-url').value = '';
        document.getElementById('edit-testimonial-yt-channel').value = '';
        document.getElementById('edit-testimonial-tw-url').value = '';
        document.getElementById('edit-testimonial-tw-handle').value = '';
        document.getElementById('edit-testimonial-tt-url').value = '';
        document.getElementById('edit-testimonial-tt-handle').value = '';
        document.getElementById('edit-testimonial-li-url').value = '';
        document.getElementById('edit-testimonial-web-url').value = '';
        document.getElementById('edit-testimonial-followers').value = '';
        document.getElementById('edit-testimonial-follower-platform').value = 'Instagram';
        document.getElementById('edit-testimonial-verified').checked = false;
        document.getElementById('edit-testimonial-featured').checked = false;
        document.getElementById('testimonial-modal-title').textContent = 'Add Testimonial';
        this._showModal('testimonial-edit-modal');
    }

    editLandingTestimonial(id) {
        const t = this.landingTestimonials.find(x => String(x.id) === String(id));
        if (!t) return;
        document.getElementById('edit-testimonial-id').value = t.id;
        document.getElementById('edit-testimonial-quote').value = t.quote || '';
        document.getElementById('edit-testimonial-name').value = t.author_name || '';
        document.getElementById('edit-testimonial-stars').value = t.stars || 5;
        document.getElementById('edit-testimonial-role').value = t.author_role || '';
        document.getElementById('edit-testimonial-initial').value = t.author_initial || '';
        document.getElementById('edit-testimonial-sort').value = t.sort_order ?? 0;
        document.getElementById('edit-testimonial-image').value = t.author_image_url || '';
        document.getElementById('edit-testimonial-ig-url').value = t.instagram_url || '';
        document.getElementById('edit-testimonial-ig-handle').value = t.instagram_handle || '';
        document.getElementById('edit-testimonial-yt-url').value = t.youtube_url || '';
        document.getElementById('edit-testimonial-yt-channel').value = t.youtube_channel || '';
        document.getElementById('edit-testimonial-tw-url').value = t.twitter_url || '';
        document.getElementById('edit-testimonial-tw-handle').value = t.twitter_handle || '';
        document.getElementById('edit-testimonial-tt-url').value = t.tiktok_url || '';
        document.getElementById('edit-testimonial-tt-handle').value = t.tiktok_handle || '';
        document.getElementById('edit-testimonial-li-url').value = t.linkedin_url || '';
        document.getElementById('edit-testimonial-web-url').value = t.website_url || '';
        document.getElementById('edit-testimonial-followers').value = t.follower_count || '';
        document.getElementById('edit-testimonial-follower-platform').value = t.follower_platform || 'Instagram';
        document.getElementById('edit-testimonial-verified').checked = !!t.is_verified;
        document.getElementById('edit-testimonial-featured').checked = !!t.is_featured;
        document.getElementById('testimonial-modal-title').textContent = `Edit: ${t.author_name}`;
        this._showModal('testimonial-edit-modal');
    }

    async saveLandingTestimonial() {
        const id = document.getElementById('edit-testimonial-id').value;
        const existing = id ? this.landingTestimonials.find(x => String(x.id) === String(id)) : null;
        const v = (sel) => document.getElementById(sel).value.trim();

        const row = {
            quote: v('edit-testimonial-quote'),
            author_name: v('edit-testimonial-name'),
            stars: parseInt(document.getElementById('edit-testimonial-stars').value, 10) || 5,
            author_role: v('edit-testimonial-role'),
            author_initial: v('edit-testimonial-initial') || v('edit-testimonial-name').charAt(0),
            sort_order: parseInt(document.getElementById('edit-testimonial-sort').value, 10) || 0,
            author_image_url: v('edit-testimonial-image') || null,
            instagram_url: v('edit-testimonial-ig-url') || null,
            instagram_handle: v('edit-testimonial-ig-handle') || null,
            youtube_url: v('edit-testimonial-yt-url') || null,
            youtube_channel: v('edit-testimonial-yt-channel') || null,
            twitter_url: v('edit-testimonial-tw-url') || null,
            twitter_handle: v('edit-testimonial-tw-handle') || null,
            tiktok_url: v('edit-testimonial-tt-url') || null,
            tiktok_handle: v('edit-testimonial-tt-handle') || null,
            linkedin_url: v('edit-testimonial-li-url') || null,
            website_url: v('edit-testimonial-web-url') || null,
            follower_count: v('edit-testimonial-followers') || null,
            follower_platform: v('edit-testimonial-follower-platform') || 'Instagram',
            is_verified: document.getElementById('edit-testimonial-verified').checked,
            is_featured: document.getElementById('edit-testimonial-featured').checked,
            is_active: existing ? existing.is_active : true,
            updated_at: new Date().toISOString(),
        };
        if (!row.quote || !row.author_name) { this.showToast('Quote and name required', 'error'); return; }

        try {
            if (id) {
                const { error } = await this.supabase.from('landing_testimonials').update(row).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await this.supabase.from('landing_testimonials').insert(row);
                if (error) throw error;
            }
            this._hideModal('testimonial-edit-modal');
            this.showToast('Testimonial saved', 'success');
            await this.loadLanding();
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
        }
    }

    async deleteLandingTestimonial(id) {
        if (!confirm('Delete this testimonial?')) return;
        try {
            const { error } = await this.supabase.from('landing_testimonials').delete().eq('id', id);
            if (error) throw error;
            this.showToast('Testimonial deleted', 'success');
            await this.loadLanding();
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
        }
    }

    // ============================================
    // CREATOR'S GUIDE TAB
    // ============================================

    async loadGuides() {
        try {
            const { data, error } = await this.supabase
                .from('guides')
                .select('*')
                .order('order_index');
            if (error) throw error;
            this.guidesData = data || [];
            // Detect at runtime whether optional extended guide columns exist in Postgres
            const sample = this.guidesData[0];
            this.supportsExtendedGuideCols = !!(sample && 'markdown_body' in sample);
            this._syncGuideModalSchemaVisibility();
            this._renderGuides();
        } catch (e) {
            console.error('Failed to load guides:', e);
            this.showToast(`Failed to load guides: ${e.message}`, 'error');
        }
    }

    _syncGuideModalSchemaVisibility() {
        const showExt = this.supportsExtendedGuideCols;
        document.getElementById('edit-guide-markdown-group')?.classList.toggle('hidden', !showExt);
        document.getElementById('guide-cover-color-group')?.classList.toggle('hidden', !showExt);
        document.getElementById('guide-read-min-group')?.classList.toggle('hidden', !showExt);
    }

    _renderGuides() {
        const container = document.getElementById('admin-guides-container');
        if (!container) return;

        if (!this.guidesData || this.guidesData.length === 0) {
            container.innerHTML = '<p class="text-muted">No guide chapters yet. Click "Add Chapter" to create one.</p>';
            return;
        }

        container.innerHTML = this.guidesData.map(g => {
            const safeId = this._esc(g.id);
            const bullets = Array.isArray(g.content) ? g.content.length : 0;
            const hasMd = g.markdown_body ? `<span class="admin-badge guide-badge-markdown">📝 Markdown</span>` : '';
            const ytBadge = g.youtube_url ? `<span class="admin-badge guide-badge-youtube">▶ YouTube</span>` : '';
            const actionBadge = g.action_route ? `<span class="admin-badge">${this._esc(g.action_title || g.action_route)}</span>` : '';
            const safeColor = g.cover_emoji_bg ? this._safeHexColor(g.cover_emoji_bg, '') : '';
            const colorDot = safeColor ? `<span class="guide-color-dot" style="background:${safeColor};"></span>` : '';
            const readMinBadge = g.estimated_read_min ? ` · ${Number(g.estimated_read_min)} min read` : '';

            return `
                <div class="prompt-card ${g.is_active ? '' : 'inactive'}" style="margin-bottom: 12px;">
                    <div class="prompt-card-header">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">${this._esc(g.emoji)}</span>
                            <div>
                                <h3 class="prompt-key" style="margin: 0;">${colorDot}Ch. ${Number(g.order_index) || 1}: ${this._esc(g.title)}</h3>
                                <span class="text-muted" style="font-size: 12px;">${this._esc(g.summary)}${readMinBadge}</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <label class="toggle-switch small">
                                <input type="checkbox" ${g.is_active ? 'checked' : ''}
                                    data-toggle-action="guide" data-id="${safeId}" aria-label="Toggle ${this._esc(g.title)}">
                                <span class="toggle-slider"></span>
                            </label>
                            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-guide" data-id="${safeId}" title="Edit">✏️</button>
                            <button type="button" class="btn btn-ghost btn-sm" data-action="delete-guide" data-id="${safeId}" title="Delete">🗑️</button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
                        ${hasMd}
                        <span class="admin-badge">${bullets} bullets</span>
                        <span class="admin-badge">Order: ${Number(g.order_index) || 1}</span>
                        ${ytBadge}
                        ${actionBadge}
                    </div>
                </div>
            `;
        }).join('');
    }

    showAddGuideModal() {
        this._syncGuideModalSchemaVisibility();
        document.getElementById('edit-guide-id').value = '';
        document.getElementById('edit-guide-emoji').value = '💡';
        document.getElementById('edit-guide-title').value = '';
        document.getElementById('edit-guide-key').value = '';
        document.getElementById('edit-guide-key').disabled = false;
        document.getElementById('edit-guide-summary').value = '';
        document.getElementById('edit-guide-markdown').value = '';
        document.getElementById('edit-guide-content').value = '';
        document.getElementById('edit-guide-cover-color').value = '#4E592B';
        document.getElementById('edit-guide-read-min').value = '3';
        document.getElementById('edit-guide-youtube-url').value = '';
        document.getElementById('edit-guide-youtube-title').value = '';
        document.getElementById('edit-guide-action-route').value = '';
        document.getElementById('edit-guide-action-title').value = '';
        document.getElementById('edit-guide-sort').value = (this.guidesData?.length || 0) + 1;
        document.getElementById('guide-modal-title').textContent = 'Add Guide Chapter';

        this._showModal('guide-edit-modal');
    }

    editGuide(id) {
        const g = this.guidesData.find(x => String(x.id) === String(id));
        if (!g) return;
        this._syncGuideModalSchemaVisibility();

        document.getElementById('edit-guide-id').value = g.id;
        document.getElementById('edit-guide-emoji').value = g.emoji || '';
        document.getElementById('edit-guide-title').value = g.title || '';
        document.getElementById('edit-guide-key').value = g.guide_key || '';
        document.getElementById('edit-guide-key').disabled = true;
        document.getElementById('edit-guide-summary').value = g.summary || '';
        document.getElementById('edit-guide-markdown').value = g.markdown_body || '';
        document.getElementById('edit-guide-content').value = Array.isArray(g.content) ? g.content.join('\n') : '';
        document.getElementById('edit-guide-cover-color').value = this._safeHexColor(g.cover_emoji_bg, '#4E592B');
        document.getElementById('edit-guide-read-min').value = g.estimated_read_min || 3;
        document.getElementById('edit-guide-youtube-url').value = g.youtube_url || '';
        document.getElementById('edit-guide-youtube-title').value = g.youtube_title || '';
        document.getElementById('edit-guide-action-route').value = g.action_route || '';
        document.getElementById('edit-guide-action-title').value = g.action_title || '';
        document.getElementById('edit-guide-sort').value = g.order_index ?? 1;
        document.getElementById('guide-modal-title').textContent = `Edit: ${g.title}`;
        this._showModal('guide-edit-modal');
    }

    async saveGuide() {
        const id = document.getElementById('edit-guide-id').value;
        const existing = id ? this.guidesData.find(x => String(x.id) === String(id)) : null;
        const v = (sel) => document.getElementById(sel).value.trim();

        const markdownBody = v('edit-guide-markdown');
        let contentText = v('edit-guide-content');

        // Auto-generate legacy bullets from markdown if empty
        if (!contentText && markdownBody) {
            contentText = markdownBody
                .split('\n')
                .filter(l => l.startsWith('- ') || l.startsWith('* '))
                .map(l => l.replace(/^[-*]\s+/, '').replace(/\*\*/g, ''))
                .join('\n');
        }

        const contentArray = contentText.split('\n').map(l => l.trim()).filter(Boolean);

        const row = {
            guide_key: v('edit-guide-key'),
            title: v('edit-guide-title'),
            emoji: v('edit-guide-emoji'),
            summary: v('edit-guide-summary'),
            content: contentArray,
            youtube_url: v('edit-guide-youtube-url') || null,
            youtube_title: v('edit-guide-youtube-title') || null,
            action_route: v('edit-guide-action-route') || null,
            action_title: v('edit-guide-action-title') || null,
            order_index: parseInt(document.getElementById('edit-guide-sort').value, 10) || 1,
            is_active: existing ? existing.is_active : true,
        };

        // Only send optional extension columns if the guides table includes them
        if (this.supportsExtendedGuideCols) {
            row.markdown_body = markdownBody || null;
            row.cover_emoji_bg = this._safeHexColor(v('edit-guide-cover-color'), '#4E592B');
            row.estimated_read_min = parseInt(document.getElementById('edit-guide-read-min').value, 10) || 3;
        }

        if (!row.guide_key || !row.title) {
            this.showToast('Key and title are required', 'error');
            return;
        }

        try {
            if (id) {
                const { error } = await this.supabase.from('guides').update(row).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await this.supabase.from('guides').insert(row);
                if (error) throw error;
            }
            this._hideModal('guide-edit-modal');
            this.showToast(`Guide "${row.title}" saved`, 'success');
            await this.loadGuides();
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
        }
    }

    async deleteGuide(id) {
        const g = this.guidesData?.find(x => String(x.id) === String(id));
        if (!confirm(`Delete guide "${g?.title || id}"? This cannot be undone.`)) return;
        try {
            const { error } = await this.supabase.from('guides').delete().eq('id', id);
            if (error) throw error;
            this.showToast('Guide deleted', 'success');
            await this.loadGuides();
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
        }
    }

    async toggleGuideActive(id, isActive, checkboxEl) {
        const cardEl = checkboxEl?.closest('.prompt-card');
        try {
            const { error } = await this.supabase.from('guides')
                .update({ is_active: isActive })
                .eq('id', id);
            if (error) throw error;
            this.showToast(`Guide ${isActive ? 'activated' : 'deactivated'}`, 'success');
            const g = this.guidesData?.find(x => String(x.id) === String(id));
            if (g) g.is_active = isActive;
            cardEl?.classList.toggle('inactive', !isActive);
        } catch (e) {
            if (checkboxEl) checkboxEl.checked = !isActive;
            cardEl?.classList.toggle('inactive', isActive);
            this.showToast(`Failed: ${e.message}`, 'error');
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

        const iconSpan = document.createElement('span');
        iconSpan.className = 'toast-icon';
        iconSpan.textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

        const msgSpan = document.createElement('span');
        msgSpan.className = 'toast-message';
        msgSpan.textContent = String(message ?? '');

        toast.append(iconSpan, msgSpan);
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Global instance
window.dashboard = new AdminDashboard();
