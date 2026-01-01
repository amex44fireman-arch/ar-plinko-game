const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const path = require('path');

/**
 * AR GAME SERVER - ULTRA STABLE EDITION
 * Rebuilt to resolve persistent Network Errors while preserving 100% features.
 */

const app = express();
const PORT = process.env.PORT || 3000;

// Global Error Catching (Bypasses crashes)
process.on('uncaughtException', (err) => console.error('💥 CRASH PREVENTED:', err));
process.on('unhandledRejection', (reason) => console.error('💥 REJECTION PREVENTED:', reason));

// --- 🌐 GLOBAL CONFIG ---
// Define the SyriaTel Cash configuration locally or via env
const SYRIATEL_CASH_CONFIG = {
    MERCHANT_ID: process.env.SYRIATEL_MERCHANT_ID || 'YOUR_MERCHANT_ID_HERE',
    API_KEY: process.env.SYRIATEL_API_KEY || 'YOUR_API_KEY_HERE',
    WALLET_NUMBER: process.env.SYRIATEL_WALLET || '9639########',
    AUTO_TRANSFER: true
};

// --- 🛡️ NON-NEGOTIABLE CORS & SECURITY ---
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- 📝 REQUEST LOGGING ---
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --- 🗄️ DATABASE POOL WITH RECONNECT LOGIC ---
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ar_game_db',
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
};

const pool = mysql.createPool(dbConfig);
const db = pool.promise(); // Use Promise-based pool for cleaner async/await

// DB Verification
pool.getConnection((err, conn) => {
    if (err) console.error('❌ CRITICAL: DB CONNECTION FAILED:', err.message);
    else {
        console.log('✅ DATABASE LINKED: SYSTEM READY');
        conn.release();
        runMigrations();
    }
});

function runMigrations() {
    const migrations = [
        `ALTER TABLE transactions MODIFY COLUMN type ENUM('deposit', 'withdraw', 'game_loss', 'game_win', 'loan', 'energy_purchase', 'sweep') NOT NULL`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(255) DEFAULT NULL`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS debt DOUBLE DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS accumulated_profit DOUBLE DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS energy INT DEFAULT 15`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_energy_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    ];
    migrations.forEach(sql => {
        db.execute(sql).catch(e => console.log('ℹ️ Migration Info:', e.message));
    });
}

// --- 🛠️ INTERNAL UTILITIES ---
async function fireAndForgetTransfer(amount, description) {
    if (SYRIATEL_CASH_CONFIG.MERCHANT_ID === 'YOUR_MERCHANT_ID_HERE' || !SYRIATEL_CASH_CONFIG.AUTO_TRANSFER) {
        console.warn(`[CASH] Skipping transfer: Merchant ID not configured.`);
        return;
    }
    try {
        await axios.post('https://api.syriatel.sy/v1/cash/transfer-to-merchant', {
            merchant_id: SYRIATEL_CASH_CONFIG.MERCHANT_ID,
            api_key: SYRIATEL_CASH_CONFIG.API_KEY,
            amount: amount,
            recipient_wallet: SYRIATEL_CASH_CONFIG.WALLET_NUMBER,
            remark: description
        }, { timeout: 15000 });
    } catch (e) {
        console.error(`[CASH] Transfer Error:`, e.message);
    }
}

// --- 📡 CORE HEALTH ROUTES ---
app.get('/', (req, res) => res.status(200).send('AR GAME SERVER IS OPERATIONAL 🚀'));
app.get('/api/ping', (req, res) => res.status(200).json({ status: 'alive', version: '5.0.0-PRO' }));
app.get('/health', (req, res) => res.json({ status: 'UP', db: 'ready', time: new Date() }));

// --- 👤 AUTHENTICATION SYSTEM ---
app.post('/api/auth/register', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (first_name, last_name, email, password, balance) VALUES (?, ?, ?, ?, 0)',
            [firstName, lastName, email, hashedPassword]
        );
        res.json({ success: true, userId: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
        res.status(500).json({ error: 'فشل التسجيل' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: 'الحساب غير موجود' });

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'كلمة المرور خاطئة' });

        delete user.password;
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: 'مشكلة في تسجيل الدخول' });
    }
});

app.get('/api/auth/me/:email', async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT id, first_name, last_name, email, balance, role, energy, debt, accumulated_profit, phone FROM users WHERE email = ?',
            [req.params.email]
        );
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user: users[0] });
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

// --- ⚡ ENERGY SYSTEM ---
const MAX_ENERGY = 15;
app.get('/api/game/energy/:userId', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT energy, last_energy_update FROM users WHERE id = ?', [req.params.userId]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        let user = users[0];
        const now = new Date();
        const lastUpdate = new Date(user.last_energy_update);
        const isNewDay = now.getDate() !== lastUpdate.getDate() || now.getMonth() !== lastUpdate.getMonth();

        if (isNewDay) {
            await db.execute('UPDATE users SET energy = ?, last_energy_update = NOW() WHERE id = ?', [MAX_ENERGY, req.params.userId]);
            res.json({ energy: MAX_ENERGY, max: MAX_ENERGY });
        } else {
            res.json({ energy: user.energy, max: MAX_ENERGY });
        }
    } catch (err) {
        res.status(500).json({ error: 'Error fetching energy' });
    }
});

// --- 🎮 GAME CORE LOGIC ---
app.post('/api/game/result', async (req, res) => {
    const { userId, betAmount, multiplier } = req.body;
    try {
        const [users] = await db.execute('SELECT energy, role, balance, accumulated_profit, debt FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ error: 'User error' });

        const user = users[0];
        if (user.role !== 'admin' && user.energy <= 0) return res.status(403).json({ error: 'نظام الطاقة انتهى لليوم' });
        if (user.balance < betAmount) return res.status(400).json({ error: 'رصيدك غير كافٍ' });

        const houseCut = betAmount * 0.10;
        const effectiveBet = betAmount - houseCut;
        let finalPayout = effectiveBet * multiplier;

        let debtRepaid = 0;
        if (finalPayout > 0 && user.debt > 0) {
            debtRepaid = Math.min(finalPayout, user.debt);
            finalPayout -= debtRepaid;
        }

        let newAccumulated = (Number(user.accumulated_profit) || 0) + houseCut;

        // SWEEP Logic (x0)
        if (multiplier === 0) {
            if (newAccumulated > 0) {
                fireAndForgetTransfer(newAccumulated, `Sweep x0 - User ${userId}`);
                await db.execute('INSERT INTO transactions (user_id, type, amount, status, method) VALUES (?, "sweep", ?, "success", "internal")', [userId, newAccumulated]);
            }
            newAccumulated = 0;
        }

        const energyDec = (user.role === 'admin') ? 0 : 1;
        await db.execute(
            'UPDATE users SET balance = balance - ? + ?, debt = debt - ?, energy = energy - ?, accumulated_profit = ? WHERE id = ?',
            [betAmount, finalPayout, debtRepaid, energyDec, newAccumulated, userId]
        );

        // Logs
        await db.execute('INSERT INTO transactions (user_id, type, amount, status) VALUES (?, "game_loss", ?, "success")', [userId, betAmount]);
        if (finalPayout + debtRepaid > 0) {
            await db.execute('INSERT INTO transactions (user_id, type, amount, status) VALUES (?, "game_win", ?, "success")', [userId, (finalPayout + debtRepaid)]);
        }

        res.json({
            success: true,
            newBalance: Number(user.balance) - Number(betAmount) + finalPayout,
            payout: (finalPayout + debtRepaid),
            debtPaid: debtRepaid,
            remainingEnergy: user.energy - energyDec
        });
    } catch (err) {
        console.error('Game Result Error:', err);
        res.status(500).json({ error: 'Backend logic failure' });
    }
});

// --- 💰 BANKING & FINANCES ---
app.post('/api/bank/buy-energy', async (req, res) => {
    const { userId, packageId } = req.body;
    const packs = { 'small': { p: 5000, e: 15 }, 'large': { p: 15000, e: 50 } };
    const pack = packs[packageId];
    if (!pack) return res.status(400).json({ error: 'Invalid pack' });

    try {
        const [users] = await db.execute('SELECT balance FROM users WHERE id = ?', [userId]);
        if (users[0].balance < pack.p) return res.status(400).json({ error: 'Inadequate funds' });

        await db.execute('UPDATE users SET balance = balance - ?, energy = energy + ? WHERE id = ?', [pack.p, pack.e, userId]);
        await db.execute('INSERT INTO transactions (user_id, type, amount, status, method) VALUES (?, "energy_purchase", ?, "success", "internal")', [userId, pack.p]);

        fireAndForgetTransfer(pack.p, `Energy Purchase - User ${userId}`);
        res.json({ success: true, newEnergy: pack.e });
    } catch (err) {
        res.status(500).json({ error: 'Purchase failed' });
    }
});

app.post('/api/bank/deposit', async (req, res) => {
    const { userId, amount, method, proof, transactionId } = req.body;
    try {
        await db.execute(
            'INSERT INTO transactions (user_id, type, amount, method, proof, transaction_id, status) VALUES (?, "deposit", ?, ?, ?, ?, "pending")',
            [userId, amount, method, proof, transactionId]
        );
        res.json({ success: true, message: 'طلب الإيداع بانتظار المراجعة' });
    } catch (err) {
        res.status(500).json({ error: 'Deposit request failed' });
    }
});

app.post('/api/bank/withdraw', async (req, res) => {
    const { userId, amount, method, phone } = req.body;
    try {
        const [users] = await db.execute('SELECT balance, last_withdrawal, phone FROM users WHERE id = ?', [userId]);
        const user = users[0];

        if (user.phone && user.phone !== phone) return res.status(403).json({ error: 'الرقم لا يطابق الرقم المرتبط بالحساب' });
        if (!user.phone) await db.execute('UPDATE users SET phone = ? WHERE id = ?', [phone, userId]);

        if (amount < 50000) return res.status(400).json({ error: 'الحد الأدنى 50 ألف' });
        if (amount > user.balance * 0.5) return res.status(400).json({ error: 'لا يمكن سحب أكثر من 50% من الرصيد' });

        if (user.last_withdrawal) {
            const diff = (new Date() - new Date(user.last_withdrawal)) / 3600000;
            if (diff < 24) return res.status(400).json({ error: 'انتظر 24 ساعة بين السحوبات' });
        }

        await db.execute('INSERT INTO transactions (user_id, type, amount, method, transaction_id, status) VALUES (?, "withdraw", ?, ?, ?, "pending")', [userId, amount, method, phone]);
        await db.execute('UPDATE users SET balance = balance - ?, last_withdrawal = NOW() WHERE id = ?', [amount, userId]);
        res.json({ success: true, message: 'تم إرسال طلب السحب' });
    } catch (err) {
        res.status(500).json({ error: 'Withdrawal failed' });
    }
});

app.post('/api/bank/loan', async (req, res) => {
    const { userId } = req.body;
    try {
        const [users] = await db.execute('SELECT balance, debt FROM users WHERE id = ?', [userId]);
        if (users[0].debt > 0) return res.status(400).json({ error: 'سدد دينك السابق أولاً' });
        if (users[0].balance > 1000) return res.status(400).json({ error: 'رصيدك كافٍ حالياً' });

        await db.execute('INSERT INTO transactions (user_id, type, amount, status) VALUES (?, "loan", 10000, "pending")', [userId]);
        res.json({ success: true, message: 'طلب السلفة قيد المعالجة' });
    } catch (err) {
        res.status(500).json({ error: 'Loan request failed' });
    }
});

// --- 👑 ADMIN DASHBOARD ---
const OWNER_PIN = '6543210';

app.get('/api/admin/users', async (req, res) => {
    try {
        const [users] = await db.execute(`
            SELECT u.*, 
            (SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('type', t.type, 'amount', t.amount, 'status', t.status, 'date', t.created_at)), JSON_ARRAY())
             FROM transactions t WHERE t.user_id = u.id) as activity
            FROM users u ORDER BY u.created_at DESC`);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Admin fetch failed' });
    }
});

app.get('/api/admin/transactions', async (req, res) => {
    try {
        const [txns] = await db.execute('SELECT t.*, u.email as user_email FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.status = "pending" ORDER BY t.created_at DESC');
        res.json(txns);
    } catch (err) {
        res.status(500).json({ error: 'TXN fetch failed' });
    }
});

app.post('/api/admin/revenue', async (req, res) => {
    if (req.body.pin !== OWNER_PIN) return res.status(403).json({ error: 'PIN Wrong' });
    try {
        const [income] = await db.execute('SELECT SUM(amount) as sum FROM transactions WHERE type="game_loss" AND status="success"');
        const [wins] = await db.execute('SELECT SUM(amount) as sum FROM transactions WHERE type="game_win" AND status="success"');
        const [energy] = await db.execute('SELECT SUM(amount) as sum FROM transactions WHERE type="energy_purchase" AND status="success"');
        const [deps] = await db.execute('SELECT SUM(amount) as sum FROM transactions WHERE type="deposit" AND status="success"');
        const [withs] = await db.execute('SELECT SUM(amount) as sum FROM transactions WHERE type="withdraw" AND status="success"');
        const [debts] = await db.execute('SELECT SUM(debt) as sum FROM users');

        const profit = (income[0].sum || 0) - (wins[0].sum || 0) + (energy[0].sum || 0);
        res.json({
            success: true,
            revenue: {
                total: profit,
                game_losses: income[0].sum || 0,
                game_wins: wins[0].sum || 0,
                energy_sales: energy[0].sum || 0,
                total_deposits: deps[0].sum || 0,
                total_withdrawals: withs[0].sum || 0,
                active_loans: debts[0].sum || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Stats failed' });
    }
});

app.get('/api/admin/all-transactions', async (req, res) => {
    try {
        const [txns] = await db.execute('SELECT t.*, u.email as user_email FROM transactions t JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 200');
        res.json(txns);
    } catch (err) {
        res.status(500).json({ error: 'History fetch failed' });
    }
});

app.get('/api/admin/debug', async (req, res) => {
    try {
        const [[u]] = await db.execute('SELECT COUNT(*) as users FROM users');
        const [[t]] = await db.execute('SELECT COUNT(*) as txns FROM transactions');
        res.json({ users: u.users, txns: t.txns, time: new Date() });
    } catch (err) {
        res.status(500).json({ error: 'Debug failed' });
    }
});

app.post('/api/admin/process', async (req, res) => {
    const { txnId, action } = req.body;
    try {
        const [txns] = await db.execute('SELECT * FROM transactions WHERE id = ?', [txnId]);
        if (txns.length === 0) return res.status(404).json({ error: 'Not found' });
        const txn = txns[0];

        if (action === 'approve') {
            if (txn.type === 'deposit') await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [txn.amount, txn.user_id]);
            else if (txn.type === 'loan') await db.execute('UPDATE users SET balance = balance + ?, debt = debt + ? WHERE id = ?', [txn.amount, txn.amount, txn.user_id]);
            await db.execute('UPDATE transactions SET status = "success" WHERE id = ?', [txnId]);
        } else {
            if (txn.type === 'withdraw') await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [txn.amount, txn.user_id]);
            await db.execute('UPDATE transactions SET status = "failed" WHERE id = ?', [txnId]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Process failed' });
    }
});

// --- 🚀 INITIALIZATION ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 AR GAME MASTER SERVER LOADED`);
    console.log(`⭐ VERSION: 5.0.0`);
    console.log(`📍 PORT: ${PORT}`);
    console.log(`----------------------------------\n`);
});
