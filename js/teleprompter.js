// ============================================
// TELEPROMPTER CONTROLLER
// Advanced teleprompter with voice control, mirroring, and customization
// ============================================

let currentUser = null;
let selectedScript = null;

// Teleprompter State
const state = {
    isPlaying: false,
    isMirrored: false,
    isVoiceActive: false,
    scrollPosition: 0,
    scrollSpeed: 50, // pixels per second
    fontSize: 48,
    lineHeight: 1.8,
    textColor: '#FFFFFF',
    bgColor: '#000000',
    showPartLabels: true,
    showDivider: true,
    animationFrame: null,
    lastTimestamp: null
};

// Voice Recognition
let recognition = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Teleprompter...');

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

    // Setup UI
    setupUserInfo();
    setupLogout();
    setupCustomText();

    // Load scripts
    await loadScripts();

    // Check if script ID in URL
    checkUrlParams();

    // Setup teleprompter controls
    setupTeleprompterControls();
    setupSettings();
    setupKeyboardShortcuts();
    setupVoiceRecognition();
    setupManualScroll();
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
    document.getElementById('start-custom-btn').addEventListener('click', () => {
        const customText = document.getElementById('custom-text').value.trim();
        if (customText) {
            startTeleprompter({
                title: 'Custom Script',
                fullText: customText
            });
        }
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
    const scripts = scriptsService.cache;

    if (scripts.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    container.innerHTML = scripts.map(script => {
        const preview = script.part1 || script.part2 || 'No content';
        return `
            <div class="script-select-card" data-id="${script.id}">
                <div class="script-select-title">${escapeHtml(script.title)}</div>
                <div class="script-select-preview">${escapeHtml(preview)}</div>
                <div class="script-select-meta">
                    ${countWords(script)} words • ${formatDate(script.created_at)}
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.script-select-card').forEach(card => {
        card.addEventListener('click', async () => {
            const scriptId = card.dataset.id;
            const script = scriptsService.cache.find(s => s.id === scriptId);
            if (script) {
                startTeleprompter({
                    title: script.title,
                    part1: script.part1,
                    part2: script.part2,
                    part3: script.part3,
                    fullText: `${script.part1 || ''}\n\n${script.part2 || ''}\n\n${script.part3 || ''}`.trim()
                });
            }
        });
    });
}

function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const scriptId = params.get('id');

    if (scriptId) {
        // Wait for scripts to load, then start
        setTimeout(() => {
            const script = scriptsService.cache.find(s => s.id === scriptId);
            if (script) {
                startTeleprompter({
                    title: script.title,
                    part1: script.part1,
                    part2: script.part2,
                    part3: script.part3,
                    fullText: `${script.part1 || ''}\n\n${script.part2 || ''}\n\n${script.part3 || ''}`.trim()
                });
            }
        }, 500);
    }
}

// ============================================
// TELEPROMPTER CONTROLS
// ============================================

function startTeleprompter(script) {
    selectedScript = script;

    // Update title
    document.getElementById('current-script-title').textContent = script.title;

    // Build content HTML with markdown rendering
    let contentHTML = '';

    // Configure marked for teleprompter-friendly output
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,  // Convert \n to <br>
            gfm: true      // GitHub Flavored Markdown
        });
    }

    if (script.part1 || script.part2 || script.part3) {
        if (state.showPartLabels && script.part1) {
            contentHTML += `<span class="script-part-label">Hook</span>`;
        }
        contentHTML += `<div class="script-part-text">${renderMarkdown(script.part1 || '')}</div>`;

        if (state.showPartLabels && script.part2) {
            contentHTML += `<span class="script-part-label">Body</span>`;
        }
        contentHTML += `<div class="script-part-text">${renderMarkdown(script.part2 || '')}</div>`;

        if (state.showPartLabels && script.part3) {
            contentHTML += `<span class="script-part-label">Close</span>`;
        }
        contentHTML += `<div class="script-part-text">${renderMarkdown(script.part3 || '')}</div>`;
    } else {
        contentHTML = `<div class="script-part-text">${renderMarkdown(script.fullText)}</div>`;
    }

    document.getElementById('teleprompter-content').innerHTML = contentHTML;

    // Apply styles
    applyStyles();

    // Reset scroll position
    resetScroll();

    // Show teleprompter view
    document.getElementById('selection-view').classList.add('hidden');
    document.getElementById('teleprompter-view').classList.remove('hidden');

    // Request fullscreen (optional)
    // document.documentElement.requestFullscreen?.();
}

// Render markdown to HTML
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

    // Play/Pause
    document.getElementById('play-pause-btn').addEventListener('click', togglePlay);

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
    });
}

function exitTeleprompter() {
    stopScrolling();
    stopVoice();

    document.getElementById('teleprompter-view').classList.add('hidden');
    document.getElementById('selection-view').classList.remove('hidden');

    // Exit fullscreen
    document.exitFullscreen?.();
}

function togglePlay() {
    if (state.isPlaying) {
        stopScrolling();
    } else {
        startScrolling();
    }
}

function startScrolling() {
    state.isPlaying = true;
    state.lastTimestamp = null;

    document.getElementById('play-pause-btn').textContent = '⏸️';
    document.getElementById('teleprompter-content').classList.add('scrolling');

    // Start animation loop
    state.animationFrame = requestAnimationFrame(scrollStep);
}

function stopScrolling() {
    state.isPlaying = false;

    document.getElementById('play-pause-btn').textContent = '▶️';
    document.getElementById('teleprompter-content').classList.remove('scrolling');

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
    state.scrollPosition += scrollAmount;

    // Apply scroll
    const content = document.getElementById('teleprompter-content');
    content.style.transform = `translateY(-${state.scrollPosition}px)${state.isMirrored ? ' scaleX(-1)' : ''}`;

    // Check if reached end
    const maxScroll = content.scrollHeight - window.innerHeight + 200;
    if (state.scrollPosition >= maxScroll) {
        stopScrolling();
        return;
    }

    state.animationFrame = requestAnimationFrame(scrollStep);
}

function resetScroll() {
    stopScrolling();
    state.scrollPosition = 0;

    const content = document.getElementById('teleprompter-content');
    content.style.transform = state.isMirrored ? 'scaleX(-1)' : 'translateY(0)';
}

function adjustSpeed(delta) {
    state.scrollSpeed = Math.max(10, Math.min(150, state.scrollSpeed + delta));
    document.getElementById('speed-display').textContent = state.scrollSpeed;
    document.getElementById('scroll-speed').value = state.scrollSpeed;
}

function toggleMirror() {
    state.isMirrored = !state.isMirrored;

    const content = document.getElementById('teleprompter-content');
    const mirrorBtn = document.getElementById('mirror-btn');

    if (state.isMirrored) {
        content.classList.add('mirrored');
        mirrorBtn.classList.add('active');
    } else {
        content.classList.remove('mirrored');
        mirrorBtn.classList.remove('active');
    }

    // Update transform
    content.style.transform = `translateY(-${state.scrollPosition}px)${state.isMirrored ? ' scaleX(-1)' : ''}`;
}

function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('hidden');
}

// ============================================
// SETTINGS
// ============================================

function setupSettings() {
    // Font Size
    const fontSizeInput = document.getElementById('font-size');
    fontSizeInput.addEventListener('input', (e) => {
        state.fontSize = parseInt(e.target.value);
        document.getElementById('font-size-value').textContent = `${state.fontSize}px`;
        applyStyles();
    });

    // Scroll Speed
    const scrollSpeedInput = document.getElementById('scroll-speed');
    scrollSpeedInput.addEventListener('input', (e) => {
        state.scrollSpeed = parseInt(e.target.value);
        document.getElementById('scroll-speed-value').textContent = state.scrollSpeed;
        document.getElementById('speed-display').textContent = state.scrollSpeed;
    });

    // Line Height
    const lineHeightInput = document.getElementById('line-height');
    lineHeightInput.addEventListener('input', (e) => {
        state.lineHeight = parseFloat(e.target.value);
        document.getElementById('line-height-value').textContent = state.lineHeight.toFixed(1);
        applyStyles();
    });

    // Text Color
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.textColor = btn.dataset.color;
            applyStyles();
        });
    });

    // Background Color
    document.querySelectorAll('.bg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.bgColor = btn.dataset.bg;
            applyStyles();
        });
    });

    // Show Parts
    document.getElementById('show-parts').addEventListener('change', (e) => {
        state.showPartLabels = e.target.checked;
        if (selectedScript) {
            startTeleprompter(selectedScript);
        }
    });

    // Show Divider (reading line)
    const showDividerCheckbox = document.getElementById('show-divider');
    if (showDividerCheckbox) {
        showDividerCheckbox.checked = state.showDivider;
        showDividerCheckbox.addEventListener('change', (e) => {
            state.showDivider = e.target.checked;
            applyStyles();
        });
    }
}

function applyStyles() {
    const content = document.getElementById('teleprompter-content');
    const container = document.getElementById('teleprompter-view');
    const readingLine = document.querySelector('.reading-line');

    content.style.fontSize = `${state.fontSize}px`;
    content.style.lineHeight = state.lineHeight;
    content.style.color = state.textColor;
    container.style.backgroundColor = state.bgColor;

    // Toggle reading line visibility
    if (readingLine) {
        readingLine.style.display = state.showDivider ? 'block' : 'none';
    }
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Only handle shortcuts when teleprompter is visible
        if (document.getElementById('teleprompter-view').classList.contains('hidden')) {
            return;
        }

        switch (e.key) {
            case ' ':
            case 'Space':
                e.preventDefault();
                togglePlay();
                break;
            case 'Escape':
                exitTeleprompter();
                break;
            case 'r':
            case 'R':
                resetScroll();
                break;
            case 'm':
            case 'M':
                toggleMirror();
                break;
            case 'v':
            case 'V':
                toggleVoice();
                break;
            case 'ArrowUp':
                adjustSpeed(10);
                break;
            case 'ArrowDown':
                adjustSpeed(-10);
                break;
        }
    });
}

// ============================================
// VOICE RECOGNITION
// ============================================

function setupVoiceRecognition() {
    // Check if Web Speech API is available
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

        // Restart if still active
        if (state.isVoiceActive) {
            try {
                recognition.start();
            } catch (e) {
                console.log('Failed to restart recognition');
            }
        }
    };

    recognition.onresult = (event) => {
        // When speech is detected, ensure scrolling
        if (!state.isPlaying) {
            startScrolling();
        }

        // Optionally adjust speed based on speech rate
        // (More advanced implementation would analyze speech patterns)
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
// MANUAL SCROLL (Trackpad/Mouse)
// ============================================

function setupManualScroll() {
    const container = document.getElementById('teleprompter-container');

    if (!container) return;

    // Handle wheel/trackpad scroll
    container.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Stop auto-scroll when manually scrolling
        if (state.isPlaying) {
            stopScrolling();
        }

        // Apply manual scroll
        state.scrollPosition += e.deltaY;
        state.scrollPosition = Math.max(0, state.scrollPosition);

        const content = document.getElementById('teleprompter-content');
        const maxScroll = content.scrollHeight - window.innerHeight + 200;
        state.scrollPosition = Math.min(state.scrollPosition, maxScroll);

        content.style.transform = `translateY(-${state.scrollPosition}px)${state.isMirrored ? ' scaleX(-1)' : ''}`;
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

        state.scrollPosition += deltaY;
        state.scrollPosition = Math.max(0, state.scrollPosition);

        const content = document.getElementById('teleprompter-content');
        const maxScroll = content.scrollHeight - window.innerHeight + 200;
        state.scrollPosition = Math.min(state.scrollPosition, maxScroll);

        content.style.transform = `translateY(-${state.scrollPosition}px)${state.isMirrored ? ' scaleX(-1)' : ''}`;
    }, { passive: true });
}
