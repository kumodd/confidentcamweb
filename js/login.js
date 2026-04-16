// ============================================
// LOGIN PAGE CONTROLLER
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing login page...');

    // Initialize services
    initSupabase();
    authService.init();
    qrAuthService.init();

    // Apply login method configuration
    applyLoginConfig();

    // Check if already authenticated
    const redirected = await authService.redirectIfAuthenticated();
    if (redirected) return;

    // Setup event listeners
    setupTabs();
    setupLoginForm();
    setupForgotPassword();
    setupQRLogin();
});

// ============================================
// LOGIN CONFIGURATION
// ============================================

function applyLoginConfig() {
    const enableQR = APP_CONFIG.enableQRLogin ?? true;
    const enableEmail = APP_CONFIG.enableEmailLogin ?? true;

    // Hide QR tab and content if disabled
    if (!enableQR) {
        const qrTab = document.querySelector('[data-tab="qr"]');
        const qrContent = document.getElementById('qr-tab');
        if (qrTab) qrTab.style.display = 'none';
        if (qrContent) qrContent.style.display = 'none';
    }

    // Hide Email tab and content if disabled
    if (!enableEmail) {
        const emailTab = document.querySelector('[data-tab="email"]');
        const emailContent = document.getElementById('email-tab');
        if (emailTab) emailTab.style.display = 'none';
        if (emailContent) emailContent.style.display = 'none';
    }

    // Auto-select the first visible tab
    const visibleTabs = document.querySelectorAll('.login-tab:not([style*="display: none"])');
    const tabContents = document.querySelectorAll('.tab-content');

    if (visibleTabs.length > 0) {
        // Remove all active states
        document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Activate first visible tab
        const firstTab = visibleTabs[0];
        firstTab.classList.add('active');
        const targetId = `${firstTab.dataset.tab}-tab`;
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.classList.add('active');

        // If QR tab is first and visible, init QR
        if (firstTab.dataset.tab === 'qr' && enableQR) {
            initQRCode();
        }
    }

    // If neither login method is enabled, show a message
    if (!enableQR && !enableEmail) {
        const loginCard = document.querySelector('.login-card');
        if (loginCard) {
            loginCard.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <h2>Login Disabled</h2>
                    <p style="color: var(--text-muted);">Login has been temporarily disabled. Please contact the administrator.</p>
                </div>
            `;
        }
    }
}

// ============================================
// TAB SWITCHING
// ============================================

function setupTabs() {
    const tabs = document.querySelectorAll('.login-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${targetTab}-tab`) {
                    content.classList.add('active');
                }
            });

            // Handle QR tab activation
            if (targetTab === 'qr') {
                initQRCode();
            } else {
                qrAuthService.stopPolling();
            }
        });
    });
}

// ============================================
// EMAIL LOGIN
// ============================================

function setupLoginForm() {
    const form = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-btn');
    const errorDiv = document.getElementById('login-error');
    const successDiv = document.getElementById('login-success');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        // Validate
        if (!email || !password) {
            showError(errorDiv, 'Please fill in all fields');
            return;
        }

        // Show loading
        setButtonLoading(loginBtn, true);
        hideMessage(errorDiv);
        hideMessage(successDiv);

        try {
            const result = await authService.signInWithEmail(email, password);

            if (result.success) {
                showSuccess(successDiv, 'Login successful! Redirecting...');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1000);
            } else {
                showError(errorDiv, result.error || 'Login failed. Please try again.');
            }
        } catch (error) {
            showError(errorDiv, 'An unexpected error occurred. Please try again.');
            console.error('Login error:', error);
        } finally {
            setButtonLoading(loginBtn, false);
        }
    });
}

// ============================================
// FORGOT PASSWORD
// ============================================

function setupForgotPassword() {
    const modal = document.getElementById('forgot-modal');
    const openBtn = document.getElementById('forgot-password-link');
    const closeBtn = document.getElementById('close-forgot-modal');
    const cancelBtn = document.getElementById('cancel-forgot');
    const form = document.getElementById('forgot-form');
    const sendBtn = document.getElementById('send-reset-btn');
    const errorDiv = document.getElementById('forgot-error');
    const successDiv = document.getElementById('forgot-success');

    // Open modal
    openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.add('active');
    });

    // Close modal
    const closeModal = () => {
        modal.classList.remove('active');
        form.reset();
        hideMessage(errorDiv);
        hideMessage(successDiv);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Submit form
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('forgot-email').value.trim();

        if (!email) {
            showError(errorDiv, 'Please enter your email address');
            return;
        }

        setButtonLoading(sendBtn, true);
        hideMessage(errorDiv);

        try {
            const result = await authService.resetPassword(email);

            if (result.success) {
                showSuccess(successDiv, 'Password reset link sent! Check your email.');
                sendBtn.disabled = true;
                sendBtn.textContent = 'Email Sent';
            } else {
                showError(errorDiv, result.error || 'Failed to send reset email.');
            }
        } catch (error) {
            showError(errorDiv, 'An unexpected error occurred.');
            console.error('Reset password error:', error);
        } finally {
            setButtonLoading(sendBtn, false);
        }
    });
}

// ============================================
// QR LOGIN
// ============================================

function setupQRLogin() {
    const refreshBtn = document.getElementById('refresh-qr');

    refreshBtn.addEventListener('click', () => {
        initQRCode();
    });

    // Set up callbacks
    qrAuthService.onAuthenticated = (userId) => {
        console.log('✅ QR authentication successful!');
        document.getElementById('qr-status-waiting').classList.add('hidden');
        document.getElementById('qr-status-scanned').classList.remove('hidden');

        // Redirect after short delay
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
    };

    qrAuthService.onExpired = () => {
        console.log('⏰ QR session expired');
        document.getElementById('qr-canvas').classList.add('hidden');
        document.getElementById('qr-loading').classList.add('hidden');
        document.getElementById('qr-expired').classList.remove('hidden');
    };
}

async function initQRCode() {
    const loadingDiv = document.getElementById('qr-loading');
    const canvas = document.getElementById('qr-canvas');
    const expiredDiv = document.getElementById('qr-expired');
    const waitingStatus = document.getElementById('qr-status-waiting');
    const scannedStatus = document.getElementById('qr-status-scanned');

    // Reset UI
    loadingDiv.classList.remove('hidden');
    loadingDiv.innerHTML = `
        <div class="loading-spinner loading-spinner-lg"></div>
        <p>Generating QR code...</p>
    `;
    canvas.classList.add('hidden');
    canvas.innerHTML = ''; // Clear previous QR code
    expiredDiv.classList.add('hidden');
    waitingStatus.classList.remove('hidden');
    scannedStatus.classList.add('hidden');

    // Cleanup previous session
    await qrAuthService.cleanup();

    // Create new session
    const result = await qrAuthService.createSession();

    if (!result.success) {
        console.error('Failed to create QR session:', result.error);

        // Check if it's a table not found error
        let errorMessage = 'Failed to generate QR code';
        if (result.error && result.error.includes('relation') && result.error.includes('does not exist')) {
            errorMessage = `
                <p style="color: #EF4444; margin-bottom: 8px;">⚠️ Database Setup Required</p>
                <p style="color: #9CA3AF; font-size: 12px;">
                    Run <code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">web_sessions_setup.sql</code> in Supabase SQL Editor
                </p>
            `;
        } else {
            errorMessage = `<p style="color: #EF4444;">${result.error || 'Failed to generate QR code'}</p>`;
        }

        loadingDiv.innerHTML = errorMessage;
        return;
    }

    // Generate QR code
    const qrData = qrAuthService.getQRData();

    try {
        // Check if QRCode library is loaded (qrcodejs library)
        if (typeof QRCode === 'undefined') {
            throw new Error('QR code library not loaded. Please refresh the page.');
        }

        // Clear the container and create QR code using qrcodejs
        canvas.innerHTML = '';
        new QRCode(canvas, {
            text: qrData,
            width: 200,
            height: 200,
            colorDark: '#0F0F1A',
            colorLight: '#FFFFFF',
            correctLevel: QRCode.CorrectLevel.M
        });

        loadingDiv.classList.add('hidden');
        canvas.classList.remove('hidden');

        // Start polling for authentication
        qrAuthService.startPolling();

    } catch (error) {
        console.error('Failed to generate QR code:', error);
        loadingDiv.innerHTML = `<p style="color: #EF4444;">Failed to generate QR code: ${error.message}</p>`;
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
}

function showSuccess(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
}

function hideMessage(element) {
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
