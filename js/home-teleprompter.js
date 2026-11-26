// ============================================
// HOME PAGE FREE ONLINE TELEPROMPTER (NO LOGIN REQUIRED)
// Instant zero-signup studio teleprompter for web visitors:
// sub-pixel RAF auto-scroll, optional Voice Word-Sync / Mic VAD,
// mirror mode, countdown, font/speed/eyeline/theme controls, and fullscreen overlay.
// ============================================

(function () {
    'use strict';

    const DRAFT_STORAGE_KEY = 'cc_free_teleprompter_draft';
    const SPEAKING_WPM = 140;

    const SAMPLE_SCRIPTS = {
        reels_hook: [
            'Stop waiting to feel ready before pressing record.',
            '',
            'Most creators think confidence shows up first, and then filming gets easy. Actually, the reverse happens.',
            '',
            'Press record on a short thirty-second thought today. Keep the camera at eye level, look straight at the lens, and talk like you are sending a voice note to one close friend.',
            '',
            'Take one rough practice rep right now—you do not even have to post it.'
        ].join('\n'),
        creator_intro: [
            'Hi, I help busy professionals simplify one confusing skill each week.',
            '',
            'For months I overthought every take because I tried memorizing full paragraphs. Now I keep short talking points right below my camera lens.',
            '',
            'Notice how looking straight into the lens while reading short lines makes delivery sound calm and natural.',
            '',
            'Tell me in the comments which topic you want broken down next.'
        ].join('\n'),
        hinglish_take: [
            'Camera on hote hi mind blank kyun ho jaata hai?',
            '',
            'Simple reason hai—hum audience ko nahi, khud ko judge kar rahe hote hain.',
            '',
            'Aaj bas ek chhota rule try karo. Phone ko eye level pe rakho, screen pe apni shakl mat dekho, aur seedha chhote glass lens mein dekh ke ek dost se baat karo.',
            '',
            'Bas ek thirty-second take record karo, post kal karna.'
        ].join('\n')
    };

    const THEMES = {
        obsidian: { bg: '#12140E', text: '#F6F7F0' },
        black: { bg: '#000000', text: '#FFFFFF' },
        olive: { bg: '#1B2117', text: '#EFF5DF' }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const root = document.getElementById('free-teleprompter');
        if (!root) return;

        const el = {
            studio: document.getElementById('htp-studio'),
            stage: document.getElementById('htp-stage'),
            viewport: document.getElementById('htp-viewport'),
            content: document.getElementById('htp-content'),
            textarea: document.getElementById('htp-script-input'),
            presetBtns: root.querySelectorAll('[data-htp-preset]'),
            clearBtn: document.getElementById('htp-clear-btn'),
            wordCount: document.getElementById('htp-word-count'),
            readTime: document.getElementById('htp-read-time'),
            playBtn: document.getElementById('htp-play-btn'),
            resetBtn: document.getElementById('htp-reset-btn'),
            mirrorBtn: document.getElementById('htp-mirror-btn'),
            voiceBtn: document.getElementById('htp-voice-btn'),
            expandBtn: document.getElementById('htp-expand-btn'),
            countdownBtn: document.getElementById('htp-countdown-btn'),
            eyelineBtn: document.getElementById('htp-eyeline-btn'),
            speedRange: document.getElementById('htp-speed'),
            speedVal: document.getElementById('htp-speed-val'),
            fontRange: document.getElementById('htp-font-size'),
            fontVal: document.getElementById('htp-font-size-val'),
            themeBtns: root.querySelectorAll('[data-htp-theme]'),
            progressFill: document.getElementById('htp-progress-fill'),
            elapsedEl: document.getElementById('htp-elapsed'),
            eyelineBar: document.getElementById('htp-eyeline'),
            statusPill: document.getElementById('htp-status-pill'),
            countdownOverlay: document.getElementById('htp-countdown-overlay'),
            countdownNum: document.getElementById('htp-countdown-num'),
            collapseBtn: document.getElementById('htp-collapse-btn'),
        };

        const state = {
            isPlaying: false,
            isMirrored: false,
            isExpanded: false,
            isVoiceMode: false,
            useCountdown: false,
            eyeLinePct: 34,
            speed: 42,
            fontSize: 34,
            theme: 'obsidian',
            scrollFloat: 0,
            rafId: null,
            lastTs: null,
            elapsedSec: 0,
            elapsedTimer: null,
            countdownTimer: null,
            words: [],
            voiceWordIdx: 0,
            recognition: null,
            vadAudioCtx: null,
            vadStream: null,
            vadAnalyser: null,
            vadRaf: null,
            vadLastSpeechAt: 0,
        };

        function loadInitialText() {
            let saved = '';
            try {
                saved = localStorage.getItem(DRAFT_STORAGE_KEY) || '';
            } catch (_) { /* ignore */ }
            el.textarea.value = saved.trim() ? saved : SAMPLE_SCRIPTS.reels_hook;
            renderPrompterScript();
        }

        function countWords(text) {
            const trimmed = (text || '').trim();
            return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
        }

        function formatSpeakingTime(words) {
            if (!words) return '~0s speaking';
            const sec = Math.max(5, Math.round((words / SPEAKING_WPM) * 60));
            if (sec < 60) return `~${sec}s speaking`;
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return s > 0 ? `~${m}m ${s}s speaking` : `~${m}m speaking`;
        }

        function normalizeWord(raw) {
            return (raw || '')
                .toLowerCase()
                .replace(/[\u2018\u2019']/g, '')
                .replace(/[^\p{L}\p{N}]/gu, '');
        }

        function renderPrompterScript() {
            const rawText = el.textarea.value || '';
            const wordsCount = countWords(rawText);
            el.wordCount.textContent = `${wordsCount} words`;
            el.readTime.textContent = formatSpeakingTime(wordsCount);

            el.content.innerHTML = '';
            state.words = [];
            state.voiceWordIdx = 0;

            const lines = rawText.replace(/\r\n/g, '\n').split('\n');
            if (!rawText.trim()) {
                const emptyP = document.createElement('p');
                emptyP.className = 'htp-empty-msg';
                emptyP.textContent = 'Paste or type your script on the left to start practicing.';
                el.content.appendChild(emptyP);
                updateProgress();
                return;
            }

            lines.forEach((line) => {
                const p = document.createElement('p');
                if (!line.trim()) {
                    p.className = 'htp-spacer';
                    p.innerHTML = '&nbsp;';
                    el.content.appendChild(p);
                    return;
                }

                const tokens = line.split(/(\s+)/);
                tokens.forEach((tok) => {
                    if (!tok) return;
                    if (/^\s+$/.test(tok)) {
                        p.appendChild(document.createTextNode(tok));
                        return;
                    }
                    const norm = normalizeWord(tok);
                    if (!norm) {
                        p.appendChild(document.createTextNode(tok));
                        return;
                    }
                    const span = document.createElement('span');
                    span.className = 'htp-word';
                    span.dataset.idx = String(state.words.length);
                    span.textContent = tok;
                    state.words.push({ norm, el: span });
                    p.appendChild(span);
                });

                el.content.appendChild(p);
            });

            applyVisualSettings();
            updateProgress();
        }

        function applyVisualSettings() {
            const themeObj = THEMES[state.theme] || THEMES.obsidian;
            el.stage.style.backgroundColor = themeObj.bg;
            el.content.style.color = themeObj.text;
            el.content.style.fontSize = `${state.fontSize}px`;
            el.content.style.transform = state.isMirrored ? 'scaleX(-1)' : 'none';

            const vpHeight = el.viewport ? el.viewport.clientHeight : 340;
            const padTop = state.isExpanded
                ? `${state.eyeLinePct}vh`
                : `${Math.max(70, Math.round(vpHeight * (state.eyeLinePct / 100)))}px`;
            const padBottom = state.isExpanded
                ? `${100 - state.eyeLinePct}vh`
                : `${Math.max(140, Math.round(vpHeight * ((100 - state.eyeLinePct) / 100)))}px`;
            el.content.style.paddingTop = padTop;
            el.content.style.paddingBottom = padBottom;

            if (el.eyelineBar) {
                el.eyelineBar.style.top = `${state.eyeLinePct}%`;
            }
            if (el.speedVal) el.speedVal.textContent = String(state.speed);
            if (el.fontVal) el.fontVal.textContent = `${state.fontSize}px`;
        }

        function setStatus(msg) {
            if (!el.statusPill) return;
            if (!msg) {
                el.statusPill.classList.add('hidden');
                el.statusPill.textContent = '';
            } else {
                el.statusPill.textContent = msg;
                el.statusPill.classList.remove('hidden');
            }
        }

        function formatClock(sec) {
            const m = String(Math.floor(sec / 60)).padStart(2, '0');
            const s = String(sec % 60).padStart(2, '0');
            return `${m}:${s}`;
        }

        function startElapsedTimer() {
            stopElapsedTimer();
            state.elapsedTimer = setInterval(() => {
                state.elapsedSec += 1;
                if (el.elapsedEl) el.elapsedEl.textContent = formatClock(state.elapsedSec);
            }, 1000);
        }

        function stopElapsedTimer() {
            if (state.elapsedTimer) {
                clearInterval(state.elapsedTimer);
                state.elapsedTimer = null;
            }
        }

        function updateProgress() {
            const maxScroll = Math.max(0, el.viewport.scrollHeight - el.viewport.clientHeight);
            const pct = maxScroll > 0 ? Math.min(100, (el.viewport.scrollTop / maxScroll) * 100) : 0;
            if (el.progressFill) el.progressFill.style.width = `${pct.toFixed(1)}%`;
        }

        function updatePlayButtonUI() {
            if (!el.playBtn) return;
            if (state.isPlaying) {
                el.playBtn.textContent = '⏸ Pause';
                el.playBtn.classList.add('is-playing');
                el.playBtn.setAttribute('aria-pressed', 'true');
            } else {
                el.playBtn.textContent = '▶ Play';
                el.playBtn.classList.remove('is-playing');
                el.playBtn.setAttribute('aria-pressed', 'false');
            }
        }

        function cancelCountdown() {
            if (state.countdownTimer) {
                clearInterval(state.countdownTimer);
                state.countdownTimer = null;
            }
            el.countdownOverlay?.classList.add('hidden');
        }

        function startScrollingLoop() {
            state.isPlaying = true;
            state.scrollFloat = el.viewport.scrollTop;
            state.lastTs = null;
            updatePlayButtonUI();
            startElapsedTimer();

            if (typeof window.ccAnalytics?.trackEvent === 'function') {
                window.ccAnalytics.trackEvent('home_teleprompter_play', {
                    voice_sync: state.isVoiceMode,
                    words: state.words.length
                });
            }

            if (state.isVoiceMode) {
                startVoiceEngine();
                return;
            }

            function step(ts) {
                if (!state.isPlaying || state.isVoiceMode) return;
                if (state.lastTs !== null) {
                    const dt = Math.min(0.1, (ts - state.lastTs) / 1000);
                    state.scrollFloat += state.speed * dt;
                    const maxScroll = Math.max(0, el.viewport.scrollHeight - el.viewport.clientHeight);
                    if (state.scrollFloat >= maxScroll && maxScroll > 0) {
                        el.viewport.scrollTop = maxScroll;
                        updateProgress();
                        pausePlayback('Reached end of script');
                        return;
                    }
                    el.viewport.scrollTop = state.scrollFloat;
                    updateProgress();
                }
                state.lastTs = ts;
                state.rafId = requestAnimationFrame(step);
            }

            state.rafId = requestAnimationFrame(step);
        }

        function pausePlayback(statusText) {
            cancelCountdown();
            state.isPlaying = false;
            if (state.rafId) {
                cancelAnimationFrame(state.rafId);
                state.rafId = null;
            }
            stopVoiceEngine();
            stopElapsedTimer();
            updatePlayButtonUI();
            if (statusText) setStatus(statusText);
        }

        function togglePlay() {
            if (state.countdownTimer) {
                cancelCountdown();
                setStatus('Countdown cancelled');
                return;
            }
            if (state.isPlaying) {
                pausePlayback();
                return;
            }
            if (state.words.length === 0) {
                setStatus('Add script text first');
                return;
            }

            setStatus(state.isVoiceMode ? 'Listening to your voice...' : '');

            if (!state.useCountdown) {
                startScrollingLoop();
                return;
            }

            let count = 3;
            el.countdownNum.textContent = String(count);
            el.countdownOverlay?.classList.remove('hidden');
            state.countdownTimer = setInterval(() => {
                count -= 1;
                if (count <= 0) {
                    cancelCountdown();
                    startScrollingLoop();
                } else {
                    el.countdownNum.textContent = String(count);
                }
            }, 1000);
        }

        function resetPrompter() {
            pausePlayback();
            state.scrollFloat = 0;
            state.elapsedSec = 0;
            state.voiceWordIdx = 0;
            el.viewport.scrollTop = 0;
            if (el.elapsedEl) el.elapsedEl.textContent = '00:00';
            state.words.forEach((w) => w.el.classList.remove('spoken', 'active-word'));
            updateProgress();
            setStatus('');
        }

        // ============================================
        // OPTIONAL VOICE WORD-SYNC + MIC VAD FALLBACK
        // ============================================

        function highlightToWord(idx) {
            if (idx < 0 || idx >= state.words.length) return;
            state.words.forEach((w, i) => {
                w.el.classList.toggle('spoken', i < idx);
                w.el.classList.toggle('active-word', i === idx);
            });
            const wordEl = state.words[idx].el;
            const targetTop = wordEl.offsetTop - Math.round(el.viewport.clientHeight * 0.34);
            el.viewport.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
            updateProgress();
        }

        function matchTranscript(transcript) {
            const spokenTokens = transcript.trim().split(/\s+/).map(normalizeWord).filter(Boolean);
            if (spokenTokens.length === 0) return;

            let idx = state.voiceWordIdx;
            const windowEnd = Math.min(state.words.length, idx + 12);
            for (const spk of spokenTokens) {
                for (let j = idx; j < windowEnd; j++) {
                    if (state.words[j].norm === spk) {
                        idx = j + 1;
                        break;
                    }
                }
            }
            if (idx > state.voiceWordIdx) {
                state.voiceWordIdx = Math.min(idx, state.words.length - 1);
                highlightToWord(state.voiceWordIdx);
            }
        }

        async function startMicVadFallback() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                const ctx = new AudioCtx();
                const src = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 512;
                src.connect(analyser);
                const data = new Uint8Array(analyser.frequencyBinCount);

                state.vadStream = stream;
                state.vadAudioCtx = ctx;
                state.vadAnalyser = analyser;
                setStatus('Voice Activity Sync active — speak to scroll');

                let lastTs = null;
                function vadStep(ts) {
                    if (!state.isPlaying || !state.isVoiceMode) return;
                    analyser.getByteFrequencyData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) sum += data[i];
                    const avg = sum / data.length;
                    if (avg > 12) state.vadLastSpeechAt = ts;

                    if (lastTs !== null && (ts - state.vadLastSpeechAt) < 500) {
                        const dt = Math.min(0.1, (ts - lastTs) / 1000);
                        state.scrollFloat += state.speed * dt;
                        const maxScroll = Math.max(0, el.viewport.scrollHeight - el.viewport.clientHeight);
                        el.viewport.scrollTop = Math.min(maxScroll, state.scrollFloat);
                        updateProgress();
                    }
                    lastTs = ts;
                    state.vadRaf = requestAnimationFrame(vadStep);
                }
                state.vadRaf = requestAnimationFrame(vadStep);
            } catch (_) {
                // Fallback smoothly to regular auto-scroll if mic blocked or unsupported
                state.isVoiceMode = false;
                el.voiceBtn?.classList.remove('active');
                el.voiceBtn?.setAttribute('aria-pressed', 'false');
                setStatus('Mic unavailable — switched to Auto-Scroll');
                startScrollingLoop();
            }
        }

        function startVoiceEngine() {
            const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!Ctor) {
                startMicVadFallback();
                return;
            }
            try {
                const rec = new Ctor();
                rec.continuous = true;
                rec.interimResults = true;
                rec.lang = 'en-US';
                rec.onresult = (event) => {
                    let phrase = '';
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        phrase += ' ' + event.results[i][0].transcript;
                    }
                    matchTranscript(phrase);
                };
                rec.onerror = (ev) => {
                    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'network') {
                        stopVoiceEngine();
                        startMicVadFallback();
                    }
                };
                rec.onend = () => {
                    if (state.isPlaying && state.isVoiceMode && state.recognition) {
                        try { rec.start(); } catch (_) { /* ignore */ }
                    }
                };
                rec.start();
                state.recognition = rec;
                setStatus('Voice Word-Sync active — read your script aloud');
            } catch (_) {
                startMicVadFallback();
            }
        }

        function stopVoiceEngine() {
            if (state.recognition) {
                const r = state.recognition;
                state.recognition = null;
                try { r.stop(); } catch (_) { /* ignore */ }
            }
            if (state.vadRaf) {
                cancelAnimationFrame(state.vadRaf);
                state.vadRaf = null;
            }
            if (state.vadStream) {
                state.vadStream.getTracks().forEach((t) => t.stop());
                state.vadStream = null;
            }
            if (state.vadAudioCtx) {
                state.vadAudioCtx.close().catch(() => {});
                state.vadAudioCtx = null;
            }
        }

        function setExpandedMode(expanded) {
            state.isExpanded = expanded;
            el.stage.classList.toggle('is-expanded', expanded);
            document.body.classList.toggle('htp-modal-open', expanded);
            if (el.expandBtn) {
                el.expandBtn.textContent = expanded ? '⤡ Exit Fullscreen' : '⛶ Fullscreen';
                el.expandBtn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
            }
            el.collapseBtn?.classList.toggle('hidden', !expanded);
            applyVisualSettings();
            updateProgress();
        }

        // ============================================
        // EVENT BINDINGS
        // ============================================

        el.presetBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-htp-preset');
                if (!key || !SAMPLE_SCRIPTS[key]) return;
                el.presetBtns.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                pausePlayback();
                el.textarea.value = SAMPLE_SCRIPTS[key];
                try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch (_) { /* ignore */ }
                renderPrompterScript();
                resetPrompter();
            });
        });

        el.clearBtn?.addEventListener('click', () => {
            pausePlayback();
            el.presetBtns.forEach((b) => b.classList.remove('active'));
            el.textarea.value = '';
            try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch (_) { /* ignore */ }
            renderPrompterScript();
            el.textarea.focus();
        });

        let draftTimer = null;
        el.textarea?.addEventListener('input', () => {
            el.presetBtns.forEach((b) => b.classList.remove('active'));
            renderPrompterScript();
            clearTimeout(draftTimer);
            draftTimer = setTimeout(() => {
                try { localStorage.setItem(DRAFT_STORAGE_KEY, el.textarea.value); } catch (_) { /* ignore */ }
            }, 300);
        });

        el.playBtn?.addEventListener('click', togglePlay);
        el.resetBtn?.addEventListener('click', resetPrompter);
        el.countdownOverlay?.addEventListener('click', () => {
            cancelCountdown();
            setStatus('Countdown cancelled');
        });

        el.mirrorBtn?.addEventListener('click', () => {
            state.isMirrored = !state.isMirrored;
            el.mirrorBtn.classList.toggle('active', state.isMirrored);
            el.mirrorBtn.setAttribute('aria-pressed', state.isMirrored ? 'true' : 'false');
            applyVisualSettings();
        });

        el.voiceBtn?.addEventListener('click', () => {
            state.isVoiceMode = !state.isVoiceMode;
            el.voiceBtn.classList.toggle('active', state.isVoiceMode);
            el.voiceBtn.setAttribute('aria-pressed', state.isVoiceMode ? 'true' : 'false');
            setStatus(state.isVoiceMode ? 'Voice Sync ready — press Play and speak' : '');
            if (state.isPlaying) {
                pausePlayback();
                startScrollingLoop();
            }
        });

        el.countdownBtn?.addEventListener('click', () => {
            state.useCountdown = !state.useCountdown;
            el.countdownBtn.classList.toggle('active', state.useCountdown);
            el.countdownBtn.textContent = state.useCountdown ? '⏱ 3s On' : '⏱ 3s Off';
            el.countdownBtn.setAttribute('aria-pressed', state.useCountdown ? 'true' : 'false');
        });

        el.eyelineBtn?.addEventListener('click', () => {
            state.eyeLinePct = state.eyeLinePct === 34 ? 48 : 34;
            el.eyelineBtn.textContent = state.eyeLinePct === 34 ? '👁 Top Lens' : '👁 Mid Screen';
            applyVisualSettings();
        });

        el.expandBtn?.addEventListener('click', () => {
            const next = !state.isExpanded;
            setExpandedMode(next);
            if (next && document.documentElement.requestFullscreen && el.stage.requestFullscreen) {
                el.stage.requestFullscreen().catch(() => { /* CSS expanded fallback remains active */ });
            } else if (!next && document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        });

        el.collapseBtn?.addEventListener('click', () => {
            setExpandedMode(false);
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && state.isExpanded) {
                setExpandedMode(false);
            }
        });

        el.speedRange?.addEventListener('input', (e) => {
            state.speed = Number(e.target.value) || 42;
            applyVisualSettings();
        });

        el.fontRange?.addEventListener('input', (e) => {
            state.fontSize = Number(e.target.value) || 34;
            applyVisualSettings();
        });

        el.themeBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const t = btn.getAttribute('data-htp-theme');
                if (!t || !THEMES[t]) return;
                state.theme = t;
                el.themeBtns.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                applyVisualSettings();
            });
        });

        el.viewport?.addEventListener('scroll', () => {
            if (!state.isPlaying) {
                state.scrollFloat = el.viewport.scrollTop;
            }
            updateProgress();
        }, { passive: true });

        // Safe keyboard shortcuts: only active inside expanded studio (never hijack Space during page reading/typing)
        document.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
                return;
            }
            if (e.key === 'Escape' && state.isExpanded) {
                setExpandedMode(false);
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                return;
            }
            if (state.isExpanded && e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }
        });

        loadInitialText();
    });
})();
