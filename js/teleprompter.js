// ============================================
// TELEPROMPTER CONTROLLER
// Advanced teleprompter with voice control, mirroring, countdown,
// progress tracking, fullscreen, wake lock, persistence, and shortcuts
// ============================================

let currentUser = null;
let selectedScript = null;
let selectedScriptId = null; // track DB script id for mark-as-recorded

const PREFS_STORAGE_KEY = 'cc_teleprompter_prefs';

const DEFAULT_PREFS = {
    scrollSpeed: (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.defaultTeleprompterSpeed) || 50,
    fontSize: 48,
    lineHeight: 1.8,
    textColor: '#FFFFFF',
    bgColor: '#000000',
    fontFamily: 'sans',     // sans | serif | mono
    textAlign: 'center',    // left | center | right
    contentWidth: 90,       // percentage
    eyeLinePos: 50,         // reading line vertical percentage (20-60)
    showPartLabels: true,
    showDivider: true,
    autoHideControls: true,
    countdownSeconds: 3     // 0 = disabled
};

// Teleprompter State
const state = {
    isPlaying: false,
    isMirrored: false,
    isVoiceActive: false,
    scrollPosition: 0,
    ...DEFAULT_PREFS,
    animationFrame: null,
    lastTimestamp: null
};

// Timers & Handles
let elapsedInterval = null;
let elapsedSeconds = 0;
let countdownInterval = null;
let controlsTimeout = null;
let toastTimeout = null;
let wakeLockSentinel = null;

// Voice Recognition
let recognition = null;

// Font family map
const FONT_MAP = {
    sans: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    serif: "'Merriweather', Georgia, 'Times New Roman', serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace"
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Teleprompter...');

    // Restore persisted user preferences before wiring UI
    loadSavedSettings();

    // Initialize services
    initSupabase();
    authService.init();
    scriptsService.init();

    // Check authentication
    const authenticated = await authService.requireAuth();
    if (!authenticated) return;

    // Get current user
    currentUser = await authService.getUser();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    // Setup selection UI
    setupUserInfo();
    setupLogout();
    setupCustomText();
    setupScriptSearch();

    // Load scripts
    await loadScripts();

    // Setup teleprompter controls
    setupTeleprompterControls();
    setupSettings();
    setupKeyboardShortcuts();
    setupVoiceRecognition();
    setupManualScroll();
    setupControlsAutoHide();
    setupFullscreen();
    setupShortcutsOverlay();
    setupPartNavigation();
    setupWakeLockLifecycle();

    // Check if script ID in URL (after scripts & controls are ready)
    await checkUrlParams();
});

// ============================================
// SELECTION VIEW
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
        window.location.href = 'login.html';
    });
}

function setupCustomText() {
    const textarea = document.getElementById('custom-text');
    const wordStatsEl = document.getElementById('custom-word-count');
    const clearBtn = document.getElementById('clear-custom-btn');

    const updateCustomStats = () => {
        const text = textarea.value.trim();
        const words = text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
        const mins = words > 0 ? Math.max(1, Math.round(words / 150)) : 0;
        wordStatsEl.textContent = `${words} word${words === 1 ? '' : 's'} • ~${mins} min`;
        clearBtn.classList.toggle('hidden', text.length === 0);
    };

    textarea.addEventListener('input', updateCustomStats);

    // Allow Ctrl/Cmd + Enter to launch quickly
    textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('start-custom-btn').click();
        }
    });

    clearBtn.addEventListener('click', () => {
        textarea.value = '';
        updateCustomStats();
        textarea.focus();
    });

    document.getElementById('start-custom-btn').addEventListener('click', () => {
        const customText = textarea.value.trim();
        if (customText) {
            selectedScriptId = null;
            startTeleprompter({
                title: 'Custom Script',
                fullText: customText
            });
        }
    });
}

/** Search & filter scripts in selection view */
function setupScriptSearch() {
    const searchInput = document.getElementById('script-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderScriptsList());
    }

    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            renderScriptsList();
        });
    });
}

async function loadScripts() {
    const result = await scriptsService.getScripts(currentUser.id);

    if (result.success) {
        renderScriptsList();
    }
}

function renderScriptsList() {
    const container = document.getElementById('scripts-list');
    const emptyState = document.getElementById('empty-state');
    let scripts = scriptsService.cache;

    // Apply search filter
    const searchInput = document.getElementById('script-search');
    const query = searchInput?.value?.trim().toLowerCase() || '';
    if (query) {
        scripts = scripts.filter(s =>
            s.title.toLowerCase().includes(query) ||
            (s.part1 || '').toLowerCase().includes(query) ||
            (s.part2 || '').toLowerCase().includes(query) ||
            (s.part3 || '').toLowerCase().includes(query)
        );
    }

    // Apply status filter
    const activeFilter = document.querySelector('.filter-pill.active')?.dataset?.filter || 'all';
    if (activeFilter === 'pending') {
        scripts = scripts.filter(s => !s.is_recorded);
    } else if (activeFilter === 'recorded') {
        scripts = scripts.filter(s => s.is_recorded);
    }

    if (scripts.length === 0 && scriptsService.cache.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    if (scripts.length === 0) {
        container.innerHTML = `
            <div class="no-results-state">
                <p>No scripts match your search</p>
            </div>
        `;
        return;
    }

    container.innerHTML = scripts.map(script => {
        const preview = script.part1 || script.part2 || 'No content';
        const recordedBadge = script.is_recorded
            ? '<span class="recorded-badge">✅ Recorded</span>'
            : '';
        return `
            <div class="script-select-card" data-id="${script.id}">
                <div class="script-select-header">
                    <div class="script-select-title">${escapeHtml(script.title)}</div>
                    ${recordedBadge}
                </div>
                <div class="script-select-preview">${escapeHtml(preview)}</div>
                <div class="script-select-meta">
                    ${countWords(script)} words • ${formatDate(script.created_at)}
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.script-select-card').forEach(card => {
        card.addEventListener('click', () => {
            const scriptId = card.dataset.id;
            const script = scriptsService.cache.find(s => s.id === scriptId);
            if (script) {
                launchDatabaseScript(script);
            }
        });
    });
}

function launchDatabaseScript(script) {
    selectedScriptId = script.id;
    startTeleprompter({
        title: script.title,
        part1: script.part1,
        part2: script.part2,
        part3: script.part3,
        fullText: `${script.part1 || ''}\n\n${script.part2 || ''}\n\n${script.part3 || ''}`.trim()
    });
}

async function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const scriptId = params.get('id');

    if (!scriptId) return;

    let script = scriptsService.cache.find(s => s.id === scriptId);
    if (!script) {
        const result = await scriptsService.getScriptById(scriptId);
        if (result.success) {
            script = result.script;
        }
    }

    if (script) {
        launchDatabaseScript(script);
    }
}

// ============================================
// TELEPROMPTER CONTENT & VIEW ENTRY
// ============================================

function startTeleprompter(script) {
    selectedScript = script;

    // Update title
    document.getElementById('current-script-title').textContent = script.title;

    // Calculate & display word count + read time
    const totalText = script.fullText || `${script.part1 || ''} ${script.part2 || ''} ${script.part3 || ''}`;
    const wordCount = totalText.trim().split(/\s+/).filter(w => w.length > 0).length;
    const readMinutes = Math.max(1, Math.round(wordCount / 150)); // ~150 wpm speaking pace

    document.getElementById('word-count-display').textContent = `${wordCount} words`;
    document.getElementById('read-time-display').textContent = `~${readMinutes} min`;

    // Render script content
    renderScriptContent(script);

    // Apply visual styles
    applyStyles();

    // Reset scroll & timers
    resetScroll();

    // Show/hide mark-as-recorded button
    const markBtn = document.getElementById('mark-recorded-btn');
    if (selectedScriptId) {
        markBtn.classList.remove('hidden');
        const cachedScript = scriptsService.cache.find(s => s.id === selectedScriptId);
        if (cachedScript?.is_recorded) {
            markBtn.textContent = '✅ Recorded';
            markBtn.classList.add('done');
        } else {
            markBtn.textContent = '✅ Done';
            markBtn.classList.remove('done');
        }
    } else {
        markBtn.classList.add('hidden');
    }

    // Show teleprompter view & controls
    const view = document.getElementById('teleprompter-view');
    document.getElementById('selection-view').classList.add('hidden');
    view.classList.remove('hidden');
    view.classList.add('controls-visible');

    // Keep screen awake during presentation
    requestWakeLock();
}

/** Render markdown script content into #teleprompter-content without resetting playback */
function renderScriptContent(script) {
    let contentHTML = '';

    // Configure marked for teleprompter-friendly output
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,  // Convert \n to <br>
            gfm: true      // GitHub Flavored Markdown
        });
    }

    const partNav = document.getElementById('part-nav');
    const hookBtn = partNav.querySelector('[data-part="hook"]');
    const bodyBtn = partNav.querySelector('[data-part="body"]');
    const closeBtn = partNav.querySelector('[data-part="close"]');

    if (script.part1 || script.part2 || script.part3) {
        if (script.part1) {
            if (state.showPartLabels) {
                contentHTML += `<span class="script-part-label" data-part="hook">Hook</span>`;
            }
            contentHTML += `<div class="script-part-text" data-part="hook">${renderMarkdown(script.part1)}</div>`;
        }
        if (script.part2) {
            if (state.showPartLabels) {
                contentHTML += `<span class="script-part-label" data-part="body">Body</span>`;
            }
            contentHTML += `<div class="script-part-text" data-part="body">${renderMarkdown(script.part2)}</div>`;
        }
        if (script.part3) {
            if (state.showPartLabels) {
                contentHTML += `<span class="script-part-label" data-part="close">Close</span>`;
            }
            contentHTML += `<div class="script-part-text" data-part="close">${renderMarkdown(script.part3)}</div>`;
        }

        // Only show part buttons that exist
        hookBtn.classList.toggle('hidden', !script.part1);
        bodyBtn.classList.toggle('hidden', !script.part2);
        closeBtn.classList.toggle('hidden', !script.part3);
        partNav.classList.remove('hidden');
    } else {
        contentHTML = `<div class="script-part-text">${renderMarkdown(script.fullText)}</div>`;
        partNav.classList.add('hidden');
    }

    document.getElementById('teleprompter-content').innerHTML = contentHTML;
}

/** Render markdown to HTML */
function renderMarkdown(text) {
    if (!text) return '';

    // Use marked.js if available
    if (typeof marked !== 'undefined') {
        return marked.parse(text);
    }

    // Fallback: simple markdown rendering
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')               // Italic
        .replace(/^- (.*)$/gm, '<li>$1</li>')               // List items
        .replace(/^(\d+)\. (.*)$/gm, '<li>$2</li>')        // Numbered lists
        .replace(/\n\n/g, '</p><p>')                        // Paragraphs
        .replace(/\n/g, '<br>');                            // Line breaks
}

function setupTeleprompterControls() {
    // Exit
    document.getElementById('exit-btn').addEventListener('click', exitTeleprompter);

    // Play/Pause (uses countdown when starting from 0)
    document.getElementById('play-pause-btn').addEventListener('click', playWithCountdown);

    // Click countdown overlay to cancel
    document.getElementById('countdown-overlay').addEventListener('click', () => {
        cancelCountdown();
        showStudioToast('Countdown cancelled');
    });

    // Reset
    document.getElementById('reset-btn').addEventListener('click', resetScroll);

    // Speed controls
    document.getElementById('slower-btn').addEventListener('click', () => adjustSpeed(-10));
    document.getElementById('faster-btn').addEventListener('click', () => adjustSpeed(10));

    // Mirror
    document.getElementById('mirror-btn').addEventListener('click', toggleMirror);

    // Voice control
    document.getElementById('voice-btn').addEventListener('click', toggleVoice);

    // Settings
    document.getElementById('settings-btn').addEventListener('click', toggleSettings);
    document.getElementById('close-settings').addEventListener('click', () => {
        document.getElementById('settings-panel').classList.add('hidden');
        scheduleControlsHide();
    });

    // Mark as recorded
    document.getElementById('mark-recorded-btn').addEventListener('click', markAsRecorded);
}

function exitTeleprompter() {
    cancelCountdown();
    stopScrolling();
    stopVoice();
    stopElapsedTimer();
    releaseWakeLock();

    document.getElementById('settings-panel').classList.add('hidden');
    document.getElementById('shortcuts-overlay').classList.add('hidden');
    document.getElementById('teleprompter-view').classList.add('hidden');
    document.getElementById('selection-view').classList.remove('hidden');

    // Exit fullscreen
    if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
    }

    // Refresh list in case mark-as-recorded changed status
    renderScriptsList();
}

// ============================================
// COUNTDOWN
// ============================================

/** Play with countdown if enabled and starting from top, otherwise toggle immediately */
function playWithCountdown() {
    if (countdownInterval) {
        cancelCountdown();
        showStudioToast('Countdown cancelled');
        return;
    }

    if (state.isPlaying) {
        stopScrolling();
        return;
    }

    // Auto-rewind if already at end of script
    if (state.scrollPosition >= getMaxScroll() - 2) {
        resetScroll();
    }

    if (state.countdownSeconds > 0 && state.scrollPosition === 0) {
        runCountdown(state.countdownSeconds);
    } else {
        startScrolling();
    }
}

/** Run visual countdown then start scrolling */
function runCountdown(seconds) {
    cancelCountdown();

    const overlay = document.getElementById('countdown-overlay');
    const numberEl = document.getElementById('countdown-number');
    overlay.classList.remove('hidden');

    let remaining = seconds;
    numberEl.textContent = remaining;
    numberEl.className = 'countdown-number pop';

    countdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            cancelCountdown();
            startScrolling();
        } else {
            numberEl.textContent = remaining;
            // Re-trigger animation
            numberEl.classList.remove('pop');
            void numberEl.offsetWidth; // force reflow
            numberEl.classList.add('pop');
        }
    }, 1000);
}

/** Cancel any active countdown cleanly */
function cancelCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    const overlay = document.getElementById('countdown-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// ============================================
// SCROLLING & POSITION HELPERS
// ============================================

/** Compute maximum scroll offset for the current script content */
function getMaxScroll() {
    const content = document.getElementById('teleprompter-content');
    const container = document.getElementById('teleprompter-container');
    if (!content || !container) return 1;
    const viewportHeight = container.clientHeight || window.innerHeight;
    return Math.max(1, content.scrollHeight - viewportHeight + 120);
}

/** Apply translateY + optional horizontal mirror transform */
function applyScrollTransform() {
    const content = document.getElementById('teleprompter-content');
    if (!content) return;
    content.style.transform = `translateY(-${state.scrollPosition}px)${state.isMirrored ? ' scaleX(-1)' : ''}`;
}

/** Clamp scroll position, apply transform, and sync progress/active-part UI */
function setScrollPosition(nextPos) {
    const maxScroll = getMaxScroll();
    state.scrollPosition = Math.max(0, Math.min(nextPos, maxScroll));
    applyScrollTransform();
    updateProgress();
    updateActivePart();
}

function startScrolling() {
    state.isPlaying = true;
    state.lastTimestamp = null;

    document.getElementById('play-pause-btn').textContent = '⏸️';
    document.getElementById('teleprompter-content').classList.add('scrolling');

    // Start elapsed timer & schedule control auto-hide
    startElapsedTimer();
    scheduleControlsHide();

    // Start animation loop
    state.animationFrame = requestAnimationFrame(scrollStep);
}

function stopScrolling() {
    state.isPlaying = false;

    document.getElementById('play-pause-btn').textContent = '▶️';
    document.getElementById('teleprompter-content').classList.remove('scrolling');

    // Pause elapsed timer & reveal controls while paused
    stopElapsedTimer();
    clearTimeout(controlsTimeout);
    document.getElementById('teleprompter-view').classList.add('controls-visible');

    if (state.animationFrame) {
        cancelAnimationFrame(state.animationFrame);
        state.animationFrame = null;
    }
}

function scrollStep(timestamp) {
    if (!state.isPlaying) return;

    if (!state.lastTimestamp) {
        state.lastTimestamp = timestamp;
    }

    const elapsed = timestamp - state.lastTimestamp;
    state.lastTimestamp = timestamp;

    // Calculate scroll amount based on speed (pixels per second)
    const scrollAmount = (state.scrollSpeed / 1000) * elapsed;
    const maxScroll = getMaxScroll();

    setScrollPosition(state.scrollPosition + scrollAmount);

    if (state.scrollPosition >= maxScroll) {
        stopScrolling();
        onScrollComplete();
        return;
    }

    state.animationFrame = requestAnimationFrame(scrollStep);
}

/** Called when auto-scroll reaches the end */
function onScrollComplete() {
    const markBtn = document.getElementById('mark-recorded-btn');
    if (!markBtn.classList.contains('hidden') && !markBtn.classList.contains('done')) {
        markBtn.classList.add('pulse-attention');
        setTimeout(() => markBtn.classList.remove('pulse-attention'), 3000);
    }
    showStudioToast('Reached end of script');
}

function resetScroll() {
    cancelCountdown();
    stopScrolling();
    resetElapsedTime();
    setScrollPosition(0);
}

function adjustSpeed(delta) {
    state.scrollSpeed = Math.max(10, Math.min(150, state.scrollSpeed + delta));
    document.getElementById('speed-display').textContent = state.scrollSpeed;
    document.getElementById('scroll-speed').value = state.scrollSpeed;
    document.getElementById('scroll-speed-value').textContent = state.scrollSpeed;
    saveSettings();
    showStudioToast(`Speed: ${state.scrollSpeed}`);
}

// ============================================
// PROGRESS TRACKING
// ============================================

/** Update the progress bar fill and percentage badge */
function updateProgress() {
    const progressBar = document.getElementById('progress-bar');
    const progressPct = document.getElementById('progress-percent');
    if (!progressBar) return;

    const maxScroll = getMaxScroll();
    const pct = Math.round(Math.min(100, (state.scrollPosition / maxScroll) * 100));
    progressBar.style.width = `${pct}%`;
    if (progressPct) {
        progressPct.textContent = `${pct}%`;
    }
}

// ============================================
// ELAPSED TIMER
// ============================================

function startElapsedTimer() {
    if (elapsedInterval) return;
    elapsedInterval = setInterval(() => {
        elapsedSeconds++;
        renderElapsedTime();
    }, 1000);
}

function stopElapsedTimer() {
    clearInterval(elapsedInterval);
    elapsedInterval = null;
}

function resetElapsedTime() {
    stopElapsedTimer();
    elapsedSeconds = 0;
    renderElapsedTime();
}

function renderElapsedTime() {
    const el = document.getElementById('elapsed-time');
    if (!el) return;
    const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const secs = String(elapsedSeconds % 60).padStart(2, '0');
    el.textContent = `${mins}:${secs}`;
}

// ============================================
// MIRROR
// ============================================

function toggleMirror() {
    state.isMirrored = !state.isMirrored;

    const content = document.getElementById('teleprompter-content');
    const mirrorBtn = document.getElementById('mirror-btn');

    content.classList.toggle('mirrored', state.isMirrored);
    mirrorBtn.classList.toggle('active', state.isMirrored);

    applyScrollTransform();
    showStudioToast(state.isMirrored ? 'Mirror mode On' : 'Mirror mode Off');
}

// ============================================
// SETTINGS & PERSISTENCE
// ============================================

function loadSavedSettings() {
    try {
        const raw = localStorage.getItem(PREFS_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        for (const key of Object.keys(DEFAULT_PREFS)) {
            if (parsed[key] !== undefined) {
                state[key] = parsed[key];
            }
        }
    } catch (e) {
        console.log('Could not load saved teleprompter preferences:', e);
    }
}

function saveSettings() {
    try {
        const prefs = {};
        for (const key of Object.keys(DEFAULT_PREFS)) {
            prefs[key] = state[key];
        }
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
        console.log('Could not save teleprompter preferences:', e);
    }
}

/** Sync all Settings UI inputs and active buttons with current state */
function syncSettingsUI() {
    document.getElementById('font-size').value = state.fontSize;
    document.getElementById('font-size-value').textContent = `${state.fontSize}px`;

    document.getElementById('scroll-speed').value = state.scrollSpeed;
    document.getElementById('scroll-speed-value').textContent = state.scrollSpeed;
    document.getElementById('speed-display').textContent = state.scrollSpeed;

    document.getElementById('line-height').value = state.lineHeight;
    document.getElementById('line-height-value').textContent = Number(state.lineHeight).toFixed(1);

    document.getElementById('content-width').value = state.contentWidth;
    document.getElementById('content-width-value').textContent = `${state.contentWidth}%`;

    document.getElementById('eyeline-pos').value = state.eyeLinePos;
    document.getElementById('eyeline-pos-value').textContent = `${state.eyeLinePos}%`;

    document.querySelectorAll('.font-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.font === state.fontFamily);
    });
    document.querySelectorAll('.align-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.align === state.textAlign);
    });
    document.querySelectorAll('.color-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.color === state.textColor);
    });
    document.querySelectorAll('.bg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.bg === state.bgColor);
    });
    document.querySelectorAll('.countdown-opt-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.seconds, 10) === state.countdownSeconds);
    });

    document.getElementById('show-parts').checked = state.showPartLabels;
    document.getElementById('show-divider').checked = state.showDivider;
    document.getElementById('auto-hide-controls').checked = state.autoHideControls;

    document.getElementById('teleprompter-view').classList.toggle('controls-always-visible', !state.autoHideControls);
}

function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    const isOpening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    document.getElementById('shortcuts-overlay').classList.add('hidden');
    if (isOpening) {
        clearTimeout(controlsTimeout);
        document.getElementById('teleprompter-view').classList.add('controls-visible');
    } else {
        scheduleControlsHide();
    }
}

function setupSettings() {
    // Sync initial UI state from loaded preferences
    syncSettingsUI();

    // Font Size
    document.getElementById('font-size').addEventListener('input', (e) => {
        state.fontSize = parseInt(e.target.value, 10);
        document.getElementById('font-size-value').textContent = `${state.fontSize}px`;
        applyStyles();
        saveSettings();
    });

    // Scroll Speed
    document.getElementById('scroll-speed').addEventListener('input', (e) => {
        state.scrollSpeed = parseInt(e.target.value, 10);
        document.getElementById('scroll-speed-value').textContent = state.scrollSpeed;
        document.getElementById('speed-display').textContent = state.scrollSpeed;
        saveSettings();
    });

    // Line Height
    document.getElementById('line-height').addEventListener('input', (e) => {
        state.lineHeight = parseFloat(e.target.value);
        document.getElementById('line-height-value').textContent = state.lineHeight.toFixed(1);
        applyStyles();
        saveSettings();
    });

    // Content Width
    document.getElementById('content-width').addEventListener('input', (e) => {
        state.contentWidth = parseInt(e.target.value, 10);
        document.getElementById('content-width-value').textContent = `${state.contentWidth}%`;
        applyStyles();
        saveSettings();
    });

    // Eye-Line Position
    document.getElementById('eyeline-pos').addEventListener('input', (e) => {
        state.eyeLinePos = parseInt(e.target.value, 10);
        document.getElementById('eyeline-pos-value').textContent = `${state.eyeLinePos}%`;
        applyStyles();
        saveSettings();
    });

    // Font Family
    document.querySelectorAll('.font-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.fontFamily = btn.dataset.font;
            applyStyles();
            saveSettings();
        });
    });

    // Text Alignment
    document.querySelectorAll('.align-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.textAlign = btn.dataset.align;
            applyStyles();
            saveSettings();
        });
    });

    // Text Color
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.textColor = btn.dataset.color;
            applyStyles();
            saveSettings();
        });
    });

    // Background Color
    document.querySelectorAll('.bg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.bgColor = btn.dataset.bg;
            applyStyles();
            saveSettings();
        });
    });

    // Countdown seconds
    document.querySelectorAll('.countdown-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.countdown-opt-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.countdownSeconds = parseInt(btn.dataset.seconds, 10);
            saveSettings();
        });
    });

    // Show Parts (re-renders labels in place without losing scroll position)
    document.getElementById('show-parts').addEventListener('change', (e) => {
        state.showPartLabels = e.target.checked;
        saveSettings();
        if (selectedScript) {
            renderScriptContent(selectedScript);
            setScrollPosition(state.scrollPosition);
        }
    });

    // Show Divider (reading line)
    document.getElementById('show-divider').addEventListener('change', (e) => {
        state.showDivider = e.target.checked;
        applyStyles();
        saveSettings();
    });

    // Auto-hide controls
    document.getElementById('auto-hide-controls').addEventListener('change', (e) => {
        state.autoHideControls = e.target.checked;
        const view = document.getElementById('teleprompter-view');
        view.classList.toggle('controls-always-visible', !state.autoHideControls);
        if (state.autoHideControls && state.isPlaying) {
            scheduleControlsHide();
        }
        saveSettings();
    });

    // Reset Settings to Defaults
    document.getElementById('reset-settings-btn').addEventListener('click', () => {
        Object.assign(state, DEFAULT_PREFS);
        localStorage.removeItem(PREFS_STORAGE_KEY);
        syncSettingsUI();
        applyStyles();
        if (selectedScript) {
            renderScriptContent(selectedScript);
            setScrollPosition(state.scrollPosition);
        }
        showStudioToast('Settings reset to defaults');
    });
}

function applyStyles() {
    const content = document.getElementById('teleprompter-content');
    const view = document.getElementById('teleprompter-view');
    const readingLine = document.querySelector('.reading-line');

    content.style.fontSize = `${state.fontSize}px`;
    content.style.lineHeight = state.lineHeight;
    content.style.color = state.textColor;
    content.style.fontFamily = FONT_MAP[state.fontFamily] || FONT_MAP.sans;
    content.style.textAlign = state.textAlign;
    content.style.maxWidth = `${state.contentWidth}%`;
    view.style.backgroundColor = state.bgColor;

    // Align top/bottom scroll padding and reading line to eye-line position
    view.style.setProperty('--eyeline-pos', `${state.eyeLinePos}%`);
    content.style.paddingTop = `${state.eyeLinePos}vh`;
    content.style.paddingBottom = `${100 - state.eyeLinePos}vh`;

    // Toggle reading line visibility
    if (readingLine) {
        readingLine.style.display = state.showDivider ? 'block' : 'none';
    }
}

// ============================================
// FULLSCREEN & WAKE LOCK
// ============================================

function setupFullscreen() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (!fullscreenBtn) return;

    fullscreenBtn.addEventListener('click', toggleFullscreen);

    document.addEventListener('fullscreenchange', () => {
        const isFull = !!document.fullscreenElement;
        fullscreenBtn.textContent = isFull ? '⤡' : '⛶';
        fullscreenBtn.title = isFull ? 'Exit Fullscreen (F)' : 'Fullscreen (F)';
        fullscreenBtn.classList.toggle('active', isFull);
    });
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(err => {
            console.log('Fullscreen request failed:', err);
        });
    } else {
        document.exitFullscreen?.().catch(() => {});
    }
}

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (e) {
        console.log('Wake Lock unavailable:', e);
    }
}

function releaseWakeLock() {
    if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
    }
}

function setupWakeLockLifecycle() {
    document.addEventListener('visibilitychange', () => {
        const isTeleprompterOpen = !document.getElementById('teleprompter-view').classList.contains('hidden');
        if (document.visibilityState === 'visible' && isTeleprompterOpen) {
            requestWakeLock();
        }
    });
}

// ============================================
// SHORTCUTS OVERLAY
// ============================================

function setupShortcutsOverlay() {
    const shortcutsBtn = document.getElementById('shortcuts-btn');
    const closeShortcuts = document.getElementById('close-shortcuts');
    const overlay = document.getElementById('shortcuts-overlay');

    shortcutsBtn?.addEventListener('click', () => {
        const isOpening = overlay.classList.contains('hidden');
        overlay.classList.toggle('hidden');
        document.getElementById('settings-panel').classList.add('hidden');
        if (isOpening) {
            clearTimeout(controlsTimeout);
            document.getElementById('teleprompter-view').classList.add('controls-visible');
        } else {
            scheduleControlsHide();
        }
    });

    closeShortcuts?.addEventListener('click', () => {
        overlay.classList.add('hidden');
        scheduleControlsHide();
    });

    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.add('hidden');
            scheduleControlsHide();
        }
    });
}

// ============================================
// PART NAVIGATION
// ============================================

function setupPartNavigation() {
    document.querySelectorAll('.part-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            jumpToPart(btn.dataset.part);
        });
    });
}

/** Jump scroll position smoothly to a specific script section (hook | body | close) */
function jumpToPart(partName) {
    const labelEl = document.querySelector(`.script-part-label[data-part="${partName}"]`);
    const partEl = document.querySelector(`.script-part-text[data-part="${partName}"]`);
    const targetEl = labelEl || partEl;
    if (!targetEl) return;

    if (state.isPlaying) stopScrolling();

    const container = document.getElementById('teleprompter-container');
    const viewportHeight = container.clientHeight || window.innerHeight;
    // Place target right above the eye-line position
    const targetOffset = targetEl.offsetTop - viewportHeight * (state.eyeLinePos / 100);

    setScrollPosition(targetOffset);
}

/** Highlight active section button based on current scroll position */
function updateActivePart() {
    const partNav = document.getElementById('part-nav');
    if (!partNav || partNav.classList.contains('hidden')) return;

    const container = document.getElementById('teleprompter-container');
    const eyeLineY = state.scrollPosition + (container.clientHeight || window.innerHeight) * (state.eyeLinePos / 100);

    const parts = ['hook', 'body', 'close'];
    let activePart = 'hook';

    for (const part of parts) {
        const el = document.querySelector(`.script-part-label[data-part="${part}"]`) ||
            document.querySelector(`.script-part-text[data-part="${part}"]`);
        if (el && el.offsetTop <= eyeLineY + 24) {
            activePart = part;
        }
    }

    partNav.querySelectorAll('.part-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.part === activePart);
    });
}

// ============================================
// MARK AS RECORDED
// ============================================

async function markAsRecorded() {
    if (!selectedScriptId) return;

    const btn = document.getElementById('mark-recorded-btn');
    if (btn.classList.contains('done')) return;

    btn.textContent = '⏳...';
    btn.disabled = true;

    const result = await scriptsService.markAsRecorded(selectedScriptId);

    if (result.success) {
        btn.textContent = '✅ Recorded';
        btn.classList.add('done');
        btn.disabled = false;
        showStudioToast('Script marked as recorded!');
    } else {
        btn.textContent = '❌ Failed';
        btn.disabled = false;
        showStudioToast('Failed to update script status');
        setTimeout(() => { btn.textContent = '✅ Done'; }, 2000);
    }
}

// ============================================
// CONTROLS AUTO-HIDE & STUDIO TOAST
// ============================================

function setupControlsAutoHide() {
    const view = document.getElementById('teleprompter-view');
    const container = document.getElementById('teleprompter-container');
    if (!view || !container) return;

    view.addEventListener('mousemove', showControlsTemporarily);

    // Tap container (without dragging) toggles controls when playing
    let tapStartY = 0;
    container.addEventListener('pointerdown', (e) => {
        tapStartY = e.clientY;
    });
    container.addEventListener('click', (e) => {
        if (Math.abs(e.clientY - tapStartY) > 6) return;
        if (state.isPlaying && state.autoHideControls) {
            if (view.classList.contains('controls-visible')) {
                view.classList.remove('controls-visible');
                clearTimeout(controlsTimeout);
            } else {
                showControlsTemporarily();
            }
        } else {
            showControlsTemporarily();
        }
    });
}

function showControlsTemporarily() {
    const view = document.getElementById('teleprompter-view');
    view.classList.add('controls-visible');
    scheduleControlsHide();
}

function scheduleControlsHide() {
    clearTimeout(controlsTimeout);
    const view = document.getElementById('teleprompter-view');
    const settingsOpen = !document.getElementById('settings-panel').classList.contains('hidden');
    const shortcutsOpen = !document.getElementById('shortcuts-overlay').classList.contains('hidden');

    if (state.autoHideControls && state.isPlaying && !settingsOpen && !shortcutsOpen) {
        controlsTimeout = setTimeout(() => {
            view.classList.remove('controls-visible');
        }, 2500);
    }
}

/** Display a brief floating status message in the studio view */
function showStudioToast(message) {
    const toast = document.getElementById('studio-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 1800);
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('teleprompter-view').classList.contains('hidden')) {
            return;
        }

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case ' ':
            case 'Space':
                e.preventDefault();
                playWithCountdown();
                break;
            case 'Escape':
                if (countdownInterval) {
                    cancelCountdown();
                    showStudioToast('Countdown cancelled');
                } else if (!document.getElementById('shortcuts-overlay').classList.contains('hidden')) {
                    document.getElementById('shortcuts-overlay').classList.add('hidden');
                } else if (!document.getElementById('settings-panel').classList.contains('hidden')) {
                    document.getElementById('settings-panel').classList.add('hidden');
                } else {
                    exitTeleprompter();
                }
                break;
            case 'r':
            case 'R':
                resetScroll();
                showStudioToast('Reset to start');
                break;
            case 'm':
            case 'M':
                toggleMirror();
                break;
            case 'v':
            case 'V':
                toggleVoice();
                break;
            case 'f':
            case 'F':
                toggleFullscreen();
                break;
            case '?':
                document.getElementById('settings-panel').classList.add('hidden');
                document.getElementById('shortcuts-overlay').classList.toggle('hidden');
                break;
            case 'ArrowUp':
                e.preventDefault();
                adjustSpeed(10);
                break;
            case 'ArrowDown':
                e.preventDefault();
                adjustSpeed(-10);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                jumpScroll(-200);
                break;
            case 'ArrowRight':
                e.preventDefault();
                jumpScroll(200);
                break;
            case '1':
                jumpToPart('hook');
                break;
            case '2':
                jumpToPart('body');
                break;
            case '3':
                jumpToPart('close');
                break;
        }

        showControlsTemporarily();
    });
}

/** Jump scroll by a fixed pixel amount (for arrow left/right) */
function jumpScroll(delta) {
    if (state.isPlaying) stopScrolling();
    setScrollPosition(state.scrollPosition + delta);
}

// ============================================
// VOICE RECOGNITION
// ============================================

function setupVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.log('Voice recognition not supported');
        document.getElementById('voice-btn').style.display = 'none';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        console.log('🎤 Voice recognition started');
        document.getElementById('voice-indicator').classList.remove('hidden');
        document.getElementById('voice-btn').classList.add('active');
    };

    recognition.onend = () => {
        console.log('🎤 Voice recognition ended');
        document.getElementById('voice-indicator').classList.add('hidden');
        document.getElementById('voice-btn').classList.remove('active');

        if (state.isVoiceActive) {
            try {
                recognition.start();
            } catch (e) {
                console.log('Failed to restart recognition');
            }
        }
    };

    recognition.onresult = () => {
        if (!state.isPlaying) {
            startScrolling();
        }
    };

    recognition.onerror = (event) => {
        console.error('Voice recognition error:', event.error);
        if (event.error === 'not-allowed') {
            alert('Microphone access denied. Please allow microphone access to use voice control.');
            state.isVoiceActive = false;
        }
    };
}

function toggleVoice() {
    if (!recognition) {
        alert('Voice recognition is not supported in this browser');
        return;
    }

    state.isVoiceActive = !state.isVoiceActive;

    if (state.isVoiceActive) {
        startVoice();
    } else {
        stopVoice();
    }
}

function startVoice() {
    try {
        recognition.start();
    } catch (e) {
        console.log('Voice already started or error:', e);
    }
}

function stopVoice() {
    state.isVoiceActive = false;
    try {
        recognition?.stop();
    } catch (e) {
        console.log('Voice stop error:', e);
    }
    document.getElementById('voice-indicator').classList.add('hidden');
    document.getElementById('voice-btn').classList.remove('active');
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

function countWords(script) {
    const text = `${script.part1 || ''} ${script.part2 || ''} ${script.part3 || ''}`;
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

// ============================================
// MANUAL SCROLL (Trackpad/Mouse/Touch)
// ============================================

function setupManualScroll() {
    const container = document.getElementById('teleprompter-container');
    if (!container) return;

    // Handle wheel/trackpad scroll
    container.addEventListener('wheel', (e) => {
        e.preventDefault();

        if (state.isPlaying) {
            stopScrolling();
        }

        setScrollPosition(state.scrollPosition + e.deltaY);
    }, { passive: false });

    // Handle touch scroll for mobile
    let touchStartY = 0;

    container.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (state.isPlaying) {
            stopScrolling();
        }

        const touchY = e.touches[0].clientY;
        const deltaY = touchStartY - touchY;
        touchStartY = touchY;

        setScrollPosition(state.scrollPosition + deltaY);
    }, { passive: true });
}
