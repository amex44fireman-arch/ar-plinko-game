window.onerror = function (msg, url, line, col, error) {
    if (msg.includes('ResizeObserver')) return; // Ignore harmless resize errors
    alert('⚠️ حدث خطأ في النظام:\n\n' + msg + '\n\n' + 'السطر: ' + line);
    console.error('Global Error:', error);
};

const VERSION = '4.0.0 - SECURE EDITION';
console.log(`%c AR GAME v${VERSION} LOADED`, 'background: #000; color: #ffd700; font-size: 20px; font-weight: bold;');

// --- 🚩 SMART API CONFIGURATION 🚩 ---
// Automatically detects your server. No need to manual edit!
// Automatically detects your server. No need to manual edit!
const getSavedAPI = () => localStorage.getItem('ar_api_url') || 'https://game-server-example.onrender.com'; // Default to a placeholder if needed
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
    axios.get(`${API_URL}/api/ping`, { timeout: 10000 })
        .then(() => {
            console.log('✅ Server Online');
            // Server is ready
        })
        .catch(err => {
            console.error('❌ Server Offline:', err);
            let msg = 'فشل الاتصال بالسيرفر.\n';
            if (err.code === 'ERR_NETWORK') msg += 'تأكد من الرابط (هل هو HTTPS؟) ومن تشغيل السيرفر.';
            else msg += `رمز الخطأ: ${err.message}`;

            if (confirm(`${msg}\n\nهل تريد محاولة ضبط الرابط مرة أخرى؟`)) {
                configServer();
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
        const password = $('password').value;

        const res = await axios.post(`${API_URL}/api/auth/register`, { firstName, lastName, email, password });
        if (res.data.success) {
            alert('✅ تم تسجيل الحساب بنجاح على السيرفر.');
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
        const password = $('loginPassword').value;

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
    // Removed offline check to ensure UI always loads
    const savedEmail = localStorage.getItem('ar_last_user');
    if (savedEmail) {
        try {
            // In a real app, we'd use a token. 
            // For now, let's just use the email to "restore" session if it's already in memory
            // but since we refresh, we need to fetch user info again.
            // Simplified: User will have to login once per session until we add session tokens.
            const overlay = $('auth-overlay');
            if (overlay) overlay.style.display = 'flex';
        } catch (e) { }
    } else {
        const overlay = $('auth-overlay');
        if (overlay) overlay.style.display = 'flex';
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
    if (viewId === 'deposit') goToDepositStep(1);
    if (viewId === 'withdraw') goToWithdrawStep(1);
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

    if (!amount || amount < CONFIG.MIN_DEP) return alert(`الحد الأدنى للإيداع هو ${CONFIG.MIN_DEP} SYP`);
    if (!txnId) return alert('يرجى إدخال رقم العملية');
    if (!depositProofBase64) return alert('يرجى رفع صورة إشعار الدفع');

    try {
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
    } catch (e) {
        alert('خطأ في إرسال الطلب');
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

function submitWithdraw() {
    if (!NetworkMonitor.checkQuery()) return;
    const amount = Number($('with-amount').value);

    if (isNaN(amount) || amount <= 0) return alert('يرجى إدخال مبلغ صحيح');
    if (amount < 10000) return alert('الحد الأدنى للسحب هو 10,000 SYP');
    if (amount > currentUser.balance) return alert('رصيد غير كافٍ لسحب هذا المبلغ');

    const account = $('with-account').value;
    if (!account) return alert('يرجى إدخال رقم الحساب المستلم');

    const method = pendingTxn.method;

    const txn = {
        id: 'WT-' + Date.now(),
        type: 'withdraw',
        amount: amount,
        method: method,
        account: account,
        status: 'pending',
        date: new Date().toLocaleString()
    };

    currentUser.balance -= amount;
    currentUser.transactions.unshift(txn);
    saveUser(currentUser);
    updateBalanceUI();

    alert('تم إرسال طلب السحب بنجاح. سيتم المعالجة قريباً.');
    closeBanking();

    // Simulate auto-success for local testing
    setTimeout(() => {
        if (navigator.onLine) {
            txn.status = 'success';
            saveUser(currentUser);
        }
    }, 6000);
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
    el.textContent = txt;
    el.className = 'win-float';
    el.style.color = color;
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.position = 'absolute';
    el.style.transform = 'translate(-50%, -50%)';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '300';
    $('plinko-board-container').appendChild(el);
    setTimeout(() => el.remove(), 1500);
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
async function renderAdminPanel() {
    if (currentUser.role !== 'admin') return;
    const list = $('admin-txn-body');
    if (!list) return;
    list.innerHTML = '<tr><td colspan="5" style="text-align:center">جاري التحميل...</td></tr>';

    try {
        const res = await axios.get(`${API_URL}/api/admin/transactions`);
        const txns = res.data.filter(t => t.status === 'pending');

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
                    <div class="badge" style="background:#222">${t.method}</div>
                    <div style="font-size:0.7rem; color:var(--gold); margin-top:3px;">ID: ${t.transaction_id || 'N/A'}</div>
                </td>
                <td>
                    ${t.proof ? `<button onclick="viewProof('${t.proof}')" style="background:#444; border:none; color:white; padding:3px 8px; font-size:0.6rem; cursor:pointer;">عرض الإيصال 📑</button>` : '<span style="opacity:0.3">لا يوجد</span>'}
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
        list.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center">خطأ في الاتصال بالسيرفر</td></tr>';
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

// --- Banking UI ---
function renderBanking() {
    const container = $('banking-container');
    container.innerHTML = `
    <div class="glass-panel" style="max-width:600px; margin:2rem auto; padding:2rem;">
        <h2 style="color:var(--gold); text-align:center; margin-bottom:1.5rem">البنك</h2>
        
        <div style="display:flex; justify-content:center; gap:1rem; margin-bottom:2rem;">
            <button onclick="showSection('deposit')" class="action-btn" id="btn-deposit">إيداع</button>
            <button onclick="showSection('withdraw')" class="action-btn" id="btn-withdraw">سحب</button>
        </div>

        <!-- Deposit Section -->
        <div id="section-deposit">
            <h3 style="color:var(--neon-blue); margin-bottom:1rem;">شحن الرصيد</h3>
            
            <div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:10px; margin-bottom:1.5rem; text-align:center; border:1px dashed var(--gold);">
                <small style="color:#aaa">رقم المعرف الخاص بك (ID) للإيداع:</small>
                <h2 style="font-family:monospace; color:white; margin:0.5rem 0; cursor:pointer;" onclick="navigator.clipboard.writeText('${currentUser.id}'); alert('تم نسخ المعرف')">
                    ${currentUser.id} <span style="font-size:0.8rem; color:var(--gold)">📋</span>
                </h2>
                <small style="color:var(--neon-blue)">يرجى وضع هذا الرقم في وصف عملية التحويل المالي</small>
            </div>

            <div class="form-group">
                <label>طريقة الدفع</label>
                <select id="dep-method" style="width:100%; padding:10px; background:#0f172a; color:white; border:1px solid #334155; border-radius:8px;">
                    <option value="SyriaCash">SyriaCash (SyriaTel)</option>
                    <option value="ShamCash">ShamCash (MTN)</option>
                    <option value="Electronic">شحن إلكتروني</option>
                </select>
            </div>
            
            <div id="dep-info" style="margin-bottom:1rem; padding:1rem; background:rgba(0,0,0,0.3); border-radius:8px;">
                <!-- Filled dynamically -->
            </div>

            <div class="form-group">
                <label>المبلغ المرسل</label>
                <input type="number" id="dep-amount" placeholder="أقل مبلغ ${CONFIG.MIN_DEP}" style="width:100%">
            </div>

            <div class="form-group">
                <label>رقم العملية (Transaction ID)</label>
                <input type="text" id="dep-txid" placeholder="أدخل رقم عملية التحويل هنا" style="width:100%">
            </div>

            <button onclick="handleDeposit()" class="action-btn" style="width:100%">تأكيد الإيداع</button>
        </div>

        <!-- Withdraw Section -->
        <div id="section-withdraw" style="display:none;">
            <h3 style="color:var(--neon-purple); margin-bottom:1rem;">سحب الأرباح</h3>
            <div class="form-group">
                <label>طريقة السحب</label>
                <select id="wd-method" style="width:100%; padding:10px; background:#0f172a; color:white; border:1px solid #334155; border-radius:8px;">
                    <option value="SyriaCash">SyriaCash (SyriaTel)</option>
                    <option value="ShamCash">ShamCash (MTN)</option>
                </select>
            </div>

            <div class="form-group">
                <label>المبلغ المراد سحبه</label>
                <input type="number" id="wd-amount" placeholder="الحد الأدنى 50,000" style="width:100%">
            </div>

            <div class="form-group">
                <label>رقم الهاتف (للاستلام)</label>
                <input type="tel" id="wd-phone" placeholder="09xxxxxxxx" style="width:100%">
                <small style="color:#aaa; display:block; margin-top:5px;">سيتم ربط هذا الرقم بحسابك للأبد.</small>
            </div>

            <button onclick="handleWithdraw()" class="action-btn" style="width:100%">طلب سحب</button>
        </div>
    </div>
    `;

    // Dynamic Info Update
    const methodSel = $('dep-method');
    const infoDiv = $('dep-info');
    const updateInfo = () => {
        const m = methodSel.value;
        infoDiv.innerHTML = `
            <p>يرجى تحويل المبلغ إلى حساب التاجر:</p>
            <h3 style="color:var(--gold)">${CONFIG.COMPANY_ACCOUNTS[m]}</h3>
            <p style="font-size:0.9rem; color:#aaa">تأكد من إدخال المعرف <b>${currentUser.id}</b> في الملاحظات.</p>
        `;
    };
    methodSel.onchange = updateInfo;
    updateInfo();
}

window.showSection = (sec) => {
    $('section-deposit').style.display = sec === 'deposit' ? 'block' : 'none';
    $('section-withdraw').style.display = sec === 'withdraw' ? 'block' : 'none';
    $('btn-deposit').style.background = sec === 'deposit' ? 'var(--gold)' : 'rgba(255,255,255,0.1)';
    $('btn-withdraw').style.background = sec === 'withdraw' ? 'var(--gold)' : 'rgba(255,255,255,0.1)';
};

window.handleDeposit = async () => {
    const amount = Number($('dep-amount').value);
    const method = $('dep-method').value;
    const txid = $('dep-txid').value;

    if (amount < CONFIG.MIN_DEP) return alert(`أقل مبلغ للإيداع ${CONFIG.MIN_DEP}`);
    if (!txid) return alert('يرجى إدخال رقم العملية');

    try {
        const res = await axios.post(`${API_URL}/api/bank/deposit`, {
            userId: currentUser.id,
            amount,
            method,
            transactionId: txid,
            proof: 'Manual'
        });
        alert(res.data.message);
        renderBanking(); // Reset form
    } catch (e) {
        alert(e.response?.data?.error || 'فشل الطلب');
    }
};

window.handleWithdraw = async () => {
    const amount = Number($('wd-amount').value);
    const method = $('wd-method').value;
    const phone = $('wd-phone').value;

    if (!phone || phone.length < 9) return alert('يرجى إدخال رقم هاتف صحيح');
    if (amount < 50000) return alert('الحد الأدنى للسحب 50,000');

    try {
        const res = await axios.post(`${API_URL}/api/bank/withdraw`, {
            userId: currentUser.id,
            amount,
            method,
            phone // Send phone instead of account
        });
        alert(res.data.message);
        // Optimistic update
        currentUser.balance -= amount;
        updateBalanceUI();
        renderBanking();
    } catch (e) {
        alert(e.response?.data?.error || 'فشل الطلب');
    }
};

function initMultipliers() {
    const buckets = $('betting-sections');
    if (!buckets) return;
    buckets.innerHTML = '';
    CONFIG.MULTIPLIERS.forEach((m, i) => {
        const d = document.createElement('div');
        d.className = 'bucket';
        d.innerHTML = `<span>x${m}</span>`;
        if (m === 'retry') d.innerHTML = '<span>↺</span>';
        const clrs = ['#f87171', '#fb923c', '#facc15', '#a3e635', '#10b981', '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#f472b6'];
        d.style.borderBottom = `3px solid ${clrs[i]}`;
        buckets.appendChild(d);
    });
}


// Utils


window.onload = init;
