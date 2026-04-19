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
        // Landing page state
        this.landingSections = {};
        this.landingFeatures = [];
        this.landingTestimonials = [];
        this.editingSectionKey = null;
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
            case 'landing': this.loadLanding(); break;
            case 'guides': this.loadGuides(); break;
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
    // LANDING PAGE TAB
    // ============================================

    async loadLanding() {
        try {
            const [sectionsRes, featuresRes, testimonialsRes] = await Promise.all([
                this.supabase.from('landing_content').select('*'),
                this.supabase.from('landing_features').select('*').order('sort_order'),
                this.supabase.from('landing_testimonials').select('*').order('sort_order'),
            ]);

            this.landingSections = {};
            (sectionsRes.data || []).forEach(r => { this.landingSections[r.section_key] = r.content; });
            this.landingFeatures = featuresRes.data || [];
            this.landingTestimonials = testimonialsRes.data || [];

            this._renderLandingSections();
            this._renderLandingFeatures();
            this._renderLandingTestimonials();
        } catch (e) {
            console.error('Failed to load landing:', e);
            this.showToast('Failed to load landing content', 'error');
        }
    }

    // --- Section Editors ---

    _renderLandingSections() {
        const container = document.getElementById('landing-sections-container');
        if (!container) return;

        const sectionLabels = {
            seo: { label: '🔍 SEO Settings', fields: ['page_title', 'meta_description', 'og_title', 'og_description', 'og_image_url', 'canonical_url', 'schema_rating_value', 'schema_rating_count'] },
            hero: { label: '🦸 Hero Section', fields: ['badge', 'title', 'title_highlight', 'description', 'ios_btn', 'android_btn', 'instagram_url', 'instagram_handle', 'metric1_value', 'metric1_label', 'metric2_value', 'metric2_label', 'metric3_value', 'metric3_label'] },
            features_header: { label: '⭐ Features Header', fields: ['title', 'subtitle'] },
            portal: { label: '🌐 Web Portal Section', fields: ['badge', 'title', 'description', 'check1_title', 'check1_desc', 'check2_title', 'check2_desc', 'cta_text', 'cta_url'] },
            testimonials_header: { label: '💬 Testimonials Header', fields: ['title', 'subtitle'] },
            cta: { label: '📣 CTA Section', fields: ['title', 'description', 'ios_btn', 'android_btn'] },
            footer: { label: '🦶 Footer', fields: ['brand_name', 'instagram_url', 'instagram_handle', 'copyright'] },
            modal: { label: '🚀 Coming Soon Modal', fields: ['icon', 'title', 'body', 'btn_text', 'btn_url'] },
        };

        container.innerHTML = Object.entries(sectionLabels).map(([key, meta]) => {
            const data = this.landingSections[key] || {};
            const fieldCount = Object.keys(data).length;
            const preview = meta.fields.slice(0, 2).map(f => data[f] ? `${f}: "${String(data[f]).substring(0, 40)}..."` : '').filter(Boolean).join(', ');
            return `
                <div class="prompt-card" style="margin-bottom: 12px;">
                    <div class="prompt-card-header">
                        <div>
                            <h3 class="prompt-key">${meta.label}</h3>
                            <span class="admin-badge">${fieldCount} fields</span>
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="dashboard.editLandingSection('${key}')">✏️ Edit</button>
                    </div>
                    <p class="text-muted" style="font-size: 13px; margin: 0;">${preview || 'No content yet'}</p>
                </div>
            `;
        }).join('');
    }

    editLandingSection(key) {
        this.editingSectionKey = key;
        const data = this.landingSections[key] || {};

        const sectionLabels = {
            seo: '🔍 SEO Settings', hero: '🦸 Hero Section', features_header: '⭐ Features Header',
            portal: '🌐 Web Portal', testimonials_header: '💬 Testimonials Header',
            cta: '📣 CTA Section', footer: '🦶 Footer', modal: '🚀 Coming Soon Modal'
        };

        document.getElementById('section-modal-title').textContent = `Edit: ${sectionLabels[key] || key}`;

        const fieldsContainer = document.getElementById('section-modal-fields');
        const longFields = ['description', 'meta_description', 'og_description', 'body', 'schema_description'];

        fieldsContainer.innerHTML = Object.entries(data).map(([field, value]) => {
            const isLong = longFields.includes(field) || String(value).length > 80;
            return `
                <div class="form-group">
                    <label class="form-label">${field}</label>
                    ${isLong
                        ? `<textarea class="form-input form-textarea" data-section-field="${field}" rows="3">${value || ''}</textarea>`
                        : `<input type="text" class="form-input" data-section-field="${field}" value="${String(value || '').replace(/"/g, '&quot;')}">`
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

        container.innerHTML = this.landingFeatures.map(f => `
            <div class="prompt-card ${f.is_active ? '' : 'inactive'}" style="margin-bottom: 12px;">
                <div class="prompt-card-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 28px;">${f.icon}</span>
                        <div>
                            <h3 class="prompt-key" style="margin: 0;">${f.title}</h3>
                            <span class="admin-badge">Order: ${f.sort_order}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="dashboard.editLandingFeature('${f.id}')">✏️</button>
                        <button class="btn btn-ghost btn-sm" onclick="dashboard.deleteLandingFeature('${f.id}')">🗑️</button>
                    </div>
                </div>
                <p class="text-muted" style="margin: 0; font-size: 13px;">${f.description}</p>
            </div>
        `).join('');
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
        const f = this.landingFeatures.find(x => x.id === id);
        if (!f) return;
        document.getElementById('edit-feature-id').value = f.id;
        document.getElementById('edit-feature-icon').value = f.icon;
        document.getElementById('edit-feature-title').value = f.title;
        document.getElementById('edit-feature-desc').value = f.description;
        document.getElementById('edit-feature-sort').value = f.sort_order;
        document.getElementById('feature-modal-title').textContent = `Edit: ${f.title}`;
        this._showModal('feature-edit-modal');
    }

    async saveLandingFeature() {
        const id = document.getElementById('edit-feature-id').value;
        const row = {
            icon: document.getElementById('edit-feature-icon').value,
            title: document.getElementById('edit-feature-title').value.trim(),
            description: document.getElementById('edit-feature-desc').value.trim(),
            sort_order: parseInt(document.getElementById('edit-feature-sort').value) || 0,
            is_active: true,
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
            const stars = '★'.repeat(t.stars) + '☆'.repeat(5 - t.stars);
            const socials = [t.instagram_handle, t.youtube_channel, t.twitter_handle, t.tiktok_handle].filter(Boolean).join(' · ');
            return `
                <div class="prompt-card ${t.is_active ? '' : 'inactive'}" style="margin-bottom: 12px;">
                    <div class="prompt-card-header">
                        <div>
                            <h3 class="prompt-key" style="margin: 0;">${t.author_name} ${t.is_verified ? '✓' : ''}</h3>
                            <span class="text-muted" style="font-size: 12px;">${t.author_role} · ${stars}</span>
                            ${t.follower_count ? `<span class="admin-badge" style="margin-left: 8px;">${t.follower_count} on ${t.follower_platform || 'Instagram'}</span>` : ''}
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary btn-sm" onclick="dashboard.editLandingTestimonial('${t.id}')">✏️</button>
                            <button class="btn btn-ghost btn-sm" onclick="dashboard.deleteLandingTestimonial('${t.id}')">🗑️</button>
                        </div>
                    </div>
                    <p class="text-muted" style="margin: 4px 0; font-size: 13px; font-style: italic;">"${t.quote.substring(0, 120)}${t.quote.length > 120 ? '...' : ''}"</p>
                    ${socials ? `<p class="text-muted" style="margin: 0; font-size: 11px;">${socials}</p>` : ''}
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
        const t = this.landingTestimonials.find(x => x.id === id);
        if (!t) return;
        document.getElementById('edit-testimonial-id').value = t.id;
        document.getElementById('edit-testimonial-quote').value = t.quote;
        document.getElementById('edit-testimonial-name').value = t.author_name;
        document.getElementById('edit-testimonial-stars').value = t.stars;
        document.getElementById('edit-testimonial-role').value = t.author_role;
        document.getElementById('edit-testimonial-initial').value = t.author_initial;
        document.getElementById('edit-testimonial-sort').value = t.sort_order;
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
        const v = (sel) => document.getElementById(sel).value.trim();
        const row = {
            quote: v('edit-testimonial-quote'),
            author_name: v('edit-testimonial-name'),
            stars: parseInt(document.getElementById('edit-testimonial-stars').value) || 5,
            author_role: v('edit-testimonial-role'),
            author_initial: v('edit-testimonial-initial') || v('edit-testimonial-name').charAt(0),
            sort_order: parseInt(document.getElementById('edit-testimonial-sort').value) || 0,
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
            is_active: true,
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
            this._renderGuides();
        } catch (e) {
            console.error('Failed to load guides:', e);
            this.showToast('Failed to load guides', 'error');
        }
    }

    _renderGuides() {
        const container = document.getElementById('admin-guides-container');
        if (!container) return;

        if (!this.guidesData || this.guidesData.length === 0) {
            container.innerHTML = '<p class="text-muted">No guide chapters yet. Click "Add Chapter" to create one.</p>';
            return;
        }

        container.innerHTML = this.guidesData.map(g => {
            const bullets = Array.isArray(g.content) ? g.content.length : 0;
            const hasMd = g.markdown_body ? `<span class="admin-badge" style="background: rgba(139,92,246,0.1); color: #a78bfa;">📝 Markdown</span>` : '';
            const ytBadge = g.youtube_url ? `<span class="admin-badge" style="background: rgba(255,0,0,0.1); color: #f87171;">▶ YouTube</span>` : '';
            const actionBadge = g.action_route ? `<span class="admin-badge">${g.action_title || g.action_route}</span>` : '';
            const colorDot = g.cover_emoji_bg ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${g.cover_emoji_bg};vertical-align:middle;margin-right:6px;"></span>` : '';
            return `
                <div class="prompt-card ${g.is_active ? '' : 'inactive'}" style="margin-bottom: 12px;">
                    <div class="prompt-card-header">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">${g.emoji}</span>
                            <div>
                                <h3 class="prompt-key" style="margin: 0;">${colorDot}Ch. ${g.order_index}: ${g.title}</h3>
                                <span class="text-muted" style="font-size: 12px;">${g.summary} · ${g.estimated_read_min || 3} min read</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <label class="toggle-switch small">
                                <input type="checkbox" ${g.is_active ? 'checked' : ''}
                                    onchange="dashboard.toggleGuideActive('${g.id}', this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                            <button class="btn btn-secondary btn-sm" onclick="dashboard.editGuide('${g.id}')">✏️</button>
                            <button class="btn btn-ghost btn-sm" onclick="dashboard.deleteGuide('${g.id}')">🗑️</button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
                        ${hasMd}
                        <span class="admin-badge">${bullets} bullets</span>
                        <span class="admin-badge">Order: ${g.order_index}</span>
                        ${ytBadge}
                        ${actionBadge}
                    </div>
                </div>
            `;
        }).join('');
    }

    showAddGuideModal() {
        document.getElementById('edit-guide-id').value = '';
        document.getElementById('edit-guide-emoji').value = '💡';
        document.getElementById('edit-guide-title').value = '';
        document.getElementById('edit-guide-key').value = '';
        document.getElementById('edit-guide-key').disabled = false;
        document.getElementById('edit-guide-summary').value = '';
        document.getElementById('edit-guide-markdown').value = '';
        document.getElementById('edit-guide-content').value = '';
        document.getElementById('edit-guide-cover-color').value = '#FBBF24';
        document.getElementById('edit-guide-read-min').value = '3';
        document.getElementById('edit-guide-youtube-url').value = '';
        document.getElementById('edit-guide-youtube-title').value = '';
        document.getElementById('edit-guide-action-route').value = '';
        document.getElementById('edit-guide-action-title').value = '';
        document.getElementById('edit-guide-sort').value = (this.guidesData?.length || 0) + 1;
        document.getElementById('guide-modal-title').textContent = 'Add Guide Chapter';

        // Auto-generate key from title
        const titleInput = document.getElementById('edit-guide-title');
        const keyInput = document.getElementById('edit-guide-key');
        titleInput.oninput = () => {
            if (!document.getElementById('edit-guide-id').value) {
                keyInput.value = titleInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            }
        };

        this._showModal('guide-edit-modal');
    }

    editGuide(id) {
        const g = this.guidesData.find(x => x.id === id);
        if (!g) return;
        document.getElementById('edit-guide-id').value = g.id;
        document.getElementById('edit-guide-emoji').value = g.emoji;
        document.getElementById('edit-guide-title').value = g.title;
        document.getElementById('edit-guide-key').value = g.guide_key;
        document.getElementById('edit-guide-key').disabled = true;
        document.getElementById('edit-guide-summary').value = g.summary;
        document.getElementById('edit-guide-markdown').value = g.markdown_body || '';
        document.getElementById('edit-guide-content').value = Array.isArray(g.content) ? g.content.join('\n') : '';
        document.getElementById('edit-guide-cover-color').value = g.cover_emoji_bg || '#FBBF24';
        document.getElementById('edit-guide-read-min').value = g.estimated_read_min || 3;
        document.getElementById('edit-guide-youtube-url').value = g.youtube_url || '';
        document.getElementById('edit-guide-youtube-title').value = g.youtube_title || '';
        document.getElementById('edit-guide-action-route').value = g.action_route || '';
        document.getElementById('edit-guide-action-title').value = g.action_title || '';
        document.getElementById('edit-guide-sort').value = g.order_index;
        document.getElementById('guide-modal-title').textContent = `Edit: ${g.title}`;
        this._showModal('guide-edit-modal');
    }

    async saveGuide() {
        const id = document.getElementById('edit-guide-id').value;
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
            markdown_body: markdownBody || null,
            cover_emoji_bg: v('edit-guide-cover-color') || '#FBBF24',
            estimated_read_min: parseInt(document.getElementById('edit-guide-read-min').value) || 3,
            youtube_url: v('edit-guide-youtube-url') || null,
            youtube_title: v('edit-guide-youtube-title') || null,
            action_route: v('edit-guide-action-route') || null,
            action_title: v('edit-guide-action-title') || null,
            order_index: parseInt(document.getElementById('edit-guide-sort').value) || 1,
            is_active: true,
        };

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
        const g = this.guidesData?.find(x => x.id === id);
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

    async toggleGuideActive(id, isActive) {
        try {
            const { error } = await this.supabase.from('guides')
                .update({ is_active: isActive })
                .eq('id', id);
            if (error) throw error;
            this.showToast(`Guide ${isActive ? 'activated' : 'deactivated'}`, 'success');
            // Update local state
            const g = this.guidesData?.find(x => x.id === id);
            if (g) g.is_active = isActive;
        } catch (e) {
            this.showToast(`Failed: ${e.message}`, 'error');
            const input = document.querySelector(`[onchange*="${id}"]`);
            if (input) input.checked = !isActive;
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
