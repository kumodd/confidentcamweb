// ============================================
// TELEPROMPTER CONTROLLER
// Advanced teleprompter with voice word-sync, Brave/Firefox Mic VAD fallback,
// timed auto-scroll, mirroring, countdown, progress tracking, fullscreen, wake lock, and shortcuts
// ============================================

let currentUser = null;
let selectedScript = null;
let selectedScriptId = null; // track DB script id for mark-as-recorded

const PREFS_STORAGE_KEY = 'cc_teleprompter_prefs';

const DEFAULT_PREFS = {
    scrollMode: 'auto',     // 'auto' | 'voice' (voice = auto-scroll off, scroll when speaking)
    voiceEngine: 'auto',    // 'auto' | 'speech' | 'vad'
    voiceSensitivity: 5,    // 1 (low) to 10 (high) for Mic Voice Activity detection
    voiceLang: 'en-US',
    highlightSpoken: true,
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

// Voice Recognition & Word Tracking State
let speechRecognitionCtor = null;
let recognition = null;
let isRecognitionRunning = false;
let isBraveBrowser = false;
let speechApiBlocked = false;
let hasReceivedSpeechResult = false;
let consecutiveSpeechErrors = 0;
let activeVoiceMode = null;         // 'speech' | 'vad' | null

let scriptWords = [];               // [{ index, norm, el }]
let voiceWordIndex = 0;             // Next expected word index in scriptWords
let voiceScrollFrame = null;        // RAF id for smooth scroll-to-word easing
let voiceTargetScrollY = 0;
let voiceSegmentAnchors = new Map();
let voiceSegmentSkipCount = new Map();
let voiceLastSeenCount = new Map();
let voiceFinalizedResults = new Set();

// Web Audio Voice-Activity Detection (VAD) Handles (Brave / Firefox / Offline support)
let vadAudioCtx = null;
let vadStream = null;
let vadSource = null;
let vadAnalyser = null;
let vadFreqData = null;
let vadTimeData = null;
let vadFrame = null;
let vadLastTimestamp = null;
let vadLastSpeechAt = 0;
let vadNoiseFloor = 3.0;
let vadVelocity = 0;
let vadCalibSamples = [];
const VAD_SPEECH_HOLD_MS = 480;

// Font family map
const FONT_MAP = {
    sans: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    serif: "'Merriweather', Georgia, 'Times New Roman', serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace"
};

// Spoken number normalization helper (digits -> spoken word)
const NUMBER_WORDS = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
    '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen',
    '14': 'fourteen', '15': 'fifteen', '16': 'sixteen', '17': 'seventeen',
    '18': 'eighteen', '19': 'nineteen', '20': 'twenty', '30': 'thirty',
    '40': 'forty', '50': 'fifty', '60': 'sixty', '70': 'seventy',
    '80': 'eighty', '90': 'ninety', '100': 'hundred'
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Teleprompter...');

    // Restore persisted user preferences before wiring UI
    loadSavedSettings();

    // Detect Brave so 'auto' voice engine doesn't get stuck on blocked Google Speech API
    await detectBraveBrowser();

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
// TELEPROMPTER CONTENT, WORD INDEXING & ENTRY
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

    // Render script content & index spoken words
    voiceWordIndex = 0;
    renderScriptContent(script);

    // Apply visual styles
    applyStyles();

    // Reset scroll & timers
    resetScroll();
    syncScrollModeUI();

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

    // Wrap script words inside .script-part-text for voice synchronization
    indexScriptWords();
}

/** Wrap trackable spoken words inside .script-part-text with spans */
function indexScriptWords() {
    scriptWords = [];
    const textContainers = document.querySelectorAll('#teleprompter-content .script-part-text');

    textContainers.forEach(container => {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && node.nodeValue.trim().length > 0) {
                textNodes.push(node);
            }
        }

        textNodes.forEach(textNode => {
            const parts = textNode.nodeValue.split(/(\s+)/);
            const fragment = document.createDocumentFragment();

            parts.forEach(part => {
                if (!part) return;
                if (/^\s+$/.test(part)) {
                    fragment.appendChild(document.createTextNode(part));
                    return;
                }

                const norm = normalizeWord(part);
                if (!norm) {
                    fragment.appendChild(document.createTextNode(part));
                    return;
                }

                const span = document.createElement('span');
                span.className = 'teleprompter-word';
                span.dataset.wordIdx = scriptWords.length;
                span.textContent = part;

                scriptWords.push({
                    index: scriptWords.length,
                    norm,
                    el: span
                });
                fragment.appendChild(span);
            });

            textNode.parentNode.replaceChild(fragment, textNode);
        });
    });

    // Preserve active word highlight if content was re-rendered mid-session
    voiceWordIndex = Math.min(voiceWordIndex, scriptWords.length);
    if (activeVoiceMode === 'speech' && state.isVoiceActive) {
        updateWordHighlight(voiceWordIndex);
    }
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

    // Play/Pause (handles both Auto Scroll and Voice Sync modes)
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

/** Start or pause presentation depending on Scroll Mode and countdown preference */
function playWithCountdown() {
    if (countdownInterval) {
        cancelCountdown();
        showStudioToast('Countdown cancelled');
        return;
    }

    // Voice Sync mode: auto-scroll stays off; Play/Space toggles mic listening
    if (state.scrollMode === 'voice') {
        if (state.isVoiceActive) {
            stopVoice();
        } else {
            // Prepare AudioContext synchronously on user gesture BEFORE any countdown delay
            prepareAudioContext();
            if (state.scrollPosition >= getMaxScroll() - 2) {
                resetScroll();
            }
            if (state.countdownSeconds > 0 && state.scrollPosition === 0) {
                runCountdown(state.countdownSeconds, startVoice);
            } else {
                startVoice();
            }
        }
        return;
    }

    // If user activated quick Voice Sync while in Auto mode, Play pauses Voice first
    if (state.isVoiceActive) {
        stopVoice();
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
        runCountdown(state.countdownSeconds, startScrolling);
    } else {
        startScrolling();
    }
}

/** Run visual countdown then invoke onComplete callback */
function runCountdown(seconds, onComplete) {
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
            onComplete();
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
    // Ensure voice mode & auto-scroll never conflict
    if (state.isVoiceActive) {
        stopVoice();
    }
    cancelCountdown();

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

    if (!state.isVoiceActive) {
        document.getElementById('play-pause-btn').textContent = '▶️';
    }
    document.getElementById('teleprompter-content').classList.remove('scrolling');

    // Pause elapsed timer (unless voice sync is still actively listening)
    if (!state.isVoiceActive) {
        stopElapsedTimer();
        clearTimeout(controlsTimeout);
        document.getElementById('teleprompter-view').classList.add('controls-visible');
    }

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

/** Called when auto-scroll or spoken script reaches the end */
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
    stopVoiceScrollAnimation();
    resetElapsedTime();
    if (state.isVoiceActive) {
        startElapsedTimer();
    }

    vadVelocity = 0;
    vadLastSpeechAt = 0;
    vadLastTimestamp = null;

    voiceWordIndex = 0;
    freezeActiveSpeechPrefix();
    updateWordHighlight(-1);
    setScrollPosition(0);

    const preview = document.getElementById('voice-heard-preview');
    if (preview) preview.textContent = '';
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

/** Reflect active scroll mode (Auto Scroll vs Voice Sync) and voice engine across HUD & Settings */
function syncScrollModeUI() {
    const isVoiceMode = state.scrollMode === 'voice';
    const resolvedEngine = resolveVoiceEngine();
    const isWordSyncDriving = (state.isVoiceActive && activeVoiceMode === 'speech') ||
        (isVoiceMode && !state.isVoiceActive && resolvedEngine === 'speech');

    const speedGroup = document.getElementById('speed-control-group');
    const modeBadge = document.getElementById('scroll-mode-badge');
    const modeHint = document.getElementById('scroll-mode-hint');
    const playBtn = document.getElementById('play-pause-btn');

    if (speedGroup) {
        // Only dim speed controls when word-matching STT drives exact position; VAD uses scrollSpeed
        speedGroup.classList.toggle('disabled-mode', isWordSyncDriving);
    }
    if (modeBadge) {
        modeBadge.textContent = isVoiceMode ? 'Voice' : 'Auto';
    }
    if (modeHint) {
        modeHint.textContent = isVoiceMode
            ? 'Auto-scroll off — scrolls only when you speak'
            : 'Scrolls continuously at set speed';
    }
    if (playBtn) {
        if (state.isVoiceActive || state.isPlaying) {
            playBtn.textContent = '⏸️';
            playBtn.title = state.isVoiceActive ? 'Pause Voice Sync (Space)' : 'Pause (Space)';
        } else {
            playBtn.textContent = '▶️';
            playBtn.title = isVoiceMode ? 'Start Voice Sync (Space)' : 'Play (Space)';
        }
    }

    document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === state.scrollMode);
    });
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

    document.getElementById('voice-engine').value = state.voiceEngine;
    document.getElementById('voice-sensitivity').value = state.voiceSensitivity;
    document.getElementById('voice-sensitivity-value').textContent = state.voiceSensitivity;
    document.getElementById('voice-lang').value = state.voiceLang;

    const activeSelectors = [
        ['.font-btn', 'font', state.fontFamily],
        ['.align-btn', 'align', state.textAlign],
        ['.color-btn', 'color', state.textColor],
        ['.bg-btn', 'bg', state.bgColor],
        ['.countdown-opt-btn', 'seconds', String(state.countdownSeconds)]
    ];
    activeSelectors.forEach(([selector, dataKey, activeVal]) => {
        document.querySelectorAll(selector).forEach(b => {
            b.classList.toggle('active', b.dataset[dataKey] === activeVal);
        });
    });

    document.getElementById('highlight-spoken').checked = state.highlightSpoken;
    document.getElementById('show-parts').checked = state.showPartLabels;
    document.getElementById('show-divider').checked = state.showDivider;
    document.getElementById('auto-hide-controls').checked = state.autoHideControls;

    document.getElementById('teleprompter-view').classList.toggle('controls-always-visible', !state.autoHideControls);
    syncScrollModeUI();
}

/** Shared helper for segmented/swatch button groups in Settings */
function bindOptionButtons(selector, dataKey, stateKey, parseVal, onAfter) {
    document.querySelectorAll(selector).forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state[stateKey] = parseVal(btn.dataset[dataKey]);
            if (onAfter) onAfter();
            saveSettings();
        });
    });
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

/** Switch cleanly between 'auto' (timed scroll) and 'voice' (voice-driven) modes */
function setScrollMode(mode) {
    if (mode === 'voice' && !hasAnyVoiceSupport()) {
        showStudioToast('Voice input not supported in this browser');
        return;
    }

    state.scrollMode = mode;
    saveSettings();

    if (mode === 'voice') {
        prepareAudioContext();
        stopScrolling();
        const isTeleprompterOpen = !document.getElementById('teleprompter-view').classList.contains('hidden');
        if (isTeleprompterOpen && !state.isVoiceActive) {
            startVoice();
        }
        showStudioToast('Voice Sync: auto-scroll off');
    } else {
        stopVoice();
        clearWordHighlights();
        showStudioToast('Auto Scroll mode');
    }

    syncScrollModeUI();
}

function setupSettings() {
    // Sync initial UI state from loaded preferences
    syncSettingsUI();

    // Scroll Mode selector
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => setScrollMode(btn.dataset.mode));
    });

    // Voice Engine selector
    document.getElementById('voice-engine').addEventListener('change', (e) => {
        state.voiceEngine = e.target.value;
        saveSettings();
        if (state.voiceEngine !== 'vad') {
            // Allow user to explicitly retry speech API if desired
            speechApiBlocked = false;
        }
        if (state.isVoiceActive) {
            prepareAudioContext();
            stopVoice();
            startVoice();
        }
        syncScrollModeUI();
    });

    // Mic Sensitivity (VAD)
    document.getElementById('voice-sensitivity').addEventListener('input', (e) => {
        state.voiceSensitivity = parseInt(e.target.value, 10);
        document.getElementById('voice-sensitivity-value').textContent = state.voiceSensitivity;
        saveSettings();
    });

    // Voice Language
    document.getElementById('voice-lang').addEventListener('change', (e) => {
        state.voiceLang = e.target.value;
        saveSettings();
        if (recognition) {
            recognition.lang = state.voiceLang;
            if (state.isVoiceActive && activeVoiceMode === 'speech') {
                try {
                    recognition.stop(); // triggers onend -> restarts with new language
                } catch (err) {
                    console.log('Restarting recognition for language change:', err);
                }
            }
        }
        showStudioToast(`Voice language: ${state.voiceLang}`);
    });

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

    // Option Button Groups
    bindOptionButtons('.font-btn', 'font', 'fontFamily', v => v, applyStyles);
    bindOptionButtons('.align-btn', 'align', 'textAlign', v => v, applyStyles);
    bindOptionButtons('.color-btn', 'color', 'textColor', v => v, applyStyles);
    bindOptionButtons('.bg-btn', 'bg', 'bgColor', v => v, applyStyles);
    bindOptionButtons('.countdown-opt-btn', 'seconds', 'countdownSeconds', v => parseInt(v, 10));

    // Highlight Spoken Words
    document.getElementById('highlight-spoken').addEventListener('change', (e) => {
        state.highlightSpoken = e.target.checked;
        saveSettings();
        if (state.highlightSpoken && state.isVoiceActive && activeVoiceMode === 'speech') {
            updateWordHighlight(voiceWordIndex);
        } else {
            clearWordHighlights();
        }
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
        if (state.autoHideControls && (state.isPlaying || state.isVoiceActive)) {
            scheduleControlsHide();
        }
        saveSettings();
    });

    // Reset Settings to Defaults
    document.getElementById('reset-settings-btn').addEventListener('click', () => {
        stopVoice();
        Object.assign(state, DEFAULT_PREFS);
        localStorage.removeItem(PREFS_STORAGE_KEY);
        speechApiBlocked = false;
        if (recognition) recognition.lang = state.voiceLang;
        clearWordHighlights();
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
    stopVoiceScrollAnimation();

    const container = document.getElementById('teleprompter-container');
    const viewportHeight = container.clientHeight || window.innerHeight;
    const targetOffset = targetEl.offsetTop - viewportHeight * (state.eyeLinePos / 100);

    setScrollPosition(targetOffset);
    syncVoiceCursorToScroll();
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

    // Tap container (without dragging) toggles controls when playing or listening
    let tapStartY = 0;
    container.addEventListener('pointerdown', (e) => {
        tapStartY = e.clientY;
    });
    container.addEventListener('click', (e) => {
        if (Math.abs(e.clientY - tapStartY) > 6) return;
        const isPresenting = state.isPlaying || state.isVoiceActive;
        if (isPresenting && state.autoHideControls) {
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
    const isPresenting = state.isPlaying || state.isVoiceActive;

    if (state.autoHideControls && isPresenting && !settingsOpen && !shortcutsOpen) {
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
    }, 2200);
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('teleprompter-view').classList.contains('hidden')) {
            return;
        }

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            return;
        }

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
    stopVoiceScrollAnimation();
    setScrollPosition(state.scrollPosition + delta);
    syncVoiceCursorToScroll();
}

// ============================================
// VOICE ENGINE: WORD-SYNC (Web Speech API) + MIC VAD FALLBACK (Brave/Firefox)
// Auto-scroll timer stays OFF; scrolls when words/voice are spoken
// ============================================

async function detectBraveBrowser() {
    try {
        if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
            isBraveBrowser = await navigator.brave.isBrave();
        }
    } catch (e) {
        isBraveBrowser = false;
    }
}

function hasVadSupport() {
    return !!(
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function' &&
        (window.AudioContext || window.webkitAudioContext)
    );
}

function hasAnyVoiceSupport() {
    return !!(speechRecognitionCtor || hasVadSupport());
}

/** Choose 'speech' (word-by-word STT) or 'vad' (local mic voice activity detection) */
function resolveVoiceEngine() {
    if (state.voiceEngine === 'vad') {
        return hasVadSupport() ? 'vad' : (speechRecognitionCtor ? 'speech' : null);
    }
    if (state.voiceEngine === 'speech') {
        if (speechRecognitionCtor && !speechApiBlocked) return 'speech';
        return hasVadSupport() ? 'vad' : null;
    }
    // 'auto': Brave disables Google Web Speech servers ('network' error), so use local Mic VAD seamlessly
    if (!speechRecognitionCtor || speechApiBlocked || isBraveBrowser) {
        return hasVadSupport() ? 'vad' : null;
    }
    return 'speech';
}

/** Create/resume AudioContext synchronously inside a user click/keypress gesture */
function prepareAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
        if (!vadAudioCtx) {
            vadAudioCtx = new AudioCtx();
        }
        if (vadAudioCtx.state === 'suspended') {
            vadAudioCtx.resume().catch(() => {});
        }
    } catch (e) {
        console.log('AudioContext init error:', e);
    }
}

/** Normalize a token for resilient speech-to-script matching */
function normalizeWord(raw) {
    if (!raw) return '';
    let cleaned = raw
        .toLowerCase()
        .replace(/[\u2018\u2019']/g, '')        // strip apostrophes so "don't" -> "dont"
        .replace(/[^\p{L}\p{N}]/gu, '');        // keep letters & numbers across scripts
    if (NUMBER_WORDS[cleaned]) {
        cleaned = NUMBER_WORDS[cleaned];
    }
    return cleaned;
}

/** Tokenize a full ASR transcript phrase into normalized words */
function normalizeSpokenTranscript(transcript) {
    if (!transcript) return [];
    return transcript
        .trim()
        .split(/\s+/)
        .map(normalizeWord)
        .filter(w => w.length > 0);
}

/** True when two words are identical or differ by at most 1 char (len >= 4) */
function wordsMatch(spoken, expected) {
    if (spoken === expected) return true;
    const maxLen = Math.max(spoken.length, expected.length);
    if (maxLen < 4 || Math.abs(spoken.length - expected.length) > 1) {
        return false;
    }

    const a = spoken.length <= expected.length ? spoken : expected;
    const b = spoken.length <= expected.length ? expected : spoken;

    if (a.length === b.length) {
        let diffs = 0;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i] && ++diffs > 1) return false;
        }
        return true;
    }

    let i = 0;
    let j = 0;
    let skipped = false;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            i++;
            j++;
        } else if (!skipped) {
            skipped = true;
            j++;
        } else {
            return false;
        }
    }
    return true;
}

/**
 * Forward-biased matcher:
 * 1) Small local window (8 words) matches earliest single word.
 * 2) Extended window (up to 32 words) triggers only on 2 consecutive aligned words
 *    so filler words never cause false jumps while skipped sentences still recover.
 */
function matchTokensForward(tokens, startCursor) {
    let cursor = startCursor;
    let lastMatchedIdx = -1;
    const total = scriptWords.length;

    for (let t = 0; t < tokens.length && cursor < total; t++) {
        const tok = tokens[t];
        let matchedAt = -1;

        const nearEnd = Math.min(total, cursor + 8);
        for (let j = cursor; j < nearEnd; j++) {
            if (wordsMatch(tok, scriptWords[j].norm)) {
                matchedAt = j;
                break;
            }
        }

        if (matchedAt === -1 && t + 1 < tokens.length) {
            const nextTok = tokens[t + 1];
            const farEnd = Math.min(total - 1, cursor + 32);
            for (let j = nearEnd; j < farEnd; j++) {
                if (wordsMatch(tok, scriptWords[j].norm) &&
                    (wordsMatch(nextTok, scriptWords[j + 1].norm) ||
                        (j + 2 < total && wordsMatch(nextTok, scriptWords[j + 2].norm)))) {
                    matchedAt = j;
                    break;
                }
            }
        }

        if (matchedAt !== -1) {
            cursor = matchedAt + 1;
            lastMatchedIdx = matchedAt;
        }
    }

    return { nextCursor: cursor, lastMatchedIdx };
}

/** Compute desired scrollY so the given word aligns right on the eye-line */
function getWordScrollTargetY(wordIndex) {
    const word = scriptWords[wordIndex];
    const content = document.getElementById('teleprompter-content');
    const container = document.getElementById('teleprompter-container');
    if (!word || !content || !container) return state.scrollPosition;

    const containerRect = container.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const wordRect = word.el.getBoundingClientRect();

    const offsetInContent = (wordRect.top - contentRect.top) + wordRect.height * 0.5;
    const eyeLineOffset = (containerRect.height || window.innerHeight) * (state.eyeLinePos / 100);
    const maxScroll = getMaxScroll();

    return Math.max(0, Math.min(offsetInContent - eyeLineOffset, maxScroll));
}

/** Smoothly ease scrollPosition toward voiceTargetScrollY without jarring jumps */
function animateVoiceScrollTo(targetY) {
    voiceTargetScrollY = targetY;
    if (voiceScrollFrame) return;

    const step = () => {
        const diff = voiceTargetScrollY - state.scrollPosition;
        if (Math.abs(diff) <= 0.6) {
            setScrollPosition(voiceTargetScrollY);
            voiceScrollFrame = null;
            return;
        }
        setScrollPosition(state.scrollPosition + diff * 0.16);
        voiceScrollFrame = requestAnimationFrame(step);
    };

    voiceScrollFrame = requestAnimationFrame(step);
}

function stopVoiceScrollAnimation() {
    if (voiceScrollFrame) {
        cancelAnimationFrame(voiceScrollFrame);
        voiceScrollFrame = null;
    }
}

/** Highlight completed & active words when highlightSpoken is enabled */
function updateWordHighlight(nextWordIdx) {
    if (!state.highlightSpoken) {
        clearWordHighlights();
        return;
    }

    for (let i = 0; i < scriptWords.length; i++) {
        const el = scriptWords[i].el;
        if (nextWordIdx < 0) {
            el.classList.remove('spoken', 'current');
        } else if (i < nextWordIdx - 1) {
            el.classList.add('spoken');
            el.classList.remove('current');
        } else if (i === nextWordIdx - 1) {
            el.classList.remove('spoken');
            el.classList.add('current');
        } else {
            el.classList.remove('spoken', 'current');
        }
    }
}

function clearWordHighlights() {
    scriptWords.forEach(w => w.el.classList.remove('spoken', 'current'));
}

/** Align voice cursor to the word currently closest to the eye-line (after manual scroll/jump) */
function syncVoiceCursorToScroll() {
    if (scriptWords.length === 0) return;

    const container = document.getElementById('teleprompter-container');
    const content = document.getElementById('teleprompter-content');
    if (!container || !content) return;

    const containerRect = container.getBoundingClientRect();
    const eyeLineY = containerRect.top + (containerRect.height || window.innerHeight) * (state.eyeLinePos / 100);

    let closestIdx = 0;
    let smallestDist = Infinity;

    for (let i = 0; i < scriptWords.length; i++) {
        const rect = scriptWords[i].el.getBoundingClientRect();
        const wordCenter = rect.top + rect.height * 0.5;
        const dist = Math.abs(wordCenter - eyeLineY);
        if (dist < smallestDist) {
            smallestDist = dist;
            closestIdx = i;
        }
    }

    voiceWordIndex = closestIdx;
    freezeActiveSpeechPrefix();

    if (state.isVoiceActive && activeVoiceMode === 'speech') {
        updateWordHighlight(voiceWordIndex);
    }
}

/** Prevent pre-seek interim tokens from pulling voiceWordIndex backward after a manual scroll/jump */
function freezeActiveSpeechPrefix() {
    voiceSegmentAnchors.clear();
    voiceLastSeenCount.forEach((count, segIdx) => {
        if (!voiceFinalizedResults.has(segIdx)) {
            voiceSegmentSkipCount.set(segIdx, count);
            voiceSegmentAnchors.set(segIdx, voiceWordIndex);
        }
    });
}

function processSpeechResults(event) {
    if (scriptWords.length === 0) return;

    hasReceivedSpeechResult = true;
    consecutiveSpeechErrors = 0;

    let latestTranscriptTail = '';

    for (let r = event.resultIndex; r < event.results.length; r++) {
        if (voiceFinalizedResults.has(r)) continue;

        const result = event.results[r];
        const transcript = result[0]?.transcript || '';
        latestTranscriptTail = transcript.trim();

        const allTokens = normalizeSpokenTranscript(transcript);
        voiceLastSeenCount.set(r, allTokens.length);

        const skipCount = voiceSegmentSkipCount.get(r) || 0;
        const tokens = skipCount > 0 ? allTokens.slice(skipCount) : allTokens;

        if (!voiceSegmentAnchors.has(r)) {
            voiceSegmentAnchors.set(r, voiceWordIndex);
        }

        const anchor = voiceSegmentAnchors.get(r);
        const { nextCursor, lastMatchedIdx } = matchTokensForward(tokens, anchor);

        if (lastMatchedIdx !== -1 && nextCursor > voiceWordIndex) {
            voiceWordIndex = nextCursor;
            updateWordHighlight(voiceWordIndex);

            const targetY = getWordScrollTargetY(lastMatchedIdx);
            animateVoiceScrollTo(targetY);

            if (voiceWordIndex >= scriptWords.length) {
                onScrollComplete();
            }
        }

        if (result.isFinal) {
            voiceFinalizedResults.add(r);
        }
    }

    const previewEl = document.getElementById('voice-heard-preview');
    if (previewEl && latestTranscriptTail) {
        const previewWords = latestTranscriptTail.split(/\s+/).slice(-4).join(' ');
        previewEl.textContent = `"${previewWords}"`;
    }
}

function setupVoiceRecognition() {
    speechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;

    if (!hasAnyVoiceSupport()) {
        console.log('No voice input API available');
        document.getElementById('voice-btn').style.display = 'none';
        const voiceModeBtn = document.querySelector('.mode-btn[data-mode="voice"]');
        if (voiceModeBtn) {
            voiceModeBtn.disabled = true;
            voiceModeBtn.title = 'Microphone API unavailable in this browser';
        }
        return;
    }

    if (!speechRecognitionCtor) {
        return;
    }

    recognition = new speechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = state.voiceLang || 'en-US';

    recognition.onstart = () => {
        isRecognitionRunning = true;
        console.log('🎤 Web Speech word-sync started');
        // Fresh SpeechRecognition session clears event.results indices while keeping script voiceWordIndex
        voiceSegmentAnchors.clear();
        voiceSegmentSkipCount.clear();
        voiceLastSeenCount.clear();
        voiceFinalizedResults.clear();

        if (state.isVoiceActive && activeVoiceMode === 'speech') {
            showVoiceIndicator('Word Sync (Auto-scroll off) • Speak script...', false);
        }
    };

    recognition.onend = () => {
        isRecognitionRunning = false;
        console.log('🎤 Web Speech recognition ended');

        // Keep listening continuously across natural pauses only if Web Speech is healthy & active
        if (state.isVoiceActive && activeVoiceMode === 'speech' && !speechApiBlocked) {
            try {
                recognition.start();
                return;
            } catch (e) {
                console.log('Failed to restart recognition:', e);
            }
        }

        if (!state.isVoiceActive) {
            hideVoiceIndicator();
        }
    };

    recognition.onresult = (event) => {
        processSpeechResults(event);
    };

    recognition.onerror = (event) => {
        // 'no-speech' and 'aborted' happen routinely during pauses or intentional stops
        if (event.error === 'no-speech' || event.error === 'aborted') {
            return;
        }
        console.error('Voice recognition error:', event.error);

        if (event.error === 'not-allowed') {
            alert('Microphone access denied. Please allow microphone access to scroll with voice.');
            stopVoice();
            return;
        }

        if (event.error === 'audio-capture') {
            showStudioToast('No microphone detected');
            stopVoice();
            return;
        }

        // Brave & privacy-hardened browsers fire 'network' or 'service-not-allowed' because Google STT is blocked
        consecutiveSpeechErrors++;
        const shouldFallbackNow =
            event.error === 'service-not-allowed' ||
            event.error === 'language-not-supported' ||
            (event.error === 'network' && (!hasReceivedSpeechResult || consecutiveSpeechErrors >= 2 || isBraveBrowser));

        if (shouldFallbackNow) {
            speechApiBlocked = true;
            stopSpeechRecognitionEngine();
            fallbackToVad(event.error);
        }
    };
}

function showVoiceIndicator(statusText, showMeter) {
    const indicator = document.getElementById('voice-indicator');
    const statusEl = document.getElementById('voice-status-text');
    const meterEl = document.getElementById('voice-meter');
    const previewEl = document.getElementById('voice-heard-preview');

    if (statusEl) statusEl.textContent = statusText;
    if (meterEl) meterEl.classList.toggle('hidden', !showMeter);
    if (previewEl && showMeter) previewEl.textContent = '';

    indicator?.classList.remove('hidden');
    document.getElementById('voice-btn')?.classList.add('active');
    syncScrollModeUI();
}

function hideVoiceIndicator() {
    const indicator = document.getElementById('voice-indicator');
    indicator?.classList.add('hidden', 'speaking');
    document.getElementById('voice-btn')?.classList.remove('active');
    syncScrollModeUI();
}

function startSpeechRecognitionEngine() {
    if (!recognition) return;

    activeVoiceMode = 'speech';
    hasReceivedSpeechResult = false;
    consecutiveSpeechErrors = 0;

    syncVoiceCursorToScroll();
    updateWordHighlight(voiceWordIndex);
    showVoiceIndicator('Word Sync (Auto-scroll off) • Listening...', false);

    if (!isRecognitionRunning) {
        try {
            recognition.lang = state.voiceLang || 'en-US';
            recognition.start();
        } catch (e) {
            console.log('Speech recognition start error:', e);
        }
    }
}

function stopSpeechRecognitionEngine() {
    isRecognitionRunning = false;
    try {
        recognition?.abort?.();
    } catch (e) {
        try {
            recognition?.stop?.();
        } catch (e2) {
            console.log('Voice stop error:', e2);
        }
    }
}

/** Seamlessly switch to local Web Audio Mic VAD when browser blocks Google Speech-to-Text */
function fallbackToVad(reason) {
    if (!state.isVoiceActive) return;

    if (!hasVadSupport()) {
        showStudioToast(`Speech recognition failed (${reason})`);
        stopVoice();
        return;
    }

    clearWordHighlights();
    showStudioToast('Browser blocked Speech-to-Text — switched to Mic Voice Scroll');
    startVadVoice(true);
}

/** Measure speech-band + time-domain mic energy cleanly (250 Hz – 3400 Hz) */
function measureSpeechBandEnergy() {
    if (!vadAnalyser || !vadAudioCtx || !vadFreqData || !vadTimeData) return 0;

    vadAnalyser.getByteFrequencyData(vadFreqData);
    vadAnalyser.getByteTimeDomainData(vadTimeData);

    const sampleRate = vadAudioCtx.sampleRate || 48000;
    const nyquist = sampleRate / 2;
    const binCount = vadAnalyser.frequencyBinCount;
    const minBin = Math.max(1, Math.floor((250 / nyquist) * binCount));
    const maxBin = Math.min(binCount - 1, Math.ceil((3400 / nyquist) * binCount));

    let bandSum = 0;
    for (let b = minBin; b <= maxBin; b++) {
        bandSum += vadFreqData[b];
    }
    const bandAvg = bandSum / Math.max(1, maxBin - minBin + 1);

    // Time-domain RMS scaled to 0..255 range for quiet-headset reliability
    let sqSum = 0;
    for (let i = 0; i < vadTimeData.length; i++) {
        const centered = (vadTimeData[i] - 128) / 128;
        sqSum += centered * centered;
    }
    const rms = Math.sqrt(sqSum / vadTimeData.length) * 255;

    return Math.max(bandAvg, rms * 1.15);
}

/** Animate 5-bar mic activity meter & active speaking glow */
function updateVadMeter(level, threshold, isSpeaking) {
    const indicator = document.getElementById('voice-indicator');
    const meter = document.getElementById('voice-meter');
    if (!indicator || !meter) return;

    indicator.classList.toggle('speaking', isSpeaking);

    const normalized = Math.min(1, level / Math.max(threshold * 2.4, 24));
    const weights = [0.6, 0.9, 1.0, 0.85, 0.55];
    const bars = meter.querySelectorAll('.voice-bar');
    bars.forEach((bar, idx) => {
        const heightPx = Math.round(4 + normalized * weights[idx] * 12);
        bar.style.height = `${heightPx}px`;
    });
}

function vadStep(timestamp) {
    if (!state.isVoiceActive || activeVoiceMode !== 'vad') return;

    if (!vadLastTimestamp) {
        vadLastTimestamp = timestamp;
    }
    const elapsed = Math.min(100, timestamp - vadLastTimestamp);
    vadLastTimestamp = timestamp;

    const level = measureSpeechBandEnergy();

    // Calibrate noise floor over initial frames using 25th percentile so early speech won't lock high floor
    if (vadCalibSamples.length < 10) {
        vadCalibSamples.push(level);
        if (vadCalibSamples.length === 10) {
            const sorted = [...vadCalibSamples].sort((a, b) => a - b);
            vadNoiseFloor = Math.min(12, Math.max(1.5, sorted[2]));
        }
    }

    const sensitivityOffset = (11 - state.voiceSensitivity) * 1.55;
    const threshold = Math.max(3.5, vadNoiseFloor * 1.45 + sensitivityOffset);

    if (level > threshold) {
        vadLastSpeechAt = timestamp;
    } else if (vadCalibSamples.length >= 10) {
        // Adapt ambient noise floor smoothly during silence
        const rate = level < vadNoiseFloor ? 0.05 : 0.008;
        vadNoiseFloor = Math.min(16, Math.max(1.5, vadNoiseFloor * (1 - rate) + level * rate));
    }

    const isSpeaking = vadLastSpeechAt > 0 && (timestamp - vadLastSpeechAt) <= VAD_SPEECH_HOLD_MS;
    const statusEl = document.getElementById('voice-status-text');
    if (statusEl) {
        statusEl.textContent = isSpeaking
            ? 'Mic Voice Scroll • Speaking...'
            : 'Mic Voice Scroll • Pause (speak to scroll)';
    }

    updateVadMeter(level, threshold, isSpeaking);

    // Smooth ease velocity so scrolling starts & stops naturally without stuttering
    const targetVel = isSpeaking ? 1 : 0;
    vadVelocity += (targetVel - vadVelocity) * (isSpeaking ? 0.24 : 0.18);

    if (vadVelocity > 0.02) {
        const scrollAmount = (state.scrollSpeed / 1000) * elapsed * vadVelocity;
        const maxScroll = getMaxScroll();
        setScrollPosition(state.scrollPosition + scrollAmount);

        if (state.scrollPosition >= maxScroll) {
            vadVelocity = 0;
            onScrollComplete();
            stopVoice();
            return;
        }
    }

    vadFrame = requestAnimationFrame(vadStep);
}

/** Local microphone Voice Activity Detection scroll (works natively in Brave, Firefox, Chrome, Safari) */
async function startVadVoice(isFallback = false) {
    if (!hasVadSupport()) {
        showStudioToast('Microphone API unavailable');
        stopVoice();
        return;
    }

    activeVoiceMode = 'vad';
    vadLastTimestamp = null;
    vadLastSpeechAt = 0;
    vadNoiseFloor = 3.0;
    vadVelocity = 0;
    vadCalibSamples = [];
    clearWordHighlights();

    showVoiceIndicator(
        isFallback ? 'Mic Voice Scroll (STT blocked) • Allow mic...' : 'Mic Voice Scroll • Requesting mic...',
        true
    );

    try {
        prepareAudioContext();
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // If user cancelled or exited while permission prompt was open, clean up immediately
        if (!state.isVoiceActive || activeVoiceMode !== 'vad') {
            stream.getTracks().forEach(t => t.stop());
            return;
        }

        vadStream = stream;
        if (vadAudioCtx.state === 'suspended') {
            await vadAudioCtx.resume();
        }

        vadSource = vadAudioCtx.createMediaStreamSource(vadStream);
        vadAnalyser = vadAudioCtx.createAnalyser();
        vadAnalyser.fftSize = 1024;
        vadAnalyser.smoothingTimeConstant = 0.45;
        vadSource.connect(vadAnalyser);

        vadFreqData = new Uint8Array(vadAnalyser.frequencyBinCount);
        vadTimeData = new Uint8Array(vadAnalyser.fftSize);

        showVoiceIndicator('Mic Voice Scroll • Speak to scroll', true);
        vadFrame = requestAnimationFrame(vadStep);
    } catch (err) {
        console.error('Microphone VAD error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            alert('Microphone access denied. Please allow microphone permission to scroll with voice.');
        } else if (err.name === 'NotFoundError') {
            showStudioToast('No microphone found');
        } else {
            showStudioToast('Could not start microphone');
        }
        stopVoice();
    }
}

function stopVadVoice() {
    if (vadFrame) {
        cancelAnimationFrame(vadFrame);
        vadFrame = null;
    }
    vadVelocity = 0;
    vadLastSpeechAt = 0;
    vadLastTimestamp = null;

    if (vadSource) {
        try { vadSource.disconnect(); } catch (e) {}
        vadSource = null;
    }
    vadAnalyser = null;

    if (vadStream) {
        vadStream.getTracks().forEach(track => track.stop());
        vadStream = null;
    }
}

function toggleVoice() {
    if (!hasAnyVoiceSupport()) {
        alert('Microphone voice detection is not supported in this browser.');
        return;
    }

    prepareAudioContext();

    if (state.isVoiceActive) {
        stopVoice();
        showStudioToast('Voice scroll paused');
    } else {
        startVoice();
        const engine = resolveVoiceEngine();
        showStudioToast(
            engine === 'vad'
                ? 'Mic Voice Scroll active (auto-scroll off)'
                : 'Voice Word-Sync active (auto-scroll off)'
        );
    }
}

function startVoice() {
    const engine = resolveVoiceEngine();
    if (!engine) {
        showStudioToast('Microphone voice input unavailable');
        return;
    }

    // Auto-scroll MUST stay off when voice detection controls scrolling
    if (state.isPlaying) {
        stopScrolling();
    }
    cancelCountdown();

    state.isVoiceActive = true;
    startElapsedTimer();
    scheduleControlsHide();

    if (engine === 'vad') {
        startVadVoice(speechApiBlocked || (isBraveBrowser && state.voiceEngine === 'auto'));
    } else {
        startSpeechRecognitionEngine();
    }

    syncScrollModeUI();
}

function stopVoice() {
    state.isVoiceActive = false;
    activeVoiceMode = null;

    stopVoiceScrollAnimation();
    stopSpeechRecognitionEngine();
    stopVadVoice();

    if (!state.isPlaying) {
        stopElapsedTimer();
        clearTimeout(controlsTimeout);
        document.getElementById('teleprompter-view')?.classList.add('controls-visible');
    }

    hideVoiceIndicator();
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
        stopVoiceScrollAnimation();

        setScrollPosition(state.scrollPosition + e.deltaY);
        syncVoiceCursorToScroll();
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
        stopVoiceScrollAnimation();

        const touchY = e.touches[0].clientY;
        const deltaY = touchStartY - touchY;
        touchStartY = touchY;

        setScrollPosition(state.scrollPosition + deltaY);
        syncVoiceCursorToScroll();
    }, { passive: true });
}
