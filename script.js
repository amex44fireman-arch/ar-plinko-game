window.onerror = function (msg, url, line, col, error) {
    if (msg.includes('ResizeObserver')) return; // Ignore harmless resize errors
    alert('⚠️ حدث خطأ في النظام:\n\n' + msg + '\n\n' + 'السطر: ' + line);
    console.error('Global Error:', error);
};

const VERSION = '4.0.0 - SECURE EDITION';
console.log(`%c AR GAME v${VERSION} LOADED`, 'background: #000; color: #ffd700; font-size: 20px; font-weight: bold;');

// --- 🚩 SMART API CONFIGURATION 🚩 ---
if (typeof axios !== 'undefined') axios.defaults.timeout = 60000;

// HARDCODED API URL - Users will connect to this automatically
const PRODUCTION_API_URL = 'https://ar-plinko-game-x8pc.onrender.com'; // ⚠️ REPLACE WITH YOUR ACTUAL RENDER URL

// Fallback to Production if localStorage URL fails
const getSavedAPI = () => {
    const saved = localStorage.getItem('ar_api_url');
    // If we have a saved URL, we use it, but we can reset if needed.
    return (saved && saved.startsWith('http')) ? saved : PRODUCTION_API_URL;
};
let API_URL = getSavedAPI();

function configServer() {

    let newUrl = prompt('الرجاء إدخال رابط الـ API (مثال: https://ar-plinko-game-6.onrender.com):', API_URL);
    if (newUrl) {
        newUrl = newUrl.trim().replace(/\/$/, "");
        if (!newUrl.startsWith('http')) {
            alert('❌ يجب أن يبدأ الرابط بـ http:// أو https://');
            return;
        }
        sessionStorage.setItem('configuring', 'true');
        localStorage.setItem('ar_api_url', newUrl);
        alert('✅ تم حفظ الإعدادات. سيتم إعادة تشغيل اللعبة للاتصال بالسيرفر الجديد.');
        location.reload();
    }
}
// ------------------------------------
let logoClicks = 0;
function handleLogoClick() {
    logoClicks++;
    if (logoClicks === 5) {
        logoClicks = 0;
        configServer();
    }
    setTimeout(() => { if (logoClicks > 0) logoClicks--; }, 3000);
}

// Utils moved to top to prevent hoisting errors
const $ = (id) => document.getElementById(id);
const showAuth = (mode) => {
    const l = $('login-form-container');
    const r = $('register-form-container');
    if (l) l.style.display = mode === 'login' ? 'block' : 'none';
    if (r) r.style.display = mode === 'register' ? 'block' : 'none';
};

const CONFIG = {
    COMPANY_ACCOUNTS: {
        'SyriaCash': '67457101',
        'ShamCash': '67457101',
        'Electronic': '67457101'
    },
    MIN_DEP: 2000,
    MAX_DEP: 500000,
    // New Logic: 9 Bins.
    // User Multipliers: 100, 64, 32, 16, 8, 4, 2, 1, 0
    MULTIPLIERS: [100, 64, 32, 16, 8, 4, 2, 1, 0],

    // User Weights: Adjusted logic.
    // *100 (Index 0): 1.5%
    // *64 (Index 1): 2.0%
    // *0 (Index 8): 47.0%
    // Others: Distributed. Total Sum = 1000.
    WEIGHTS: [15, 20, 53, 53, 71, 88, 106, 124, 470]
};

// --- ADMIN CREDENTIALS ---
// Use this to login and check your "House Revenue"
const ADMIN_CREDS = {
    email: 'admin@ar-game.com',
    pass: 'AdminPass2025' // Default password
};

let currentUser = null;
let currentBet = 5000;
let pendingTxn = null;

// --- Network Monitor ---
const NetworkMonitor = {
    init: () => {
        window.addEventListener('online', NetworkMonitor.updateStatus);
        window.addEventListener('offline', NetworkMonitor.updateStatus);
        NetworkMonitor.updateStatus();
    },
    updateStatus: () => {
        const isOnline = navigator.onLine;
        const overlay = document.getElementById('offline-overlay');
        if (overlay) overlay.style.display = isOnline ? 'none' : 'flex';
    },
    checkQuery: () => {
        if (!navigator.onLine) {
            alert('خطأ في الاتصال: يرجى التحقق من الإنترنت.');
            return false;
        }
        return true;
    }
};

// --- Initialization ---
function init() {
    NetworkMonitor.init();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(() => { });
    }

    if (typeof axios === 'undefined') {
        alert('خطأ فني: مكتبة الاتصال Axios غير محملة. يرجى التحقق من اتصال الإنترنت.');
        return;
    }

    // Ping Server
    console.log('📡 [NETWORK] Connecting to:', API_URL);
    const overlay = $('offline-overlay');
    const title = $('offline-title');
    const msg = $('offline-msg');
    const diagBox = $('diagnostic-box');

    if (overlay) {
        overlay.style.display = 'flex';
        if (title) title.textContent = '📡 جاري الاتصال بالسيرفر...';
        if (msg) msg.textContent = 'يرجى الانتظار، قد يستغرق السيرفر 30-50 ثانية للعمل لأول مرة.';
        if (diagBox) diagBox.style.display = 'none';
    }

    axios.get(`${API_URL}/api/ping`, { timeout: 60000 }) // Increase to 60s for Render
        .then(() => {
            console.log('✅ [NETWORK] Server Online & Connected');
            if (overlay) overlay.style.display = 'none';
        })
        .catch(err => {
            console.error('❌ [NETWORK] Connection Error:', err.message);

            // diagnostic log for user
            console.log('%c DIAGNOSTIC INFO:', 'color: orange; font-weight: bold;');
            console.log('URL Attempted:', API_URL);
            console.log('Error Type:', err.name);
            console.log('Error Code:', err.code);
            console.log('Error Status:', err.response?.status);

            // DETECT FILE:// PROTOCOL
            const isLocalFile = window.location.protocol === 'file:';

            // SHOW DIAGNOSTIC OVERLAY
            if (overlay) {
                overlay.style.display = 'flex';
                if (title) title.textContent = '⚠️ عذراً، لا يمكن الاتصال بالسيرفر';

                let errorContext = 'السيرفر لا يستجيب حالياً أو أن الرابط غير صحيح.';
                if (isLocalFile) {
                    errorContext = '❌ النظام لا يعمل عند تشغيله كملف (Double Click). يجب رفعه على استضافة (مثل Cloudflare) أو استخدامه عبر Local Server.';
                } else if (err.message.includes('Network Error')) {
                    errorContext = 'فشل في الاتصال (Network Error). قد يكون السبب حظر من المتصفح (CORS) أو مشكلة في شبكتك.';
                }
                if (msg) msg.textContent = errorContext;

                const retryMsg = $('offline-retry-msg');
                if (retryMsg) retryMsg.style.display = 'none';

                if (diagBox) {
                    diagBox.style.display = 'block';
                    const dUrl = $('diag-url');
                    const dErr = $('diag-error');
                    if (dUrl) dUrl.textContent = `URL: ${API_URL}`;
                    if (dErr) dErr.textContent = `Details: ${err.message} (Code: ${err.code || 'N/A'})`;
                }
            }
        });

    const safeClick = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

    safeClick('login-form', (e) => doLogin(e));
    safeClick('register-form', (e) => doRegister(e));
    safeClick('show-register-btn', () => showAuth('register'));
    safeClick('show-login-btn', () => showAuth('login'));
    safeClick('demo-btn', startDemo);
    safeClick('logout-btn', logout);

    // Global Server Config Shortcut (Alt + S)
    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 's') configServer();
    });

    const rst = $('reset-system-btn');
    if (rst) rst.onclick = () => {
        if (confirm('تصفير النظام؟')) { localStorage.clear(); location.reload(true); }
    };

    safeClick('increase-bet', () => adjustBet(1000));
    safeClick('decrease-bet', () => adjustBet(-1000));
    safeClick('drop-ball-btn', playRound);

    safeClick('open-bank-btn', openBanking);

    // SECURE ADMIN TRIGGER (PIN-PROTECTED)
    safeClick('admin-trigger-icon', () => {
        const pin = prompt('الرجاء إدخال الرمز السري للمدير:');
        if (pin === '6543210') {
            openBanking();
            switchView('admin');
        } else if (pin !== null) {
            alert('❌ الرمز السري غير صحيح!');
        }
    });

    setupDepositListeners();
    checkAutoLogin();
    initMultipliers(); // Call the new function

    // Hidden Trigger: Click logo 5 times to configure API
    const logo = document.querySelector('.logo');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.onclick = handleLogoClick;
    }
}

// --- User Handling (Simplified) ---
function saveUser(u) {
    // Data is now saved on server
}

function getUser(email) {
    // Data is now fetched from server
}

async function doRegister(e) {
    e.preventDefault();
    if (!NetworkMonitor.checkQuery()) return;

    showLoading(true);
    try {
        const firstName = $('firstName').value;
        const lastName = $('lastName').value;
        const email = $('email').value;
        const password = $('reg_secure_key').value;

        const res = await axios.post(`${API_URL}/api/auth/register`, { firstName, lastName, email, password });
        if (res.data.success) {
            alert(`✅ تم تسجيل الحساب بنجاح!\n\nرقم المعرّف الخاص بك هو: ${res.data.userId}\nيرجى استخدامه عند الإيداع.`);
            showAuth('login');
        }
    } catch (e) {
        console.error('Registration Error:', e);
        const errorMsg = e.response?.data?.error || e.message;
        alert(`❌ فشل تسجيل الحساب: \n${errorMsg}\n\nتأكد من صحة رابط السيرفر في الإعدادات (اضغط على اللوجو 5 مرات لتغييره).`);
    } finally {
        showLoading(false);
    }
}

async function doLogin(e) {
    e.preventDefault();
    if (!NetworkMonitor.checkQuery()) return;

    showLoading(true);
    try {
        const email = $('loginIdentifier').value;
        const password = $('auth_secure_key').value;

        const res = await axios.post(`${API_URL}/api/auth/login`, { email, password });
        if (res.data.success) {
            localStorage.setItem('ar_last_user', email);
            loginUser(res.data.user);
        }
    } catch (e) {
        let msg = 'بيانات خاطئة أو فشل في الاتصال';
        if (e.response && e.response.status === 401) msg = 'البريد أو كلمة المرور غير صحيحة';
        alert(`${msg}\n\nنصيحة: إذا كنت قد سجلت قديماً، يرجى عمل "حساب جديد" لأننا انتقلنا لنظام حماية حقيقي.`);
    } finally {
        showLoading(false);
    }
}

function loginUser(user) {
    currentUser = user;
    const overlay = $('auth-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 400);
    }
    const gameUi = $('game-ui');
    if (gameUi) gameUi.style.display = 'flex';

    // Admin Visuals
    const admTab = $('admin-tab');
    if (user.role === 'admin') {
        const nameEl = $('user-name');
        if (nameEl) nameEl.innerHTML = `🔱 ADMIN <span style="font-size:0.7rem;color:var(--gold)">(MASTER)</span>`;
        if (admTab) admTab.style.display = 'flex';
    } else {
        const nameEl = $('user-name');
        if (nameEl) nameEl.textContent = user.firstName || 'VIP Member';
        if (admTab) admTab.style.display = 'none';
    }

    const idEl = $('account-id');
    if (idEl) idEl.textContent = `ID: ${user.id}`;

    const badge = document.createElement('span');
    badge.textContent = '● Online';
    badge.style.color = '#10b981';
    badge.style.fontSize = '0.7rem';
    badge.style.marginLeft = '5px';
    $('user-name').appendChild(badge);

    updateBalanceUI();
    updateEnergyUI();
    renderBoard();
    window.onresize = renderBoard;

    // Initial Energy Check
    fetchEnergy();
}

async function refreshUserData() {
    if (!currentUser || currentUser.isDemo) return;
    try {
        const res = await axios.get(`${API_URL}/api/game/energy/${currentUser.id}`);
        // We can extend this to a /api/auth/me later if needed
        if (res.data.success) {
            currentUser.energy = res.data.energy;
            dbQueryUser(); // Fix: No argument needed
        }
    } catch (e) { }
}

async function dbQueryUser() {
    if (!currentUser || currentUser.isDemo) return;
    try {
        const res = await axios.get(`${API_URL}/api/auth/me/${currentUser.email}`);
        if (res.data.success) {
            currentUser = res.data.user; // Full update from server
            updateBalanceUI();
            updateEnergyUI();
            const idEl = $('account-id');
            if (idEl) idEl.textContent = `ID: ${currentUser.id}`;
        }
    } catch (e) { }
}

function fetchEnergy() {
    if (!currentUser || currentUser.isDemo) return;
    axios.get(`${API_URL}/api/game/energy/${currentUser.id}`)
        .then(res => {
            currentUser.energy = res.data.energy;
            updateEnergyUI();
        })
        .catch(console.error);
}

function updateEnergyUI() {
    const el = $('energy-display');
    if (el) {
        const en = currentUser.isDemo ? 15 : (currentUser.energy !== undefined ? currentUser.energy : 15);
        el.innerHTML = `⚡ الطاقة: ${en}/15 <button onclick="buyEnergy()" style="background:#facc15;color:#000;border:none;border-radius:4px;cursor:pointer;font-size:0.7rem;padding:2px 5px;margin-right:5px;">+</button>`;
    }
}

async function buyEnergy() {
    if (!confirm('شراء 15 محاولة إضافية مقابل 5000 ل.س؟')) return;
    try {
        const res = await axios.post(`${API_URL}/api/game/buy-energy`, { userId: currentUser.id });
        if (res.data.success) {
            alert('تم شحن الطاقة بنجاح!');
            fetchEnergy();
            // Refresh balance not shown strictly here but happens on next update
            location.reload(); // Simple refresh to sync state
        }
    } catch (e) {
        alert(e.response?.data?.error || 'فشلت العملية');
    }
}

function startDemo() {
    if (!NetworkMonitor.checkQuery()) return;
    currentUser = { firstName: 'Guest', id: 'DEMO', balance: 50000, isDemo: true, transactions: [] };
    loginUser(currentUser);
}

async function checkAutoLogin() {
    const savedEmail = localStorage.getItem('ar_last_user');
    if (savedEmail) {
        try {
            const res = await axios.get(`${API_URL}/api/auth/me/${savedEmail}`);
            if (res.data.success) {
                loginUser(res.data.user);
            } else {
                showAuth('login');
            }
        } catch (e) {
            console.warn('Auto-login failed, showing manual auth.');
            showAuth('login');
        }
    } else {
        showAuth('login');
    }
}

function logout() {
    localStorage.removeItem('ar_last_user');
    location.reload();
}

function showLoading(show) {
    const btn = document.querySelector('.submit-btn');
    if (btn) btn.textContent = show ? 'جاري الاتصال...' : (btn.classList.contains('neon') ? 'تسجيل' : 'دخول آمن');
}

// --- Banking ---
function openBanking() {
    if (!currentUser) return;
    $('banking-modal').style.display = 'flex';
    switchView('deposit');
}

function closeBanking() {
    $('banking-modal').style.display = 'none';
}

// Deposit Image Handling
let depositProofBase64 = null;
// --- UI Updates ---
function updateBalanceUI() {
    const el = $('balance-amount'); // Changed from 'balance-display' to 'balance-amount' to match existing HTML
    const portalBal = $('portal-balance'); // Added to update portal balance
    const userRoleEl = $('user-role-display');
    const energyEl = $('energy-val'); // Plain text number

    if (el) el.textContent = currentUser.balance.toLocaleString('en-US');
    if (portalBal) portalBal.textContent = currentUser.balance.toLocaleString('en-US') + ' SYP'; // Update portal balance
    if (userRoleEl) userRoleEl.textContent = currentUser.role === 'admin' ? 'مدير النظام' : 'User';

    // Energy Update
    if (energyEl) {
        if (currentUser.role === 'admin') {
            energyEl.parentElement.innerHTML = '⚡ طاقة لا نهائية';
        } else {
            energyEl.textContent = currentUser.energy;
        }
    }

    // Loan System UI
    let loanBtn = $('btn-loan');
    if (!loanBtn) {
        // Create Loan Button if not exists
        const btn = document.createElement('button');
        btn.id = 'btn-loan';
        btn.className = 'action-btn';
        btn.style.background = '#f59e0b';
        btn.style.marginTop = '10px';
        btn.style.width = '100%';
        btn.style.display = 'none';
        btn.innerText = 'طلب سلفة (10,000) 💸';
        btn.onclick = handleLoan;

        // Insert after balance card content
        const card = document.querySelector('.balance-card');
        if (card) card.appendChild(btn);
        loanBtn = btn; // Assign to loanBtn for subsequent checks
    }

    const startBtn = $('start-btn');
    if (currentUser.isDemo) {
        if (startBtn) startBtn.disabled = false;
        if (loanBtn) loanBtn.style.display = 'none';
    } else {
        // Real User Logic

        // Show Loan Button if Balance < 1000 AND No Debt
        if (currentUser.balance < 1000 && (!currentUser.debt || currentUser.debt <= 0)) {
            if (loanBtn) loanBtn.style.display = 'block';
        } else {
            if (loanBtn) loanBtn.style.display = 'none';
        }

        // Show Debt Indicator
        let debtEl = $('debt-display');
        if (currentUser.debt > 0) {
            if (!debtEl) {
                const d = document.createElement('div');
                d.id = 'debt-display';
                d.style.color = '#ef4444';
                d.style.marginTop = '5px';
                d.style.fontSize = '0.9rem';
                d.innerHTML = `عليك دين: <b>${currentUser.debt.toLocaleString()}</b> ل.س (يخصم من الأرباح)`;
                document.querySelector('.balance-card').appendChild(d);
                debtEl = d; // Assign to debtEl for subsequent updates
            } else {
                debtEl.innerHTML = `عليك دين: <b>${currentUser.debt.toLocaleString()}</b> ل.س (يخصم من الأرباح)`;
                debtEl.style.display = 'block';
            }
        } else {
            if (debtEl) debtEl.style.display = 'none';
        }
    }
}

async function handleLoan() {
    if (!confirm('هل تريد طلب سلفة 10,000 ل.س؟\n\nسيتم إرسال الطلب للمدير للموافقة عليه.')) return;

    try {
        const res = await axios.post(`${API_URL}/api/bank/loan`, { userId: currentUser.id });
        if (res.data.success) {
            alert('✅ ' + res.data.message);
            // Dont update balance instantly. Just hide button.
            const btn = $('btn-loan');
            if (btn) {
                btn.disabled = true;
                btn.innerText = '⏳ قيد المراجعة...';
            }
        }
    } catch (e) {
        alert(e.response?.data?.error || 'فشل طلب السلفة');
    }
}
function setupDepositListeners() {
    const zone = $('dep-upload-zone');
    const input = $('dep-proof-img');
    const status = $('dep-upload-status');

    if (zone && input) {
        zone.onclick = () => input.click();
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (re) => {
                    depositProofBase64 = re.target.result;
                    status.innerHTML = `✅ تم رفع الصورة: ${file.name}`;
                    status.style.color = 'var(--gold)';
                };
                reader.readAsDataURL(file);
            }
        };
    }
}

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    const target = $(`view-${viewId}`);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    // Dedicated Page Logic for Admin
    const modal = $('banking-modal');
    if (viewId === 'admin') {
        modal.classList.add('admin-full-page');
        renderAdminPanel();
    } else {
        modal.classList.remove('admin-full-page');
    }

    // Existing view-specific logic
    if (viewId === 'history') renderTransactions();
    if (viewId === 'deposit') {
        goToDepositStep(1);
        if ($('dep-user-id-confirm')) $('dep-user-id-confirm').value = currentUser.id;
    }
    if (viewId === 'withdraw') {
        goToWithdrawStep(1);
        if ($('with-user-id-confirm')) $('with-user-id-confirm').value = currentUser.id;
    }
    if (viewId === 'loan') {
        const btn = $('btn-loan');
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'إرسال طلب سلفة';
        }
    }
}

function closeAdminView() {
    const modal = $('banking-modal');
    modal.classList.remove('admin-full-page');
    closeBanking();
}

function startDeposit(method) {
    if ($('dep-method')) $('dep-method').value = method;
    $('company-account').textContent = CONFIG.COMPANY_ACCOUNTS[method];
    goToDepositStep(2);
}

function goToDepositStep(step) {
    document.querySelectorAll('.step-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    $(`deposit-step-${step}`).style.display = 'block';
    for (let i = 0; i < step; i++) document.querySelectorAll('.step')[i].classList.add('active');
}

async function submitDeposit() {
    const amount = parseInt($('dep-amount').value);
    const method = $('dep-method').value;
    const txnId = $('dep-txn-id').value;
    const typedId = $('dep-user-id-confirm').value;

    if (!amount || amount < CONFIG.MIN_DEP) return alert(`الحد الأدنى للإيداع هو ${CONFIG.MIN_DEP} SYP`);
    if (!txnId) return alert('يرجى إدخال رقم العملية');
    if (!typedId || Number(typedId) !== currentUser.id) return alert('❌ رقم المعرف (ID) غير مطابق لحسابك الحالي!');
    if (!depositProofBase64) return alert('يرجى رفع صورة إشعار الدفع');

    try {
        showLoading(true);
        const res = await axios.post(`${API_URL}/api/bank/deposit`, {
            userId: currentUser.id,
            amount: amount,
            method: method,
            transactionId: txnId,
            proof: depositProofBase64
        });

        alert('✅ تم إرسال طلبك بنجاح. سيتم مراجعة الطلب وإضافة الرصيد فوراً عند مطابقة البيانات.');
        closeBanking();
        depositProofBase64 = null; // reset
        refreshUserData();
    } catch (e) {
        alert('خطأ في إرسال طلب الإيداع');
    } finally {
        showLoading(false);
    }
}

function startWithdraw(method) {
    if ($('with-method')) $('with-method').value = method;
    goToWithdrawStep(2);
}

function goToWithdrawStep(step) {
    if (step === 1) {
        $('withdraw-step-1').style.display = 'block';
        $('withdraw-step-2').style.display = 'none';
    } else {
        $('withdraw-step-1').style.display = 'none';
        $('withdraw-step-2').style.display = 'block';
    }
}

async function submitWithdraw() {
    if (!NetworkMonitor.checkQuery()) return;

    const amount = Number($('with-amount').value);
    const account = $('with-account').value;
    const method = $('with-method').value || 'SyriaCash';
    const confirmedId = $('with-user-id-confirm').value;

    if (isNaN(amount) || amount < 50000) return alert('الحد الأدنى للسحب هو 50,000 SYP');
    if (amount > currentUser.balance) return alert('رصيد غير كافٍ لسحب هذا المبلغ');
    if (!account || account.length < 9) return alert('يرجى إدخال رقم هاتف صحيح');

    if (!confirm(`هل أنت متأكد من سحب ${amount.toLocaleString()} SYP إلى الرقم ${account}؟\n\nسيتم ربط هذا الرقم بـ ID الحساب الخاص بك.`)) return;

    try {
        showLoading(true);
        const res = await axios.post(`${API_URL}/api/bank/withdraw`, {
            userId: currentUser.id,
            amount: amount,
            method: method,
            phone: account
        });

        alert('✅ ' + res.data.message);
        closeBanking();
        refreshUserData();
    } catch (e) {
        console.error('Withdraw Error:', e);
        alert('❌ ' + (e.response?.data?.error || 'فشل إرسال طلب السحب'));
    } finally {
        showLoading(false);
    }
}

function renderHistory() {
    const list = $('trans-list');
    list.innerHTML = '';
    const txs = currentUser.transactions || [];
    if (!txs.length) list.innerHTML = '<p style="text-align:center;color:#666">لا توجد عمليات</p>';
    txs.forEach(tx => {
        const div = document.createElement('div');
        div.className = 'txn-item';
        let statusBadge = tx.status === 'pending' ? '<span class="status-badge pending">قيد المعالجة</span>' : '<span class="status-badge success">تم بنجاح</span>';
        const isDep = tx.type === 'deposit' || tx.type === 'revenue'; // Revenue shows as green for admin
        const color = isDep ? '#10b981' : '#ef4444';
        const sign = isDep ? '+' : '-';
        div.innerHTML = `<div><div style="font-weight:bold">${tx.type.toUpperCase()}</div><small>${tx.date}</small></div>
            <div style="text-align:left"><div style="color:${color};font-weight:bold">${sign} ${tx.amount.toLocaleString()}</div>${statusBadge}</div>`;
        list.appendChild(div);
    });
}

// --- Game Logic ---


function adjustBet(delta) {
    let next = currentBet + delta;
    if (next < 5000) next = 5000; // Force minimum 5000
    currentBet = next;
    $('current-bet').textContent = next;
}

function playRound() {
    if (!NetworkMonitor.checkQuery()) return;
    if (currentUser.balance < currentBet) return alert('رصيد غير كاف');

    // Optimistic Energy Check
    if (!checkEnergy()) return;

    // We don't deduct balance immediately here for Real users, 
    // we wait for server? No, improves UX to deduct visual first.
    // However, with Energy, we should probably sync.
    // Let's deduct visually.
    currentUser.balance -= currentBet;
    if (!currentUser.isDemo) currentUser.energy = (currentUser.energy || 1) - 1;
    updateBalanceUI();
    updateEnergyUI();

    let r = Math.random() * CONFIG.WEIGHTS.reduce((a, b) => a + b, 0);
    let idx = 0;
    for (let i = 0; i < CONFIG.WEIGHTS.length; i++) {
        r -= CONFIG.WEIGHTS[i];
        if (r <= 0) { idx = i; break; }
    }
    spawnBall(idx);
}

// Add Energy Check to Play
function checkEnergy() {
    if (currentUser.isDemo) return true;
    if (currentUser.energy !== undefined && currentUser.energy <= 0) {
        alert('⚠️ نفذت طاقتك اليومية. قم بشراء طاقة إضافية للاستمرار.');
        return false;
    }
    return true;
}

let pegs = []; // Global storage for peg positions

function spawnBall(targetIdx) {
    const container = $('plinko-board-container');
    const ball = document.createElement('div');
    ball.className = 'game-ball';
    container.appendChild(ball);

    // Initial Physics State
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    let x = centerX + (Math.random() * 10 - 5);
    let y = 0;
    let vx = (Math.random() * 2 - 1);
    let vy = 2;
    const gravity = 0.25;
    const bounce = -0.5;
    const ballRadius = 9; // 18px / 2
    const pegRadius = 4;  // 8px / 2

    // Pre-calculate target X at bottom for "Hidden Steering"
    const targetLeftPercent = 5 + (targetIdx * 10) + 5; // Center of bucket
    const targetX = (targetLeftPercent / 100) * rect.width;

    function update() {
        // Apply Gravity
        vy += gravity;

        // Horizontal "Wind" / Steering to reach targetIdx naturally
        const progress = y / rect.height;
        const steer = (targetX - x) * 0.015 * progress;
        vx += steer;

        // Apply Velocity
        x += vx;
        y += vy;

        // Friction
        vx *= 0.99;
        vy *= 0.99;

        // Collision Detection with Pegs
        pegs.forEach(peg => {
            const dx = x - peg.px;
            const dy = y - peg.py;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = ballRadius + pegRadius;

            if (dist < minDist) {
                // Collision response
                const angle = Math.atan2(dy, dx);
                // Snap to surface
                x = peg.px + Math.cos(angle) * minDist;
                y = peg.py + Math.sin(angle) * minDist;

                // Reflect velocity
                const speed = Math.sqrt(vx * vx + vy * vy);
                vx = Math.cos(angle) * speed * 0.6 + (Math.random() - 0.5);
                vy = Math.sin(angle) * speed * 0.6;

                // Visual feedback on peg
                peg.el.style.transform = 'translate(-50%, -50%) scale(1.5)';
                peg.el.style.filter = 'brightness(2) drop-shadow(0 0 5px white)';
                setTimeout(() => {
                    peg.el.style.transform = 'translate(-50%, -50%) scale(1)';
                    peg.el.style.filter = '';
                }, 100);
            }
        });

        // Boundary checks
        if (x < ballRadius) { x = ballRadius; vx *= -0.5; }
        if (x > rect.width - ballRadius) { x = rect.width - ballRadius; vx *= -0.5; }

        // Update DOM
        ball.style.left = `${x}px`;
        ball.style.top = `${y}px`;

        // Check if finished
        if (y < rect.height - 40) {
            requestAnimationFrame(update);
        } else {
            ball.remove();
            processWin(targetIdx);
        }
    }

    requestAnimationFrame(update);
}

async function processWin(idx) {
    if (!navigator.onLine) return;
    const mult = CONFIG.MULTIPLIERS[idx];

    // Flash bucket
    const bucket = document.querySelectorAll('.bucket')[idx];
    if (bucket) { bucket.style.background = '#ffffff40'; setTimeout(() => bucket.style.background = '#1e293b', 300); }

    // --- SERVER SIDE VERIFICATION ---
    // We send the result to the server to handle taxes and revenue
    // Client side is just for visual "immediate" feedback, but we wait for server to confirm balance

    if (currentUser.isDemo) {
        if (mult > 0) {
            const win = currentBet * mult;
            currentUser.balance += win;
            showFloat(`+${win}`);
            createParticles(idx);
        } else {
            showFloat(`-${currentBet}`, '#ef4444');
        }
        updateBalanceUI();
        return;
    }

    try {
        const res = await axios.post(`${API_URL}/api/game/result`, {
            userId: currentUser.id,
            betAmount: currentBet,
            multiplier: mult,
            multiplierIndex: idx
        });

        if (res.data.success) {
            const serverPayout = res.data.payout;
            // Visual Feedback
            if (serverPayout > 0) {
                showFloat(`+${serverPayout.toLocaleString()}`);
                createParticles(idx);
            } else {
                showFloat(`-${currentBet}`, '#ef4444');
            }

            // Sync State
            currentUser.balance = res.data.newBalance;
            currentUser.energy = res.data.remainingEnergy;
            updateBalanceUI();
            updateEnergyUI();
        }
    } catch (e) {
        console.error('Game Result Error:', e);
        // If server error, we might be desynced.
        if (e.response && e.response.status === 403) {
            alert(' نفذت طاقتك! اشحن الطاقة للاستمرار.');
        }
    }
}

function showFloat(txt, color = 'var(--gold)') {
    const el = document.createElement('div');

    // Determine if win or loss
    const isWin = txt.includes('+');
    const isLoss = txt.includes('-');

    // Add icon based on result
    let icon = '';
    if (isWin) icon = '🎉 ';
    else if (isLoss) icon = '💔 ';

    el.innerHTML = `
        <div style="
            font-size: 2.5rem;
            font-weight: 900;
            text-shadow: 0 0 20px ${color}, 0 0 40px ${color};
            animation: floatUp 2s ease-out forwards;
            font-family: 'Tajawal', sans-serif;
        ">
            ${icon}${txt}
        </div>
    `;

    el.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 300;
        color: ${color};
    `;

    $('plinko-board-container').appendChild(el);

    // Add confetti effect for big wins
    if (isWin && txt.includes('×')) {
        createConfetti();
    }

    setTimeout(() => el.remove(), 2000);
}

function createConfetti() {
    const container = $('plinko-board-container');
    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
            position: absolute;
            width: 10px;
            height: 10px;
            background: ${['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1'][Math.floor(Math.random() * 4)]};
            left: ${50 + (Math.random() - 0.5) * 20}%;
            top: 40%;
            animation: confettiFall ${1 + Math.random()}s ease-out forwards;
            opacity: 0;
        `;
        container.appendChild(confetti);
        setTimeout(() => confetti.remove(), 2000);
    }
}

function createParticles(idx) {
    const bucket = document.querySelectorAll('.bucket')[idx];
    if (!bucket) return;
    const rect = bucket.getBoundingClientRect();
    const container = $('plinko-board-container');
    const containerRect = container.getBoundingClientRect();

    for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const x = rect.left - containerRect.left + rect.width / 2;
        const y = rect.top - containerRect.top;
        p.style.left = x + 'px';
        p.style.top = y + 'px';

        const tx = (Math.random() - 0.5) * 200;
        const ty = (Math.random() - 0.5) * 200 - 100;
        p.style.setProperty('--tx', `${tx}px`);
        p.style.setProperty('--ty', `${ty}px`);

        container.appendChild(p);
        setTimeout(() => p.remove(), 1000);
    }
}

// --- Admin Functions ---
let currentAdminSubView = 'pending';

function switchAdminSubView(view) {
    currentAdminSubView = view;
    // Update UI
    document.querySelectorAll('.admin-sub-panel').forEach(p => p.style.display = 'none');
    $(`admin-${view}-view`).style.display = 'block';

    document.querySelectorAll('.sub-nav-btn').forEach(btn => {
        const isActive = btn.textContent.includes(view === 'pending' ? 'معلقة' : (view === 'users' ? 'اللاعبين' : (view === 'history' ? 'العمليات' : 'أرباحي')));
        btn.classList.toggle('active', isActive);
    });

    renderAdminPanel();
}

async function renderAdminPanel() {
    if (currentUser.role !== 'admin') return;

    // Auto-route based on current active sub-view
    if (currentAdminSubView === 'pending') {
        const list = $('admin-txn-body');
        if (!list) return;
        list.innerHTML = '<tr><td colspan="5" style="text-align:center">جاري التحميل...</td></tr>';

        try {
            const res = await axios.get(`${API_URL}/api/admin/transactions?t=${Date.now()}`);
            const txns = res.data;
            console.log(`[ADMIN] 📥 Fetched ${txns.length} pending transactions`);

            const countEl = $('admin-pending-count');
            if (countEl) countEl.textContent = txns.length;

            if (txns.length === 0) {
                list.innerHTML = '<tr><td colspan="5" style="text-align:center; opacity:0.5;">لا يوجد عمليات معلقة حالياً</td></tr>';
                return;
            }

            list.innerHTML = txns.map(t => `
                <tr>
                    <td>
                        <div style="font-weight:700">${t.user_email}</div>
                        <div style="font-size:0.7rem; opacity:0.5">${new Date(t.created_at).toLocaleString('ar-EG')}</div>
                    </td>
                    <td style="color:var(--gold); font-weight:900">${t.amount.toLocaleString()} SYP</td>
                    <td>
                        <div class="badge" style="background:#222">${t.method || 'loan'}</div>
                        <div style="font-size:0.7rem; color:var(--gold); margin-top:3px;">ID: ${t.transaction_id || t.type}</div>
                    </td>
                    <td>
                        ${t.proof ? `<button onclick="viewProof('${t.proof}')" style="background:#444; border:none; color:white; padding:3px 8px; font-size:0.6rem; cursor:pointer;">عرض الإيصال 📑</button>` : '<span style="opacity:0.3">لا يوجد (طلب دين)</span>'}
                    </td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button onclick="processAdminAction('${t.id}', 'approve')" class="approve-btn" style="padding:5px 10px; font-size:0.7rem;">قبول ✅</button>
                            <button onclick="processAdminAction('${t.id}', 'reject')" class="reject-btn" style="padding:5px 10px; font-size:0.7rem;">رفض ❌</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error('Admin Panel Fetch Error:', e);
            const errorMsg = e.response?.data?.error || e.message || 'خطأ غير معروف';
            list.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center">❌ فشل الاتصال بالسيرفر: ${errorMsg}</td></tr>`;
        }
    } else if (currentAdminSubView === 'users') {
        renderAdminUsers();
    } else if (currentAdminSubView === 'history') {
        renderAdminHistory();
    } else if (currentAdminSubView === 'revenue') {
        // Revenue view doesn't auto-load, requires PIN
    }
}

function unlockRevenue() {
    const pin = $('revenue-pin-input').value;
    if (!pin) {
        alert('⚠️ يرجى إدخال رمز PIN');
        return;
    }

    renderAdminRevenue(pin);
}

async function renderAdminRevenue(pin) {
    try {
        const res = await axios.post(`${API_URL}/api/admin/revenue`, { pin });

        if (res.data.success) {
            // Hide PIN gate, show content
            $('revenue-pin-gate').style.display = 'none';
            $('revenue-content').style.display = 'block';

            const rev = res.data.revenue;
            $('rev-total').textContent = rev.total.toLocaleString() + ' SYP';
            $('rev-losses').textContent = rev.game_losses.toLocaleString() + ' SYP';
            $('rev-wins').textContent = rev.game_wins.toLocaleString() + ' SYP';
            $('rev-energy').textContent = rev.energy_sales.toLocaleString() + ' SYP';
            $('rev-deposits').textContent = rev.total_deposits.toLocaleString() + ' SYP';
            $('rev-withdrawals').textContent = rev.total_withdrawals.toLocaleString() + ' SYP';
            $('rev-loans').textContent = rev.active_loans.toLocaleString() + ' SYP';
        }
    } catch (e) {
        if (e.response && e.response.status === 403) {
            alert('❌ رمز PIN غير صحيح');
            $('revenue-pin-input').value = '';
        } else {
            alert('❌ فشل جلب بيانات الأرباح: ' + (e.response?.data?.error || e.message));
        }
    }
}

function showEnergyStore() {
    $('energy-store-modal').style.display = 'flex';
}

async function buyEnergy(packageId) {
    if (!confirm('هل تريد شراء هذه الحزمة باستخدام رصيدك في اللعبة؟')) return;

    try {
        const res = await axios.post(`${API_URL}/api/bank/buy-energy`, {
            userId: currentUser.id,
            packageId: packageId
        });

        if (res.data.success) {
            alert('✅ ' + res.data.message);
            currentUser.energy = res.data.newEnergy;
            updateEnergyUI();
            updateBalanceUI(); // Balance decreased
            $('energy-store-modal').style.display = 'none';

            // Refresh User Data
            initUserSession(currentUser.email);
        }
    } catch (e) {
        alert(e.response?.data?.error || 'فشل عملية الشراء');
    }
}

async function renderAdminUsers() {
    const list = $('admin-users-body');
    if (!list) return;
    list.innerHTML = '<tr><td colspan="7" style="text-align:center">جاري جلب قائمة اللاعبين...</td></tr>';

    try {
        const res = await axios.get(`${API_URL}/api/admin/users`);
        list.innerHTML = res.data.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>
                    <div style="font-weight:700">${u.first_name} ${u.last_name}</div>
                    <div style="font-size:0.7rem; opacity:0.6">${u.phone || 'لم يربط هاتف بعد'}</div>
                </td>
                <td style="font-size:0.8rem">${u.email}</td>
                <td style="color:var(--gold); font-weight:700">${Number(u.balance).toLocaleString()}</td>
                <td style="color:red">${Number(u.debt || 0).toLocaleString()}</td>
                <td style="color:#10b981">${Number(u.accumulated_profit || 0).toLocaleString()}</td>
                <td>
                    <button onclick='showUserDetails(${JSON.stringify(u || {})})' style="background:var(--gold); border:none; padding:5px 10px; cursor:pointer; font-weight:bold; font-size:0.7rem;">السجل 📜</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        list.innerHTML = '<tr><td colspan="7" style="color:red">فشل جلب اللاعبين</td></tr>';
    }
}

function showUserDetails(user) {
    const logs = user.activity || [];
    let html = `
        <div style="background:#000; color:white; padding:20px; border:1px solid var(--gold); max-width:600px; margin:20px auto; direction:rtl;">
            <h3 style="color:var(--gold); margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">سجل نشاط: ${user.first_name} ${user.last_name}</h3>
            <div style="max-height:400px; overflow-y:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                    <thead>
                        <tr style="border-bottom:2px solid #222;">
                            <th style="padding:10px; text-align:right;">نوع العمل</th>
                            <th style="padding:10px; text-align:right;">المبلغ</th>
                            <th style="padding:10px; text-align:right;">الحالة</th>
                            <th style="padding:10px; text-align:right;">التاريخ</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (logs.length === 0) {
        html += `<tr><td colspan="4" style="text-align:center; padding:20px; opacity:0.5;">لا يوجد سجل عمليات لهذا المستخدم</td></tr>`;
    } else {
        html += logs.map(l => {
            const statusColor = l.status === 'success' ? '#10b981' : (l.status === 'failed' ? '#ef4444' : '#facc15');
            return `
                <tr style="border-bottom:1px solid #111;">
                    <td style="padding:10px;">${l.type}</td>
                    <td style="padding:10px; font-weight:bold;">${Number(l.amount).toLocaleString()}</td>
                    <td style="padding:10px; color:${statusColor}">${l.status}</td>
                    <td style="padding:10px; opacity:0.6; font-size:0.7rem;">${new Date(l.date).toLocaleString('ar-EG')}</td>
                </tr>
            `;
        }).join('');
    }

    html += `
                    </tbody>
                </table>
            </div>
            <button onclick="this.parentElement.remove()" style="margin-top:20px; width:100%; padding:10px; background:#333; color:white; border:none; cursor:pointer;">إغلاق</button>
        </div>
    `;

    const viewer = document.createElement('div');
    viewer.id = 'user-details-overlay';
    viewer.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:200000; overflow-y:auto;';
    viewer.innerHTML = html;
    document.body.appendChild(viewer);
}

async function renderAdminHistory() {
    const list = $('admin-history-body');
    if (!list) return;
    list.innerHTML = '<tr><td colspan="5" style="text-align:center">جاري جلب السجل الكامل...</td></tr>';

    try {
        const res = await axios.get(`${API_URL}/api/admin/all-transactions`);
        list.innerHTML = res.data.map(t => {
            const statusColor = t.status === 'success' ? '#10b981' : (t.status === 'failed' ? '#ef4444' : '#facc15');
            const typeLabels = {
                deposit: 'إيداع',
                withdraw: 'سحب',
                loan: 'سلفة 💸',
                game_win: 'فوز 🎁',
                game_loss: 'رهان 🎮',
                energy_purchase: 'شراء طاقة ⚡',
                sweep: 'Jackpot Sweep 🔥'
            };
            return `
                <tr>
                    <td><div style="font-weight:bold">${t.user_email}</div></td>
                    <td>${typeLabels[t.type] || t.type}</td>
                    <td style="font-weight:900">${t.amount.toLocaleString()} SYP</td>
                    <td style="color:${statusColor}">${t.status.toUpperCase()}</td>
                    <td style="font-size:0.7rem; opacity:0.5">${new Date(t.created_at).toLocaleString('ar-EG')}</td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = '<tr><td colspan="5" style="color:red">فشل جلب السجل</td></tr>';
    }
}

function viewProof(base64) {
    const win = window.open();
    win.document.write(`<body style="margin:0; background:#000; display:flex; justify-content:center; align-items:center;"><img src="${base64}" style="max-width:100%; max-height:100%;"></body>`);
}

async function processAdminAction(txnId, action) {
    if (!confirm(`هل أنت متأكد من ${action === 'approve' ? 'الموافقة على' : 'رفض'} هذه العملية؟`)) return;

    try {
        const res = await axios.post(`${API_URL}/api/admin/process`, { txnId, action, adminId: currentUser.id });
        if (res.data.success) {
            alert('تم التحديث بنجاح');
            renderAdminPanel();
        } else {
            alert(res.data.error || 'فشلت العملية');
        }
    } catch (e) {
        alert('حدث خطأ تقني في الاتصال بالسيرفر');
    }
}

function renderBoard() {
    const b = $('plinko-board');
    const container = $('plinko-board-container');
    const rect = container.getBoundingClientRect();
    b.innerHTML = '';
    pegs = [];

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c <= r; c++) {
            const p = document.createElement('div');
            p.className = 'peg';
            const topPct = 10 + r * 8;
            const leftPct = 50 + (c - r / 2) * 8;

            p.style.top = `${topPct}%`;
            p.style.left = `${leftPct}%`;
            b.appendChild(p);

            // Store pixel coordinates for physics
            // We need relative coordinates to container
            // width of container is rect.width
            // topPct is relative to height (but user square aspect ratio?)
            // Let's use % logic in physics if possible or recalculate on resize.
            // For simplicity, we re-query in physics loop or assume static for now.
            pegs.push({
                el: p,
                px: (leftPct / 100) * rect.width,
                py: (topPct / 100) * rect.height
            });
        }
    }
}

// --- 🎭 Animation & Graphics ---
// (Board rendering is handled in renderBoard)


window.onload = init;
