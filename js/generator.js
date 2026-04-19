// ============================================
// AI GENERATOR PAGE CONTROLLER
// ============================================

let currentUser = null;
let generatedScript = null;
let languageOptions = [];
let isCustomMode = false;

// Sample prompt for external AI tools
const SAMPLE_AI_PROMPT = `You are an expert video scriptwriter creating content for social media.

Write a short video script about: [YOUR TOPIC HERE]

TARGET AUDIENCE: [e.g., young professionals, students, parents]

RULES:
1. Write ONLY the words to be spoken aloud — no stage directions
2. Use SHORT, punchy sentences — this is spoken word, not an essay
3. Start with a strong HOOK that grabs attention
4. Be conversational — use contractions, questions, direct address ("you")
5. End with a clear call-to-action
6. Keep it between 150–250 words

OUTPUT: Return the script as plain text with a title on the first line.`;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing AI Generator...');

    // Initialize services
    initSupabase();
    authService.init();
    scriptsService.init();

    // Check authentication
    const authenticated = await authService.requireAuth();
    if (!authenticated) return;

    // Get current user from authService
    currentUser = authService.currentUser;
    if (!currentUser) {
        console.error('No user found after auth check');
        return;
    }

    console.log('✅ Generator loaded for user:', currentUser.id);

    // Load language options
    await loadLanguageOptions();

    // Setup UI
    setupUserInfo();
    setupLogout();
    setupTemplateSelection();
    setupToneSelection();
    setupLengthSelection();
    setupGeneratorForm();
    setupPreviewActions();
    setupWriteYourOwn();
    setupCustomEditor();
    setupHowToUse();
});

// ============================================
// UI SETUP
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
        // Hide button if no URL configured
        btn.style.display = 'none';
    }
}

// ============================================
// LANGUAGE OPTIONS
// ============================================

async function loadLanguageOptions() {
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('language_options')
            .select('*')
            .eq('is_active', true)
            .order('order_index', { ascending: true });

        if (error) throw error;

        languageOptions = data || [];

        // Populate the language dropdown
        const languageSelect = document.getElementById('language');
        if (languageSelect && languageOptions.length > 0) {
            languageSelect.innerHTML = languageOptions.map(lang =>
                `<option value="${lang.language_code}">${lang.native_name} - ${lang.language_name}</option>`
            ).join('');
        }

        console.log('✅ Loaded', languageOptions.length, 'language options');
    } catch (error) {
        console.error('Failed to load language options:', error);
        // Keep default English option
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

            // Show/hide custom prompt
            if (option.dataset.template === 'custom') {
                customPromptGroup.classList.remove('hidden');
            } else {
                customPromptGroup.classList.add('hidden');
            }
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
// GENERATOR FORM
// ============================================

function setupGeneratorForm() {
    const form = document.getElementById('generator-form');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await generateScript();
    });
}

async function generateScript() {
    const generateBtn = document.getElementById('generate-btn');
    const errorDiv = document.getElementById('generator-error');

    // Get form values
    const template = document.querySelector('input[name="template"]:checked').value;
    const topic = document.getElementById('topic').value.trim();
    const audience = document.getElementById('audience').value.trim();
    const language = document.getElementById('language').value;
    const tone = document.querySelector('input[name="tone"]:checked').value;
    const length = document.querySelector('input[name="length"]:checked').value;
    const customPrompt = document.getElementById('custom-prompt')?.value.trim();
    const markdownMode = document.getElementById('markdown-mode')?.checked ?? true;

    // Validate
    if (!topic) {
        showError(errorDiv, 'Please enter a topic');
        return;
    }

    // Show loading state
    setButtonLoading(generateBtn, true);
    hideError(errorDiv);
    showLoadingState();

    try {
        // Resolve language details to pass to Edge Function
        const langInfo = languageOptions.find(l => l.language_code === language) || { language_name: 'English' };
        const languageText = langInfo.is_bilingual
            ? `Write in ${langInfo.language_name} (${langInfo.native_name}) - a mix of ${langInfo.primary_language} and ${langInfo.secondary_language}. Make it sound natural.`
            : `Write the script in ${langInfo.language_name} (${langInfo.native_name || 'English'}).`;

        const scriptData = {
            template, topic, audience, tone, length, customPrompt,
            languageText, markdownMode
        };

        const script = await callGenerateEdgeFunction(scriptData);

        if (script) {
            generatedScript = script;
            showPreviewState(script);
        } else {
            showError(errorDiv, 'Failed to generate script. Please try again.');
            showEmptyState();
        }
    } catch (error) {
        console.error('Generation error:', error);
        showError(errorDiv, error.message || 'An unexpected error occurred');
        showEmptyState();
    } finally {
        setButtonLoading(generateBtn, false);
    }
}

// ============================================
// EDGE FUNCTION API
// ============================================

async function callGenerateEdgeFunction(payload) {
    console.log('🤖 Calling Secure Edge Function Proxy...');

    const supabase = getSupabase();
    
    // Invoke the secure edge function
    const { data, error } = await supabase.functions.invoke('generate-script', {
        body: payload
    });

    if (error) {
        console.error('generate-script error:', error);
        throw new Error(error.message || 'Server proxy failed to handle OpenAI request');
    }

    if (data.error) {
        console.error('generate-script returned error payload:', data.error);
        throw new Error(data.error);
    }

    return data;
}

// ============================================
// PREVIEW STATES
// ============================================

function showLoadingState() {
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

    // Populate content
    document.getElementById('script-title').value = script.title || '';
    document.getElementById('script-part1').textContent = script.part1 || '';
    document.getElementById('script-part2').textContent = script.part2 || '';
    document.getElementById('script-part3').textContent = script.part3 || '';

    // Update stats
    updateScriptStats();
}

function updateScriptStats() {
    const part1 = document.getElementById('script-part1').textContent;
    const part2 = document.getElementById('script-part2').textContent;
    const part3 = document.getElementById('script-part3').textContent;

    const fullText = `${part1} ${part2} ${part3}`;
    const words = fullText.trim().split(/\s+/).filter(w => w.length > 0).length;
    const readTime = Math.ceil(words / 150); // ~150 words per minute speaking

    document.getElementById('word-count').textContent = `${words} words`;
    document.getElementById('read-time').textContent = `~${readTime} min read`;
}

// ============================================
// PREVIEW ACTIONS (for AI-generated scripts)
// ============================================

function setupPreviewActions() {
    // Copy button — copies title + all 3 parts as one block
    document.getElementById('copy-btn').addEventListener('click', () => {
        const title = document.getElementById('script-title').value;
        const part1 = document.getElementById('script-part1').textContent;
        const part2 = document.getElementById('script-part2').textContent;
        const part3 = document.getElementById('script-part3').textContent;

        const fullScript = `${title}\n\n${part1}\n\n${part2}\n\n${part3}`;

        navigator.clipboard.writeText(fullScript).then(() => {
            showToast('Script copied to clipboard!');
        }).catch(() => {
            showToast('Failed to copy', 'error');
        });
    });

    // Save button
    document.getElementById('save-btn').addEventListener('click', saveScript);

    // Update stats on content edit
    ['script-part1', 'script-part2', 'script-part3'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateScriptStats);
    });
}

async function saveScript() {
    const saveBtn = document.getElementById('save-btn');

    const scriptData = {
        title: document.getElementById('script-title').value.trim() || 'Untitled Script',
        part1: document.getElementById('script-part1').textContent.trim(),
        part2: document.getElementById('script-part2').textContent.trim(),
        part3: document.getElementById('script-part3').textContent.trim(),
        prompt_template: document.querySelector('input[name="template"]:checked')?.value || 'custom'
    };

    if (!scriptData.part1 && !scriptData.part2 && !scriptData.part3) {
        showToast('Cannot save empty script', 'error');
        return;
    }

    setButtonLoading(saveBtn, true);

    try {
        const result = await scriptsService.createScript(currentUser.id, scriptData);

        if (result.success) {
            showToast('Script saved successfully! View it in My Scripts.');
            // Reset to empty state after successful save
            setTimeout(() => {
                showEmptyState();
            }, 2000);
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
// WRITE YOUR OWN SCRIPT (Custom Mode)
// ============================================

function setupWriteYourOwn() {
    const writeOwnBtn = document.getElementById('write-own-btn');
    if (!writeOwnBtn) return;

    writeOwnBtn.addEventListener('click', () => {
        enterCustomMode();
    });
}

function enterCustomMode() {
    isCustomMode = true;

    // Hide the entire AI generator form
    const generatorForm = document.getElementById('generator-form');
    if (generatorForm) generatorForm.classList.add('hidden');

    // Show "Back to AI Generator" link + sample prompt in left panel
    const formPanel = document.querySelector('.generator-form-panel');
    let backLink = document.getElementById('back-to-ai-link');
    let sampleSection = document.getElementById('sample-prompt-section');

    if (!backLink) {
        backLink = document.createElement('button');
        backLink.id = 'back-to-ai-link';
        backLink.className = 'btn btn-ghost';
        backLink.innerHTML = '← Back to AI Generator';
        backLink.style.marginBottom = '16px';
        backLink.addEventListener('click', exitCustomMode);
        formPanel.prepend(backLink);
    }
    backLink.classList.remove('hidden');

    // Create sample prompt section if not exists
    if (!sampleSection) {
        sampleSection = document.createElement('div');
        sampleSection.id = 'sample-prompt-section';
        sampleSection.className = 'sample-prompt-section';
        sampleSection.innerHTML = `
            <h3>📎 AI Prompt for External Tools</h3>
            <p class="prompt-desc">Copy this prompt to use with ChatGPT, Claude, or Gemini to generate your own script:</p>
            <div class="prompt-box">
                <pre id="sample-prompt-text">${SAMPLE_AI_PROMPT}</pre>
                <button id="copy-prompt-btn" class="btn btn-ghost btn-sm">📋 Copy Prompt</button>
            </div>
        `;
        formPanel.appendChild(sampleSection);

        // Wire copy button
        document.getElementById('copy-prompt-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(SAMPLE_AI_PROMPT).then(() => {
                showToast('Prompt copied! Paste it into ChatGPT or any AI tool.');
            }).catch(() => {
                showToast('Failed to copy', 'error');
            });
        });
    }
    sampleSection.classList.remove('hidden');

    // Update left panel header
    const panelHeader = formPanel.querySelector('.panel-header');
    if (panelHeader) {
        panelHeader.querySelector('h2').textContent = '✍️ Write Your Own Script';
        panelHeader.querySelector('p').textContent = 'Write your script directly, or use the AI prompt below with external tools.';
    }

    // Show unified custom editor in right panel, hide everything else
    document.getElementById('preview-empty').classList.add('hidden');
    document.getElementById('preview-loading').classList.add('hidden');
    document.getElementById('preview-content').classList.add('hidden');
    document.getElementById('preview-actions').classList.add('hidden');
    document.getElementById('custom-editor').classList.remove('hidden');

    // Clear custom editor
    document.getElementById('custom-title').value = '';
    document.getElementById('custom-body').value = '';
    updateCustomStats();

    // Focus on title
    document.getElementById('custom-title').focus();

    showToast('Start writing your script!');
}

function exitCustomMode() {
    isCustomMode = false;

    // Restore AI generator form
    const generatorForm = document.getElementById('generator-form');
    if (generatorForm) generatorForm.classList.remove('hidden');

    // Hide back link and sample prompt
    const backLink = document.getElementById('back-to-ai-link');
    if (backLink) backLink.classList.add('hidden');

    const sampleSection = document.getElementById('sample-prompt-section');
    if (sampleSection) sampleSection.classList.add('hidden');

    // Restore left panel header
    const formPanel = document.querySelector('.generator-form-panel');
    const panelHeader = formPanel.querySelector('.panel-header');
    if (panelHeader) {
        panelHeader.querySelector('h2').textContent = '🤖 AI Script Generator';
        panelHeader.querySelector('p').textContent = 'Create compelling video scripts with AI assistance';
    }

    // Hide custom editor, show empty state
    document.getElementById('custom-editor').classList.add('hidden');
    showEmptyState();
}

// ============================================
// CUSTOM EDITOR ACTIONS
// ============================================

function setupCustomEditor() {
    const copyBtn = document.getElementById('copy-custom-btn');
    const saveBtn = document.getElementById('save-custom-btn');
    const bodyTextarea = document.getElementById('custom-body');

    if (!copyBtn || !saveBtn) return;

    // Copy All — includes title + body as one block
    copyBtn.addEventListener('click', () => {
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

    // Save Own Script
    saveBtn.addEventListener('click', saveCustomScript);

    // Update stats on typing
    if (bodyTextarea) {
        bodyTextarea.addEventListener('input', updateCustomStats);
    }
}

function updateCustomStats() {
    const body = document.getElementById('custom-body').value;
    const words = body.trim().split(/\s+/).filter(w => w.length > 0).length;
    const readTime = Math.ceil(words / 150);

    const statsEl = document.getElementById('custom-stats');
    if (statsEl) {
        statsEl.textContent = `${words} words · ~${readTime} min read`;
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

    // Store entire body as part1 (unified — no artificial split)
    const scriptData = {
        title: title,
        part1: body,
        part2: '',
        part3: '',
        prompt_template: 'custom'
    };

    setButtonLoading(saveBtn, true);

    try {
        const result = await scriptsService.createScript(currentUser.id, scriptData);

        if (result.success) {
            showToast('Script saved successfully! View it in My Scripts.');
            setTimeout(() => {
                exitCustomMode();
            }, 2000);
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
