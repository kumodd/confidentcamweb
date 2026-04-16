// ============================================
// SCRIPTS PAGE CONTROLLER
// ============================================

let currentUser = null;
let currentFilter = 'all';
let currentSearch = '';
let editingScriptId = null;
let deletingScriptId = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing scripts page...');

    // Initialize services
    initSupabase();
    authService.init();
    scriptsService.init();
    realtimeService.init();

    // Check authentication
    const authenticated = await authService.requireAuth();
    if (!authenticated) return;

    // Get current user
    currentUser = await authService.getUser();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    // Setup UI
    setupUserInfo();
    setupLogout();
    setupSearch();
    setupFilters();
    setupModals();

    // Load data
    await loadScripts();

    // Setup realtime
    setupRealtime();

    // Check for edit param in URL
    checkEditParam();
});

// ============================================
// USER INFO & LOGOUT
// ============================================

function setupUserInfo() {
    const avatarEl = document.getElementById('user-avatar');
    const displayName = currentUser.user_metadata?.display_name ||
        currentUser.email?.split('@')[0] || 'U';
    avatarEl.textContent = displayName.charAt(0).toUpperCase();
}

function setupLogout() {
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await authService.signOut();
        realtimeService.unsubscribe();
        window.location.href = 'login.html';
    });
}

// ============================================
// SEARCH & FILTERS
// ============================================

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentSearch = e.target.value.trim();
            renderScripts();
        }, 300);
    });
}

function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderScripts();
        });
    });
}

// ============================================
// LOAD & RENDER SCRIPTS
// ============================================

async function loadScripts() {
    const result = await scriptsService.getScripts(currentUser.id);

    if (result.success) {
        renderScripts();
    } else {
        console.error('Failed to load scripts:', result.error);
        showError('Failed to load scripts. Please try again.');
    }
}

function renderScripts() {
    const container = document.getElementById('scripts-container');
    const emptyState = document.getElementById('empty-state');

    // Get filtered scripts
    let scripts = scriptsService.cache;

    // Apply search
    if (currentSearch) {
        scripts = scriptsService.searchScripts(currentSearch);
    }

    // Apply filter
    if (currentFilter === 'recorded') {
        scripts = scripts.filter(s => s.is_recorded);
    } else if (currentFilter === 'pending') {
        scripts = scripts.filter(s => !s.is_recorded);
    }

    // Show empty state if no scripts
    if (scripts.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    // Render script cards
    container.innerHTML = scripts.map(script => `
        <div class="script-card-full" data-id="${script.id}">
            <div class="script-card-header">
                <h3 class="script-card-title">${escapeHtml(script.title)}</h3>
                <span class="script-card-status ${script.is_recorded ? 'recorded' : 'pending'}">
                    ${script.is_recorded ? '✓ Recorded' : '○ Pending'}
                </span>
            </div>
            
            <div class="script-preview">
                <div class="script-preview-label">Hook</div>
                <div class="script-preview-text">${escapeHtml(script.part1 || 'No content yet...')}</div>
            </div>
            
            <div class="script-card-meta">
                <span>📅 ${formatDate(script.created_at)}</span>
                <span>✏️ ${formatDate(script.updated_at)}</span>
            </div>
            
            <div class="script-card-actions">
                <a href="teleprompter.html?id=${script.id}" class="btn btn-secondary btn-sm">
                    📺 Teleprompter
                </a>
                <button class="btn btn-ghost btn-sm edit-btn" data-id="${script.id}">
                    ✏️ Edit
                </button>
                <button class="btn btn-ghost btn-sm delete-btn" data-id="${script.id}" data-title="${escapeHtml(script.title)}">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');

    // Attach event listeners
    container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, btn.dataset.title));
    });
}

// ============================================
// EDIT MODAL
// ============================================

function setupModals() {
    // Edit modal
    const editModal = document.getElementById('edit-modal');
    const closeEdit = document.getElementById('close-modal');
    const cancelEdit = document.getElementById('cancel-edit');
    const scriptForm = document.getElementById('script-form');

    closeEdit.addEventListener('click', closeEditModal);
    cancelEdit.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });

    scriptForm.addEventListener('submit', handleSaveScript);

    // Delete modal
    const deleteModal = document.getElementById('delete-modal');
    const closeDelete = document.getElementById('close-delete-modal');
    const cancelDelete = document.getElementById('cancel-delete');
    const confirmDelete = document.getElementById('confirm-delete');

    closeDelete.addEventListener('click', closeDeleteModal);
    cancelDelete.addEventListener('click', closeDeleteModal);
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });
    confirmDelete.addEventListener('click', handleDeleteScript);
}

async function openEditModal(scriptId) {
    editingScriptId = scriptId;
    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('modal-title');

    if (scriptId) {
        // Editing existing script
        title.textContent = 'Edit Script';
        const result = await scriptsService.getScriptById(scriptId);

        if (result.success && result.script) {
            document.getElementById('script-id').value = result.script.id;
            document.getElementById('script-title').value = result.script.title;
            document.getElementById('script-part1').value = result.script.part1 || '';
            document.getElementById('script-part2').value = result.script.part2 || '';
            document.getElementById('script-part3').value = result.script.part3 || '';
        }
    } else {
        // Creating new script
        title.textContent = 'Create Script';
        document.getElementById('script-form').reset();
    }

    modal.classList.add('active');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
    document.getElementById('script-form').reset();
    document.getElementById('form-error').classList.add('hidden');
    editingScriptId = null;
}

async function handleSaveScript(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('save-script');
    const errorDiv = document.getElementById('form-error');

    const scriptData = {
        title: document.getElementById('script-title').value.trim(),
        part1: document.getElementById('script-part1').value.trim(),
        part2: document.getElementById('script-part2').value.trim(),
        part3: document.getElementById('script-part3').value.trim()
    };

    if (!scriptData.title) {
        showFormError(errorDiv, 'Please enter a title');
        return;
    }

    setButtonLoading(saveBtn, true);
    hideError(errorDiv);

    try {
        let result;

        if (editingScriptId) {
            result = await scriptsService.updateScript(editingScriptId, scriptData);
        } else {
            result = await scriptsService.createScript(currentUser.id, scriptData);
        }

        if (result.success) {
            closeEditModal();
            renderScripts();
            showToast(editingScriptId ? 'Script updated!' : 'Script created!');
        } else {
            showFormError(errorDiv, result.error || 'Failed to save script');
        }
    } catch (error) {
        showFormError(errorDiv, 'An unexpected error occurred');
        console.error('Save script error:', error);
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

// ============================================
// DELETE MODAL
// ============================================

function openDeleteModal(scriptId, title) {
    deletingScriptId = scriptId;
    document.getElementById('delete-script-title').textContent = title;
    document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('active');
    deletingScriptId = null;
}

async function handleDeleteScript() {
    if (!deletingScriptId) return;

    const confirmBtn = document.getElementById('confirm-delete');
    setButtonLoading(confirmBtn, true);

    try {
        const result = await scriptsService.deleteScript(deletingScriptId);

        if (result.success) {
            closeDeleteModal();
            renderScripts();
            showToast('Script deleted');
        } else {
            showToast('Failed to delete script', 'error');
        }
    } catch (error) {
        showToast('An error occurred', 'error');
        console.error('Delete error:', error);
    } finally {
        setButtonLoading(confirmBtn, false);
    }
}

// ============================================
// REALTIME UPDATES
// ============================================

function setupRealtime() {
    realtimeService
        .subscribeToScripts(currentUser.id)
        .onInsert((newScript) => {
            scriptsService.cache.unshift(newScript);
            renderScripts();
            showToast('New script synced from mobile!');
        })
        .onUpdate((updatedScript) => {
            const index = scriptsService.cache.findIndex(s => s.id === updatedScript.id);
            if (index !== -1) {
                scriptsService.cache[index] = updatedScript;
            }
            renderScripts();
        })
        .onDelete((deletedScript) => {
            scriptsService.cache = scriptsService.cache.filter(s => s.id !== deletedScript.id);
            renderScripts();
        });
}

// ============================================
// URL PARAMS
// ============================================

function checkEditParam() {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');

    if (editId) {
        // Wait for scripts to load, then open edit modal
        setTimeout(() => openEditModal(editId), 500);
    }
}

// ============================================
// HELPERS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
}

function showFormError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
}

function hideError(element) {
    element.classList.add('hidden');
}

function setButtonLoading(button, loading) {
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✅' : '❌'}</span>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add toast styles
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
`;
document.head.appendChild(toastStyles);
