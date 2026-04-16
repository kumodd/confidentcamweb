// ============================================
// AI GENERATOR PAGE CONTROLLER
// ============================================

let currentUser = null;
let generatedScript = null;
let languageOptions = [];

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
}

function showEmptyState() {
    document.getElementById('preview-empty').classList.remove('hidden');
    document.getElementById('preview-loading').classList.add('hidden');
    document.getElementById('preview-content').classList.add('hidden');
    document.getElementById('preview-actions').classList.add('hidden');
}

function showPreviewState(script) {
    document.getElementById('preview-empty').classList.add('hidden');
    document.getElementById('preview-loading').classList.add('hidden');
    document.getElementById('preview-content').classList.remove('hidden');
    document.getElementById('preview-actions').classList.remove('hidden');

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
// PREVIEW ACTIONS
// ============================================

function setupPreviewActions() {
    // Copy button
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
        prompt_template: document.querySelector('input[name="template"]:checked').value
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

// ============================================
// WRITE YOUR OWN SCRIPT
// ============================================

function setupWriteYourOwn() {
    const writeOwnBtn = document.getElementById('write-own-btn');

    if (!writeOwnBtn) return;

    writeOwnBtn.addEventListener('click', () => {
        // Show the preview panel with empty editable content
        document.getElementById('preview-empty').classList.add('hidden');
        document.getElementById('preview-loading').classList.add('hidden');
        document.getElementById('preview-content').classList.remove('hidden');
        document.getElementById('preview-actions').classList.remove('hidden');

        // Clear and focus on title
        document.getElementById('script-title').value = '';
        document.getElementById('script-part1').textContent = '';
        document.getElementById('script-part2').textContent = '';
        document.getElementById('script-part3').textContent = '';

        // Set placeholder text
        document.getElementById('script-title').placeholder = 'Enter your script title...';
        document.getElementById('script-part1').setAttribute('data-placeholder', 'Write your hook here - grab attention immediately...');
        document.getElementById('script-part2').setAttribute('data-placeholder', 'Write the main body of your script here...');
        document.getElementById('script-part3').setAttribute('data-placeholder', 'Write your closing and call-to-action here...');

        // Update stats
        updateScriptStats();

        // Focus on title
        document.getElementById('script-title').focus();

        showToast('Start writing your script!');
    });
}
