// ============================================
// LANDING PAGE DYNAMIC CONTENT
// Fetches CMS content from Supabase when enabled.
// Preserves truthful static SEO, canonical URLs, JSON-LD, and verified-only social proof.
// ============================================

class LandingContent {
    constructor() {
        this.supabase = null;
        this.sections = {};
        this.features = [];
        this.testimonials = [];
    }

    async init() {
        if (!window.APP_CONFIG?.enableDynamicLandingContent) {
            return;
        }
        try {
            this.supabase = getSupabase();
            await Promise.all([
                this._fetchSections(),
                this._fetchFeatures(),
                this._fetchTestimonials(),
            ]);
            this._applyAll();
        } catch (e) {
            console.warn('LandingContent: Failed to load dynamic content, using static HTML.', e);
        }
    }

    // ============================================
    // FETCH
    // ============================================

    async _fetchSections() {
        const { data } = await this.supabase
            .from('landing_content')
            .select('section_key, content');
        if (data) {
            data.forEach(row => { this.sections[row.section_key] = row.content; });
        }
    }

    async _fetchFeatures() {
        const { data } = await this.supabase
            .from('landing_features')
            .select('*')
            .eq('is_active', true)
            .order('sort_order');
        if (data) this.features = data;
    }

    async _fetchTestimonials() {
        const { data } = await this.supabase
            .from('landing_testimonials')
            .select('*')
            .eq('is_active', true)
            .eq('is_verified', true)
            .order('sort_order');
        if (data) {
            // Only surface testimonials that include at least one verifiable profile or source link
            this.testimonials = data.filter(t =>
                t.instagram_url || t.youtube_url || t.twitter_url || t.tiktok_url || t.linkedin_url || t.website_url
            );
        }
    }

    // ============================================
    // APPLY ALL
    // ============================================

    _applyAll() {
        if (this.sections.hero) this._applyHero(this.sections.hero);
        if (this.sections.features_header) this._applyFeaturesHeader(this.sections.features_header);
        if (this.sections.portal) this._applyPortal(this.sections.portal);
        if (this.sections.cta) this._applyCTA(this.sections.cta);
        if (this.sections.footer) this._applyFooter(this.sections.footer);
        if (this.sections.modal) this._applyModal(this.sections.modal);
        if (this.features.length) this._renderFeatures(this.features);
        if (this.testimonials.length) this._renderTestimonials(this.testimonials);
    }

    // ============================================
    // HERO
    // ============================================

    _applyHero(d) {
        this._setText('hero-badge', d.badge);
        this._setText('hero-title-text', d.title);
        this._setText('hero-title-highlight', d.title_highlight);
        this._setText('hero-desc', d.description);
        this._setText('hero-ios-btn', d.ios_btn);
        this._setText('hero-android-btn', d.android_btn);

        const igLink = document.getElementById('hero-instagram-link');
        if (igLink && d.instagram_url) {
            igLink.href = d.instagram_url;
        }
    }

    // ============================================
    // FEATURES
    // ============================================

    _applyFeaturesHeader(d) {
        this._setText('features-heading', d.title);
        this._setText('features-subtitle', d.subtitle);
    }

    _renderFeatures(features) {
        const grid = document.getElementById('features-grid');
        if (!grid) return;

        grid.innerHTML = features.map((f, i) => `
            <div class="feature-card glass" data-animate="fade-up" style="animation-delay: ${i * 0.1}s;">
                <div class="feature-icon-wrapper">
                    <span>${this._esc(f.icon)}</span>
                </div>
                <h3>${this._esc(f.title)}</h3>
                <p>${this._esc(f.description)}</p>
            </div>
        `).join('');

        this._reobserve(grid);
    }

    // ============================================
    // PORTAL
    // ============================================

    _applyPortal(d) {
        this._setText('portal-badge', d.badge);
        this._setText('portal-heading', d.title);
        this._setText('portal-desc', d.description);
        this._setText('portal-check1-title', d.check1_title);
        this._setText('portal-check1-desc', d.check1_desc);
        this._setText('portal-check2-title', d.check2_title);
        this._setText('portal-check2-desc', d.check2_desc);

        const ctaBtn = document.getElementById('portal-cta-btn');
        if (ctaBtn) {
            ctaBtn.textContent = d.cta_text || ctaBtn.textContent;
            if (d.cta_url) ctaBtn.href = d.cta_url;
        }
    }

    // ============================================
    // VERIFIED TESTIMONIALS
    // ============================================

    _renderTestimonials(testimonials) {
        const grid = document.getElementById('testimonials-grid');
        if (!grid) return;

        grid.innerHTML = testimonials.map((t, i) => {
            const stars = '★'.repeat(t.stars) + '☆'.repeat(5 - t.stars);
            const socialLinks = this._buildSocialLinks(t);
            const avatar = t.author_image_url
                ? `<img src="${this._esc(t.author_image_url)}" alt="${this._esc(t.author_name)}" class="author-avatar-img" width="46" height="46" loading="lazy">`
                : `<div class="author-avatar">${this._esc(t.author_initial)}</div>`;
            const verified = t.is_verified ? '<span class="verified-badge" title="Verified">✓</span>' : '';
            const followerBadge = t.follower_count
                ? `<span class="follower-badge">${this._esc(t.follower_count)} on ${this._esc(t.follower_platform || 'Instagram')}</span>`
                : '';

            return `
                <div class="testimonial-card" data-animate="fade-up" style="animation-delay: ${i * 0.1}s;">
                    <div class="stars">${stars}</div>
                    <p class="quote">"${this._esc(t.quote)}"</p>
                    <div class="author">
                        ${avatar}
                        <div class="author-info">
                            <h4>${this._esc(t.author_name)} ${verified}</h4>
                            <p>${this._esc(t.author_role)}</p>
                            ${followerBadge}
                        </div>
                    </div>
                    ${socialLinks ? `<div class="testimonial-socials">${socialLinks}</div>` : ''}
                </div>
            `;
        }).join('');

        this._reobserve(grid);
    }

    _buildSocialLinks(t) {
        const links = [];
        if (t.instagram_url) links.push(`<a href="${this._esc(t.instagram_url)}" target="_blank" rel="noopener noreferrer" class="social-link" title="Instagram">${this._esc(t.instagram_handle || 'Instagram')}</a>`);
        if (t.youtube_url) links.push(`<a href="${this._esc(t.youtube_url)}" target="_blank" rel="noopener noreferrer" class="social-link" title="YouTube">${this._esc(t.youtube_channel || 'YouTube')}</a>`);
        if (t.twitter_url) links.push(`<a href="${this._esc(t.twitter_url)}" target="_blank" rel="noopener noreferrer" class="social-link" title="Twitter/X">${this._esc(t.twitter_handle || 'Twitter')}</a>`);
        if (t.tiktok_url) links.push(`<a href="${this._esc(t.tiktok_url)}" target="_blank" rel="noopener noreferrer" class="social-link" title="TikTok">${this._esc(t.tiktok_handle || 'TikTok')}</a>`);
        if (t.linkedin_url) links.push(`<a href="${this._esc(t.linkedin_url)}" target="_blank" rel="noopener noreferrer" class="social-link" title="LinkedIn">LinkedIn</a>`);
        if (t.website_url) links.push(`<a href="${this._esc(t.website_url)}" target="_blank" rel="noopener noreferrer" class="social-link" title="Website">Website</a>`);
        return links.join('');
    }

    // ============================================
    // CTA, FOOTER & MODAL
    // ============================================

    _applyCTA(d) {
        this._setText('cta-heading', d.title);
        this._setText('cta-desc', d.description);
        this._setText('cta-ios-btn', d.ios_btn);
        this._setText('cta-android-btn', d.android_btn);
    }

    _applyFooter(d) {
        this._setText('footer-brand', d.brand_name);
        this._setText('footer-copyright', d.copyright);

        const igLink = document.getElementById('footer-instagram-link');
        if (igLink && d.instagram_url) {
            igLink.href = d.instagram_url;
            igLink.textContent = d.instagram_handle || d.instagram_url;
        }
    }

    _applyModal(d) {
        this._setText('modal-icon', d.icon);
        this._setText('modal-title-text', d.title);
        this._setText('modal-body-text', d.body);

        const btn = document.getElementById('modal-cta-btn');
        if (btn) {
            btn.textContent = d.btn_text || btn.textContent;
            if (d.btn_url) btn.href = d.btn_url;
        }
    }

    // ============================================
    // HELPERS
    // ============================================

    _setText(id, value) {
        if (!value) return;
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    _esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    _reobserve(container) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); });
        }, { threshold: 0.1 });
        container.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof getSupabase === 'function') {
        const lc = new LandingContent();
        lc.init();
    }
});
