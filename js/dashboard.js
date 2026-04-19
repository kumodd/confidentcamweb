// ============================================
// DASHBOARD PAGE CONTROLLER
// ============================================

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing dashboard...');

    // Initialize services
    initSupabase();
    authService.init();
    scriptsService.init();
    realtimeService.init();

    // Check authentication - this sets authService.currentUser
    const authenticated = await authService.requireAuth();
    if (!authenticated) return;

    // Use the user from authService (already set by requireAuth)
    currentUser = authService.currentUser;
    if (!currentUser) {
        console.error('No user found after auth check');
        return;
    }

    console.log('✅ Dashboard loaded for user:', currentUser.id);

    // Setup UI
    setupUserInfo();
    setupLogout();
    setupHowToUse();

    // Load data
    await loadScripts();

    // Setup realtime
    setupRealtime();
});

// ============================================
// USER INFO
// ============================================

function setupUserInfo() {
    const emailEl = document.getElementById('user-email');
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');

    const email = currentUser.email || '';
    const displayName = currentUser.user_metadata?.display_name || email.split('@')[0] || 'Creator';
    const initial = displayName.charAt(0).toUpperCase();

    if (emailEl) emailEl.textContent = email;
    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl) nameEl.textContent = displayName;
}

// ============================================
// LOGOUT
// ============================================

function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');

    logoutBtn.addEventListener('click', async () => {
        const result = await authService.signOut();
        if (result.success) {
            realtimeService.unsubscribe();
            window.location.href = 'login.html';
        }
    });
}

// ============================================
// HOW TO USE BUTTON
// ============================================

function setupHowToUse() {
    const btn = document.getElementById('how-to-use-btn');
    if (!btn) return;

    const videoUrl = APP_CONFIG.howToUseVideoUrl;
    if (videoUrl) {
        btn.href = videoUrl;
        btn.target = '_blank';
    } else {
        btn.style.display = 'none';
    }
}

// ============================================
// LOAD SCRIPTS
// ============================================

async function loadScripts() {
    const userId = currentUser.id;
    const result = await scriptsService.getScripts(userId);

    if (result.success) {
        updateStats();
        renderRecentScripts();
    } else {
        console.error('Failed to load scripts:', result.error);
    }
}

function updateStats() {
    const stats = scriptsService.getStats();

    document.getElementById('total-scripts').textContent = stats.total;
    document.getElementById('recorded-scripts').textContent = stats.recorded;
    document.getElementById('pending-scripts').textContent = stats.pending;

    // Calculate streak (simplified - based on scripts created in consecutive days)
    document.getElementById('creation-streak').textContent = calculateStreak();
}

function calculateStreak() {
    const scripts = scriptsService.cache;
    if (scripts.length === 0) return 0;

    let streak = 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get unique dates of script creation
    const dates = [...new Set(scripts.map(s => {
        const d = new Date(s.created_at);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }))].sort((a, b) => b - a);

    if (dates.length === 0) return 0;

    // Check if most recent is today or yesterday
    const mostRecent = dates[0];
    const dayDiff = Math.floor((today - mostRecent) / (1000 * 60 * 60 * 24));

    if (dayDiff > 1) return 0; // Streak broken

    // Count consecutive days
    for (let i = 1; i < dates.length; i++) {
        const diff = Math.floor((dates[i - 1] - dates[i]) / (1000 * 60 * 60 * 24));
        if (diff === 1) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

function renderRecentScripts() {
    const container = document.getElementById('recent-scripts');
    const emptyState = document.getElementById('empty-state');
    const recentScripts = scriptsService.getRecentScripts(5);

    if (recentScripts.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    container.innerHTML = recentScripts.map(script => `
        <div class="script-card" data-id="${script.id}">
            <div class="script-info">
                <div class="script-title">${escapeHtml(script.title)}</div>
                <div class="script-meta">
                    <span>📅 ${formatDate(script.created_at)}</span>
                    <span class="script-status ${script.is_recorded ? 'recorded' : 'pending'}">
                        ${script.is_recorded ? '✓ Recorded' : '○ Pending'}
                    </span>
                </div>
            </div>
            <div class="script-actions">
                <a href="teleprompter.html?id=${script.id}" class="btn btn-secondary btn-sm">
                    📺 Teleprompter
                </a>
                <a href="scripts.html?edit=${script.id}" class="btn btn-ghost btn-sm">
                    ✏️ Edit
                </a>
            </div>
        </div>
    `).join('');
}

// ============================================
// REALTIME UPDATES
// ============================================

function setupRealtime() {
    realtimeService
        .subscribeToScripts(currentUser.id)
        .onInsert((newScript) => {
            console.log('📡 New script received:', newScript.title);
            scriptsService.cache.unshift(newScript);
            updateStats();
            renderRecentScripts();
            showNotification('New script synced from mobile app!');
        })
        .onUpdate((updatedScript) => {
            console.log('📡 Script updated:', updatedScript.title);
            const index = scriptsService.cache.findIndex(s => s.id === updatedScript.id);
            if (index !== -1) {
                scriptsService.cache[index] = updatedScript;
            }
            updateStats();
            renderRecentScripts();
        })
        .onDelete((deletedScript) => {
            console.log('📡 Script deleted:', deletedScript.id);
            scriptsService.cache = scriptsService.cache.filter(s => s.id !== deletedScript.id);
            updateStats();
            renderRecentScripts();
        });
}

function showNotification(message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <span class="toast-icon">🔔</span>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// HELPERS
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }
}

// Add toast styles dynamically
const toastStyles = document.createElement('style');
toastStyles.textContent = `
    .toast-notification {
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 24px;
        background: var(--bg-card);
        border: 1px solid var(--accent-pink);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        transform: translateY(100px);
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 9999;
    }
    
    .toast-notification.show {
        transform: translateY(0);
        opacity: 1;
    }
    
    .toast-icon {
        font-size: 20px;
    }
    
    .toast-message {
        color: var(--text-primary);
        font-size: var(--font-size-sm);
    }
`;
document.head.appendChild(toastStyles);
