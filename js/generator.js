// ============================================
// AI GENERATOR PAGE CONTROLLER
// End-to-end spoken-word video script generation, hook switching,
// iterative refinement, safe markdown preview, and teleprompter handoff.
// ============================================

let currentUser = null;
let generatedScript = null;
let lastGenerationPayload = null;
let savedScriptId = null;
let languageOptions = [];
let isCustomMode = false;
let isFormattedPreview = false;

const SPEAKING_WPM = 140;
const EDGE_TIMEOUT_MS = 50000;

const FALLBACK_LANGUAGES = [
    { language_code: 'en', language_name: 'English', native_name: 'English', is_bilingual: false, primary_language: 'en', secondary_language: null },
    { language_code: 'hinglish', language_name: 'Hinglish', native_name: 'हिंग्लिश', is_bilingual: true, primary_language: 'hi', secondary_language: 'en' },
    { language_code: 'hi', language_name: 'Hindi', native_name: 'हिन्दी', is_bilingual: false, primary_language: 'hi', secondary_language: null },
    { language_code: 'ta', language_name: 'Tamil', native_name: 'தமிழ்', is_bilingual: false, primary_language: 'ta', secondary_language: null },
    { language_code: 'te', language_name: 'Telugu', native_name: 'తెలుగు', is_bilingual: false, primary_language: 'te', secondary_language: null },
    { language_code: 'tanglish', language_name: 'Tanglish', native_name: 'தமிழிஷ்', is_bilingual: true, primary_language: 'ta', secondary_language: 'en' },
    { language_code: 'mr', language_name: 'Marathi', native_name: 'मराठी', is_bilingual: false, primary_language: 'mr', secondary_language: null },
    { language_code: 'bn', language_name: 'Bengali', native_name: 'বাংলা', is_bilingual: false, primary_language: 'bn', secondary_language: null },
    { language_code: 'gu', language_name: 'Gujarati', native_name: 'ગુજરાતી', is_bilingual: false, primary_language: 'gu', secondary_language: null },
    { language_code: 'kn', language_name: 'Kannada', native_name: 'ಕನ್ನಡ', is_bilingual: false, primary_language: 'kn', secondary_language: null },
    { language_code: 'ml', language_name: 'Malayalam', native_name: 'മലയാളം', is_bilingual: false, primary_language: 'ml', secondary_language: null },
    { language_code: 'pa', language_name: 'Punjabi', native_name: 'ਪੰਜਾਬੀ', is_bilingual: false, primary_language: 'pa', secondary_language: null },
];

const STARTER_PRESETS = {
    reels_tips: {
        template: 'tips',
        platform: 'reels_shorts',
        topic: '3 simple habits to stop freezing when you hit record',
        coreMessage: 'Practice 60 seconds daily off-camera, look at the lens instead of your screen reflection, and talk like messaging one close friend.',
        audience: 'Camera-shy beginners and Instagram Reels creators',
        tone: 'casual',
        length: 'short',
        language: 'en',
        ctaStyle: 'save_share',
    },
    camera_story: {
        template: 'story',
        platform: 'reels_shorts',
        topic: 'How I recorded 15 awkward videos before one finally felt natural',
        coreMessage: 'The first take always feels weird because you judge yourself mid-sentence. Shipping tiny daily reps beats waiting to feel confident.',
        audience: 'Aspiring creators scared of posting their first video',
        tone: 'inspiring',
        length: 'medium',
        language: 'en',
        ctaStyle: 'comment',
    },
    tech_howto: {
        template: 'howto',
        platform: 'youtube',
        topic: 'How to use AI script outlining without sounding robotic on YouTube',
        coreMessage: 'Feed AI one concrete personal story first, generate short spoken bullet beats instead of dense essays, and trim adjectives before hitting teleprompter play.',
        audience: 'Educators, indie founders, and tech creators',
        tone: 'professional',
        length: 'long',
        language: 'en',
        ctaStyle: 'follow',
    },
    product_review: {
        template: 'review',
        platform: 'reels_shorts',
        topic: 'Honest 30-day review of budget clip-on wireless mic for phone videos',
        coreMessage: 'Clear voice in noisy rooms under twenty dollars, good battery life, only real drawback is wind muff slipping outdoors.',
        audience: 'Solo mobile video creators on a budget',
        tone: 'casual',
        length: 'medium',
        language: 'en',
        ctaStyle: 'comment',
    },
    myth_buster: {
        template: 'mythbuster',
        platform: 'linkedin',
        topic: 'Why buying an expensive camera slows down new creators',
        coreMessage: 'Gear adds setup friction and raises perfectionism. Clean window light plus smartphone lens audio builds consistency 10x faster.',
        audience: 'Coaches, founders, and professionals building a personal brand',
        tone: 'professional',
        length: 'medium',
        language: 'en',
        ctaStyle: 'reflection',
    },
    hinglish_reel: {
        template: 'tips',
        platform: 'reels_shorts',
        topic: 'Camera ke saamne hesitation kaise khatam karein in 5 minutes',
        coreMessage: 'Perfect bolne ki koshish mat karo, sirf ek friend ko voice note samajh ke baat karo aur pehle 3 takes delete mat karo.',
        audience: 'Young Indian creators, students, and freelancers',
        tone: 'casual',
        length: 'short',
        language: 'hinglish',
        ctaStyle: 'comment',
    },
};

const SAMPLE_AI_PROMPT = `You are an expert spoken-word video scriptwriter for teleprompter reading.

Write a short video script about: [YOUR TOPIC HERE]
PLATFORM: Instagram Reels / YouTube Shorts
TARGET AUDIENCE: [e.g., beginners, founders, students]
CORE TAKEAWAY: [1-2 crisp sentences you definitely want covered]

RULES:
1. Write ONLY the exact words to speak aloud — no stage directions like [Pause], no labels, no emojis, no hashtags, no code blocks
2. Use SHORT, breathable phrases (6-14 words) and double line breaks between beats
3. Start with a strong HOOK (no "Hello everyone" or "In this video")
4. Use contractions, plain spoken numbers, and direct address ("you")
5. End with one clear conversational call-to-action
6. Keep total words matched to video duration (~140 words per minute)

OUTPUT: Return clean Title, Hook, Body, and Close ready for a teleprompter.`;

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    authService.init();
    scriptsService.init();

    const authenticated = await authService.requireAuth();
    if (!authenticated) return;

    currentUser = authService.currentUser;
    if (!currentUser) return;

    await Promise.all([
        loadLanguageOptions(),
        applyUserLanguagePreference(),
    ]);

    setupUserInfo();
    setupLogout();
    setupQuickPresets();
    setupTemplateSelection();
    setupPlatformSelection();
    setupLanguageSelection();
    setupToneSelection();
    setupLengthSelection();
    setupGeneratorForm();
    setupPreviewActions();
    setupRefineActions();
    setupWriteYourOwn();
    setupCustomEditor();
    setupHowToUse();
});

// ============================================
// UI SETUP & USER PREFERENCES
// ============================================

function setupUserInfo() {
    const avatarEl = document.getElementById('user-avatar');
    const displayName = currentUser.user_metadata?.display_name ||
        currentUser.email?.split('@')[0] || 'U';
    if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
}

function setupLogout() {
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await authService.signOut();
        window.location.href = 'login.html';
    });
}

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

async function loadLanguageOptions() {
    languageOptions = FALLBACK_LANGUAGES;
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('language_options')
            .select('*')
            .eq('is_active', true)
            .order('order_index', { ascending: true });

        if (!error && Array.isArray(data) && data.length > 0) {
            languageOptions = data;
        }
    } catch (error) {
        console.warn('Using built-in language fallback:', error?.message || error);
    }

    const languageSelect = document.getElementById('language');
    if (languageSelect && languageOptions.length > 0) {
        languageSelect.innerHTML = '';
        languageOptions.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.language_code;
            const suffix = lang.language_code === 'hinglish' || lang.language_code === 'tanglish'
                ? ' (Roman Script)'
                : '';
            opt.textContent = `${lang.native_name} - ${lang.language_name}${suffix}`;
            languageSelect.appendChild(opt);
        });
    }
}

async function applyUserLanguagePreference() {
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('user_profiles')
            .select('language_preference')
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (!error && data?.language_preference) {
            const langSelect = document.getElementById('language');
            if (langSelect && Array.from(langSelect.options).some(o => o.value === data.language_preference)) {
                langSelect.value = data.language_preference;
                updateRomanizedToggleVisibility();
            }
        }
    } catch (_) {
        // Non-critical if user profile isn't created yet
    }
}

function setupLanguageSelection() {
    const langSelect = document.getElementById('language');
    if (!langSelect) return;
    langSelect.addEventListener('change', updateRomanizedToggleVisibility);
    updateRomanizedToggleVisibility();
}

function updateRomanizedToggleVisibility() {
    const langCode = document.getElementById('language')?.value || 'en';
    const toggleGroup = document.getElementById('romanized-toggle-group');
    if (!toggleGroup) return;

    // Show Romanized toggle only for native-script Indic languages (en, hinglish, tanglish already use Latin letters)
    const show = !['en', 'hinglish', 'tanglish'].includes(langCode);
    toggleGroup.classList.toggle('hidden', !show);
}

// ============================================
// QUICK PRESETS & FORM SELECTORS
// ============================================

function setupQuickPresets() {
    const chips = document.querySelectorAll('.preset-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const key = chip.dataset.preset;
            const preset = STARTER_PRESETS[key];
            if (!preset) return;

            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            selectRadioGroup('.template-option', 'template', preset.template);
            selectRadioGroup('.platform-option', 'platform', preset.platform);
            selectRadioGroup('.tone-chip', 'tone', preset.tone);
            selectRadioGroup('.length-option', 'length', preset.length);

            document.getElementById('topic').value = preset.topic;
            document.getElementById('core-message').value = preset.coreMessage || '';
            document.getElementById('audience').value = preset.audience || '';
            document.getElementById('cta-style').value = preset.ctaStyle || 'auto';

            const langSelect = document.getElementById('language');
            if (langSelect && Array.from(langSelect.options).some(o => o.value === preset.language)) {
                langSelect.value = preset.language;
                updateRomanizedToggleVisibility();
            }

            showToast(`Loaded "${chip.textContent.trim()}" preset — customize or click Generate!`);
        });
    });
}

function selectRadioGroup(selector, inputName, value) {
    const items = document.querySelectorAll(selector);
    items.forEach(item => {
        const input = item.querySelector(`input[name="${inputName}"]`);
        if (!input) return;
        const match = input.value === value;
        input.checked = match;
        item.classList.toggle('active', match);
    });
    if (inputName === 'template') {
        document.getElementById('custom-prompt-group')?.classList.toggle('hidden', value !== 'custom');
    }
}

function setupTemplateSelection() {
    const templateOptions = document.querySelectorAll('.template-option');
    const customPromptGroup = document.getElementById('custom-prompt-group');

    templateOptions.forEach(option => {
        option.addEventListener('click', () => {
            templateOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            option.querySelector('input').checked = true;
            customPromptGroup?.classList.toggle('hidden', option.dataset.template !== 'custom');
        });
    });
}

function setupPlatformSelection() {
    const platformOptions = document.querySelectorAll('.platform-option');
    platformOptions.forEach(option => {
        option.addEventListener('click', () => {
            platformOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            option.querySelector('input').checked = true;
        });
    });
}

function setupToneSelection() {
    const toneChips = document.querySelectorAll('.tone-chip');
    toneChips.forEach(chip => {
        chip.addEventListener('click', () => {
            toneChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            chip.querySelector('input').checked = true;
        });
    });
}

function setupLengthSelection() {
    const lengthOptions = document.querySelectorAll('.length-option');
    lengthOptions.forEach(option => {
        option.addEventListener('click', () => {
            lengthOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            option.querySelector('input').checked = true;
        });
    });
}

// ============================================
// GENERATOR FORM & PAYLOAD ASSEMBLY
// ============================================

function setupGeneratorForm() {
    const form = document.getElementById('generator-form');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await generateScript();
    });
}

function buildGenerationPayload() {
    const template = document.querySelector('input[name="template"]:checked')?.value || 'educational';
    const platform = document.querySelector('input[name="platform"]:checked')?.value || 'reels_shorts';
    const topic = document.getElementById('topic').value.trim();
    const coreMessage = document.getElementById('core-message')?.value.trim() || '';
    const audience = document.getElementById('audience').value.trim();
    const ctaStyle = document.getElementById('cta-style')?.value || 'auto';
    const languageCode = document.getElementById('language').value || 'en';
    const tone = document.querySelector('input[name="tone"]:checked')?.value || 'casual';
    const length = document.querySelector('input[name="length"]:checked')?.value || 'medium';
    const customPrompt = document.getElementById('custom-prompt')?.value.trim() || '';
    const markdownMode = document.getElementById('markdown-mode')?.checked ?? true;
    const romanizedChecked = document.getElementById('romanized-mode')?.checked ?? false;

    const langInfo = languageOptions.find(l => l.language_code === languageCode) || { language_name: 'English', native_name: 'English' };
    const languageText = langInfo.is_bilingual
        ? `Write in ${langInfo.language_name} (${langInfo.native_name}) - a natural everyday mix of ${langInfo.primary_language} and ${langInfo.secondary_language}.`
        : `Write the script in conversational ${langInfo.language_name} (${langInfo.native_name || 'English'}).`;

    const useRomanized = !['en', 'hinglish', 'tanglish'].includes(languageCode) && romanizedChecked;

    return {
        action: 'generate',
        template,
        platform,
        topic,
        coreMessage,
        audience,
        ctaStyle,
        tone,
        length,
        customPrompt,
        languageCode,
        languageText,
        scriptStyle: useRomanized ? 'romanized' : 'spoken_natural',
        markdownMode,
        sessionToken: getQrSessionToken(),
    };
}

function getQrSessionToken() {
    try {
        const raw = localStorage.getItem('cc_qr_auth');
        if (!raw) return undefined;
        return JSON.parse(raw)?.sessionToken || undefined;
    } catch (_) {
        return undefined;
    }
}

async function generateScript() {
    const generateBtn = document.getElementById('generate-btn');
    const errorDiv = document.getElementById('generator-error');

    const payload = buildGenerationPayload();
    if (!payload.topic || payload.topic.length < 3) {
        showError(errorDiv, 'Please enter a clear topic (at least 3 characters).');
        errorDiv?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }
    if (payload.template === 'custom' && !payload.customPrompt) {
        showError(errorDiv, 'Add custom instructions for the Custom template, or pick another template.');
        errorDiv?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }

    savedScriptId = null;
    updateSavedBadge(false);
    lastGenerationPayload = payload;

    setButtonLoading(generateBtn, true);
    hideError(errorDiv);
    showLoadingState('Crafting your spoken script...', 'Generating 3 hook angles and teleprompter breaks (~5–15s)');

    try {
        const script = await callGenerateEdgeFunction(payload);
        if (script && (script.part1 || script.part2)) {
            generatedScript = script;
            showPreviewState(script);
        } else {
            showError(errorDiv, 'Empty script returned. Please try again.');
            showEmptyState();
        }
    } catch (error) {
        console.error('Generation error:', error);
        const msg = error.message || 'Could not generate script. Please try again.';
        showError(errorDiv, `${msg} — Tip: click "✍️ Write Your Own" below to copy our AI prompt or write directly for the teleprompter.`);
        errorDiv?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        showEmptyState();
    } finally {
        setButtonLoading(generateBtn, false);
    }
}

// ============================================
// EDGE FUNCTION API (WITH TIMEOUT)
// ============================================

async function callGenerateEdgeFunction(payload) {
    const supabase = getSupabase();

    const invokePromise = supabase.functions.invoke('generate-script', { body: payload });
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Generation timed out after 32 seconds. Please retry.')), EDGE_TIMEOUT_MS)
    );

    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

    if (error) {
        let errorMessage = 'Script generator proxy returned an error';
        if (error.context && typeof error.context.json === 'function') {
            try {
                const errBody = await error.context.json();
                errorMessage = errBody?.error || errorMessage;
            } catch (_) { /* ignore */ }
        } else if (error.message) {
            errorMessage = error.message;
        }
        throw new Error(errorMessage);
    }

    if (data?.error) {
        throw new Error(data.error);
    }

    return data;
}

// ============================================
// PREVIEW STATES, MARKDOWN PREVIEW & HOOKS
// ============================================

function showLoadingState(titleText = 'Generating your script...', subtitleText = 'This may take 5–15 seconds') {
    document.getElementById('loading-title').textContent = titleText;
    document.getElementById('loading-subtitle').textContent = subtitleText;
    document.getElementById('preview-empty').classList.add('hidden');
    document.getElementById('preview-loading').classList.remove('hidden');
    document.getElementById('preview-content').classList.add('hidden');
    document.getElementById('preview-actions').classList.add('hidden');
    document.getElementById('custom-editor').classList.add('hidden');
}

function showEmptyState() {
    document.getElementById('preview-empty').classList.remove('hidden');
    document.getElementById('preview-loading').classList.add('hidden');
    document.getElementById('preview-content').classList.add('hidden');
    document.getElementById('preview-actions').classList.add('hidden');
    document.getElementById('custom-editor').classList.add('hidden');
}

function showPreviewState(script) {
    document.getElementById('preview-empty').classList.add('hidden');
    document.getElementById('preview-loading').classList.add('hidden');
    document.getElementById('preview-content').classList.remove('hidden');
    document.getElementById('preview-actions').classList.remove('hidden');
    document.getElementById('custom-editor').classList.add('hidden');

    document.getElementById('script-title').value = script.title || '';
    document.getElementById('script-part1').value = script.part1 || '';
    document.getElementById('script-part2').value = script.part2 || '';
    document.getElementById('script-part3').value = script.part3 || '';

    renderHookAlternatives(script.hookAlternatives || [], script.part1 || '');
    renderWarnings(script.meta?.warnings || []);

    autoResizeAllPartTextareas();
    applyFormattedViewState();
    updateScriptStats();
}

function renderWarnings(warnings) {
    const box = document.getElementById('script-warnings');
    if (!box) return;
    if (!Array.isArray(warnings) || warnings.length === 0) {
        box.classList.add('hidden');
        box.textContent = '';
        return;
    }
    box.textContent = warnings.join(' ');
    box.classList.remove('hidden');
}

function renderHookAlternatives(hooks, activeHook) {
    const bar = document.getElementById('hook-alternatives-bar');
    const chipsContainer = document.getElementById('hook-alt-chips');
    if (!bar || !chipsContainer) return;

    const cleanHooks = Array.isArray(hooks) ? hooks.filter(h => h && h.trim()) : [];
    if (cleanHooks.length <= 1) {
        bar.classList.add('hidden');
        chipsContainer.innerHTML = '';
        return;
    }

    chipsContainer.innerHTML = '';
    cleanHooks.forEach((hookText, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hook-alt-chip' + (hookText.trim() === activeHook.trim() ? ' active' : '');
        const previewSnippet = hookText.replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 48);
        btn.textContent = `Hook ${idx + 1}: ${previewSnippet}${hookText.length > 48 ? '...' : ''}`;
        btn.title = hookText;

        btn.addEventListener('click', () => {
            document.getElementById('script-part1').value = hookText;
            chipsContainer.querySelectorAll('.hook-alt-chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            updateSavedBadge(false);
            autoResizeTextarea(document.getElementById('script-part1'));
            if (isFormattedPreview) renderFormattedBoxes();
            updateScriptStats();
        });

        chipsContainer.appendChild(btn);
    });

    bar.classList.remove('hidden');
}

function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 84) + 'px';
}

function autoResizeAllPartTextareas() {
    ['script-part1', 'script-part2', 'script-part3'].forEach(id => {
        autoResizeTextarea(document.getElementById(id));
    });
}

function safeRenderMarkdownToHtml(text) {
    if (!text) return '';
    // Escape raw HTML tags first so arbitrary edits can never inject unsafe markup
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
        return marked.parse(escaped);
    }

    return escaped
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
}

function renderFormattedBoxes() {
    ['script-part1', 'script-part2', 'script-part3'].forEach(id => {
        const ta = document.getElementById(id);
        const box = document.getElementById(`${id}-formatted`);
        if (ta && box) {
            box.innerHTML = safeRenderMarkdownToHtml(ta.value);
        }
    });
}

function applyFormattedViewState() {
    const btn = document.getElementById('toggle-render-btn');
    ['script-part1', 'script-part2', 'script-part3'].forEach(id => {
        const ta = document.getElementById(id);
        const box = document.getElementById(`${id}-formatted`);
        if (!ta || !box) return;

        if (isFormattedPreview) {
            box.innerHTML = safeRenderMarkdownToHtml(ta.value);
            ta.classList.add('hidden');
            box.classList.remove('hidden');
        } else {
            ta.classList.remove('hidden');
            box.classList.add('hidden');
            autoResizeTextarea(ta);
        }
    });

    if (btn) {
        btn.textContent = isFormattedPreview ? '✏️ Edit Text' : '👁️ Preview';
    }
}

function formatSpeakingTime(words) {
    if (!words || words <= 0) return '~0s speaking';
    const totalSec = Math.max(5, Math.round((words / SPEAKING_WPM) * 60));
    if (totalSec < 60) return `~${totalSec}s speaking`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return secs > 0 ? `~${mins}m ${secs}s speaking` : `~${mins}m speaking`;
}

function countWords(str) {
    const trimmed = (str || '').trim();
    return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

function updateScriptStats() {
    const p1 = document.getElementById('script-part1').value;
    const p2 = document.getElementById('script-part2').value;
    const p3 = document.getElementById('script-part3').value;

    const w1 = countWords(p1);
    const w2 = countWords(p2);
    const w3 = countWords(p3);
    const total = w1 + w2 + w3;

    document.getElementById('part1-words').textContent = `${w1}w`;
    document.getElementById('part2-words').textContent = `${w2}w`;
    document.getElementById('part3-words').textContent = `${w3}w`;

    document.getElementById('word-count').textContent = `${total} words`;
    document.getElementById('read-time').textContent = formatSpeakingTime(total);
}

// ============================================
// PREVIEW ACTIONS & AI REFINEMENT
// ============================================

function setupPreviewActions() {
    document.getElementById('toggle-render-btn')?.addEventListener('click', () => {
        isFormattedPreview = !isFormattedPreview;
        applyFormattedViewState();
    });

    document.getElementById('copy-btn')?.addEventListener('click', () => {
        const title = document.getElementById('script-title').value.trim();
        const p1 = document.getElementById('script-part1').value.trim();
        const p2 = document.getElementById('script-part2').value.trim();
        const p3 = document.getElementById('script-part3').value.trim();
        const fullScript = [title, p1, p2, p3].filter(Boolean).join('\n\n');

        navigator.clipboard.writeText(fullScript).then(() => {
            showToast('Script copied to clipboard!');
        }).catch(() => {
            showToast('Failed to copy', 'error');
        });
    });

    document.getElementById('save-btn')?.addEventListener('click', () => saveScript(false));
    document.getElementById('save-teleprompter-btn')?.addEventListener('click', () => saveScript(true));

    ['script-title', 'script-part1', 'script-part2', 'script-part3'].forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', () => {
            if (el.tagName === 'TEXTAREA') autoResizeTextarea(el);
            updateScriptStats();
            if (savedScriptId) {
                updateSavedBadge(false);
            }
        });
    });
}

function setupRefineActions() {
    const refineChips = document.querySelectorAll('.refine-chip');
    refineChips.forEach(chip => {
        chip.addEventListener('click', async () => {
            const actionKey = chip.dataset.refine;
            if (!actionKey) return;

            if (actionKey === 'regenerate') {
                await generateScript();
                return;
            }

            await refineCurrentScript(actionKey);
        });
    });
}

async function refineCurrentScript(refineInstruction) {
    const refineChips = document.querySelectorAll('.refine-chip');
    const errorDiv = document.getElementById('generator-error');
    const base = lastGenerationPayload || buildGenerationPayload();

    const payload = {
        ...base,
        action: 'refine',
        refineInstruction,
        existingScript: {
            title: document.getElementById('script-title').value.trim(),
            part1: document.getElementById('script-part1').value.trim(),
            part2: document.getElementById('script-part2').value.trim(),
            part3: document.getElementById('script-part3').value.trim(),
        },
    };

    refineChips.forEach(c => { c.disabled = true; });
    hideError(errorDiv);
    showLoadingState('Polishing your script...', 'Refining rhythm, hook tension, and clarity (~5–12s)');

    try {
        const refined = await callGenerateEdgeFunction(payload);
        if (refined && (refined.part1 || refined.part2)) {
            generatedScript = refined;
            savedScriptId = null;
            updateSavedBadge(false);
            showPreviewState(refined);
            showToast('Script refined!');
        } else {
            showPreviewState(generatedScript);
            showToast('Could not refine script right now', 'error');
        }
    } catch (error) {
        console.error('Refine error:', error);
        if (generatedScript) showPreviewState(generatedScript);
        showToast(error.message || 'Refinement failed', 'error');
    } finally {
        refineChips.forEach(c => { c.disabled = false; });
    }
}

function updateSavedBadge(isSaved) {
    const badge = document.getElementById('saved-status-badge');
    if (!badge) return;
    badge.classList.toggle('hidden', !isSaved);
}

async function saveScript(openTeleprompterAfter = false) {
    const targetBtn = document.getElementById(openTeleprompterAfter ? 'save-teleprompter-btn' : 'save-btn');
    const ctx = lastGenerationPayload || buildGenerationPayload();

    const scriptData = {
        title: document.getElementById('script-title').value.trim() || 'Untitled Script',
        part1: document.getElementById('script-part1').value.trim(),
        part2: document.getElementById('script-part2').value.trim(),
        part3: document.getElementById('script-part3').value.trim(),
        prompt_template: ctx.template || 'custom',
        questionnaire: {
            topic: ctx.topic,
            audience: ctx.audience,
            message: ctx.coreMessage,
            tone: ctx.tone,
            length: ctx.length,
            platform: ctx.platform,
            language: ctx.languageCode,
            ctaStyle: ctx.ctaStyle,
        },
    };

    if (!scriptData.part1 && !scriptData.part2 && !scriptData.part3) {
        showToast('Cannot save an empty script', 'error');
        return;
    }

    setButtonLoading(targetBtn, true);

    try {
        const result = savedScriptId
            ? await scriptsService.updateScript(savedScriptId, scriptData)
            : await scriptsService.createScript(currentUser.id, scriptData);

        if (result.success && result.script) {
            savedScriptId = result.script.id;
            updateSavedBadge(true);

            if (openTeleprompterAfter) {
                window.location.href = `teleprompter.html?id=${encodeURIComponent(result.script.id)}`;
                return;
            }
            showToast('Script saved to My Scripts!');
        } else {
            showToast(result.error || 'Failed to save script', 'error');
        }
    } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save script', 'error');
    } finally {
        setButtonLoading(targetBtn, false);
    }
}

// ============================================
// WRITE YOUR OWN SCRIPT (Custom Mode)
// ============================================

function setupWriteYourOwn() {
    document.getElementById('write-own-btn')?.addEventListener('click', enterCustomMode);
}

function enterCustomMode() {
    isCustomMode = true;

    document.getElementById('generator-form')?.classList.add('hidden');
    const formPanel = document.querySelector('.generator-form-panel');
    let backLink = document.getElementById('back-to-ai-link');
    let sampleSection = document.getElementById('sample-prompt-section');

    if (!backLink) {
        backLink = document.createElement('button');
        backLink.id = 'back-to-ai-link';
        backLink.type = 'button';
        backLink.className = 'btn btn-ghost';
        backLink.textContent = '← Back to AI Generator';
        backLink.style.marginBottom = '16px';
        backLink.addEventListener('click', exitCustomMode);
        formPanel.prepend(backLink);
    }
    backLink.classList.remove('hidden');

    if (!sampleSection) {
        sampleSection = document.createElement('div');
        sampleSection.id = 'sample-prompt-section';
        sampleSection.className = 'sample-prompt-section';
        sampleSection.innerHTML = `
            <h3>📎 AI Prompt for External Tools</h3>
            <p class="prompt-desc">Copy this teleprompter-tuned prompt to use with ChatGPT, Claude, or Gemini:</p>
            <div class="prompt-box">
                <pre id="sample-prompt-text"></pre>
                <button type="button" id="copy-prompt-btn" class="btn btn-ghost btn-sm">📋 Copy Prompt</button>
            </div>
        `;
        formPanel.appendChild(sampleSection);
        sampleSection.querySelector('#sample-prompt-text').textContent = SAMPLE_AI_PROMPT;

        document.getElementById('copy-prompt-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(SAMPLE_AI_PROMPT).then(() => {
                showToast('Prompt copied!');
            }).catch(() => {
                showToast('Failed to copy', 'error');
            });
        });
    }
    sampleSection.classList.remove('hidden');

    const panelHeader = formPanel.querySelector('.panel-header');
    if (panelHeader) {
        panelHeader.querySelector('h2').textContent = '✍️ Write Your Own Script';
        panelHeader.querySelector('p').textContent = 'Write your script directly, or copy our teleprompter prompt below.';
    }

    document.getElementById('preview-empty').classList.add('hidden');
    document.getElementById('preview-loading').classList.add('hidden');
    document.getElementById('preview-content').classList.add('hidden');
    document.getElementById('preview-actions').classList.add('hidden');
    document.getElementById('custom-editor').classList.remove('hidden');

    document.getElementById('custom-title').value = '';
    document.getElementById('custom-body').value = '';
    updateCustomStats();
    document.getElementById('custom-title').focus();
}

function exitCustomMode() {
    isCustomMode = false;

    document.getElementById('generator-form')?.classList.remove('hidden');
    document.getElementById('back-to-ai-link')?.classList.add('hidden');
    document.getElementById('sample-prompt-section')?.classList.add('hidden');

    const formPanel = document.querySelector('.generator-form-panel');
    const panelHeader = formPanel.querySelector('.panel-header');
    if (panelHeader) {
        panelHeader.querySelector('h2').textContent = '🤖 AI Script Generator';
        panelHeader.querySelector('p').textContent = 'Generate camera-ready spoken scripts tuned for your teleprompter';
    }

    document.getElementById('custom-editor').classList.add('hidden');
    if (generatedScript) {
        showPreviewState(generatedScript);
    } else {
        showEmptyState();
    }
}

function setupCustomEditor() {
    const copyBtn = document.getElementById('copy-custom-btn');
    const saveBtn = document.getElementById('save-custom-btn');
    const bodyTextarea = document.getElementById('custom-body');

    copyBtn?.addEventListener('click', () => {
        const title = document.getElementById('custom-title').value.trim();
        const body = document.getElementById('custom-body').value.trim();
        if (!title && !body) {
            showToast('Nothing to copy', 'error');
            return;
        }
        const fullScript = title ? `${title}\n\n${body}` : body;
        navigator.clipboard.writeText(fullScript).then(() => {
            showToast('Script copied to clipboard!');
        }).catch(() => {
            showToast('Failed to copy', 'error');
        });
    });

    saveBtn?.addEventListener('click', saveCustomScript);
    bodyTextarea?.addEventListener('input', updateCustomStats);
}

function updateCustomStats() {
    const body = document.getElementById('custom-body').value;
    const words = countWords(body);
    const statsEl = document.getElementById('custom-stats');
    if (statsEl) {
        statsEl.textContent = `${words} words · ${formatSpeakingTime(words)}`;
    }
}

async function saveCustomScript() {
    const saveBtn = document.getElementById('save-custom-btn');
    const title = document.getElementById('custom-title').value.trim() || 'Untitled Script';
    const body = document.getElementById('custom-body').value.trim();

    if (!body) {
        showToast('Cannot save empty script', 'error');
        return;
    }

    const scriptData = {
        title,
        part1: body,
        part2: '',
        part3: '',
        prompt_template: 'custom',
    };

    setButtonLoading(saveBtn, true);

    try {
        const result = await scriptsService.createScript(currentUser.id, scriptData);
        if (result.success) {
            showToast('Script saved successfully! View it in My Scripts.');
            setTimeout(() => exitCustomMode(), 1500);
        } else {
            showToast('Failed to save script', 'error');
        }
    } catch (error) {
        console.error('Save error:', error);
        showToast('An error occurred', 'error');
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

// ============================================
// HELPERS
// ============================================

function showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.remove('hidden');
}

function hideError(element) {
    if (!element) return;
    element.classList.add('hidden');
}

function setButtonLoading(button, loading) {
    if (!button) return;
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

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = type === 'success' ? '✅' : '❌';

    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = String(message || '');

    toast.appendChild(icon);
    toast.appendChild(msg);

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

const toastStyles = document.createElement('style');
toastStyles.textContent = `
    .toast-notification {
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        background: var(--bg-input);
        border: 1px solid var(--border-pill);
        border-radius: var(--radius-lg);
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
