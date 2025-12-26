/**
 * AR GAME SERVER (Express.js + MySQL)
 * Deploy this file to your VPS (Virtual Private Server).
 * 
 * SETUP:
 * 1. Install Node.js on VPS.
 * 2. Run: npm install express mysql2 cors body-parser bcrypt
 * 3. Run: node server.js
 */

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Switched to bcryptjs for faster Render builds

const app = express();
const axios = require('axios'); // Remember to run: npm install axios
const PORT = process.env.PORT || 3000;

// --- PAYMENT API CONFIGURATION ---
// IMPORTANT: Put your real keys here. Do NOT share this file with anyone.
const PAYMENT_CONFIG = {
    SYRIA_CASH: {
        API_KEY: process.env.SYRIA_CASH_KEY || 'ضع_مفتاح_الـAPI_هنا_(الرمز_السري)',
        MERCHANT_ID: process.env.SYRIA_CASH_MERCHANT || 'رقم_التاجر_الخاص_بك_00738093',
        ENDPOINT: 'https://apisyria.com/api/v1'
    },
    SHAM_CASH: {
        API_KEY: process.env.SHAM_CASH_KEY || 'YOUR_SHAM_CASH_API_KEY',
        SECRET: process.env.SHAM_CASH_SECRET || 'YOUR_SHAM_CASH_SECRET',
        ENDPOINT: 'https://api.shamcash.com/api' // Update this based on their docs
    }
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- Database Connection ---
// Replace with your real SQL credentials provided by your host
// Database Connection using Environment Variables for Security
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ar_game_db'
});

db.connect(err => {
    if (err) {
        console.error('❌ Database connection failed:', err.stack);
        return;
    }
    console.log('✅ Connected to MySQL Database.');
});

// --- Config ---
const ADMIN_WALLET_ID = 1; // The ID of your admin account in SQL

// --- Routes ---

// 0. Connectivity Ping
app.get('/api/ping', (req, res) => res.json({ status: 'alive' }));

// 1. Auth: Register
app.post('/api/auth/register', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (first_name, last_name, email, password, balance) VALUES (?, ?, ?, ?, 0)`;
        db.query(sql, [firstName, lastName, email, hashedPassword], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, userId: result.insertId });
        });
    } catch (e) {
        res.status(500).json({ error: 'خطأ في معالجة البيانات' });
    }
});

// 2. Auth: Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const sql = `SELECT * FROM users WHERE email = ?`;
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(401).json({ error: 'الحساب غير موجود' });

        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'كلمة المرور خاطئة' });

        // Don't send password back
        delete user.password;
        res.json({ success: true, user });
    });
});

// --- REVENUE CONFIG (SyriaTel Cash Real API) ---
const REVENUE_RECIPIENT = '12038584'; // رقم حسابك لاستلام الأرباح
const SYRIA_CASH_MERCHANT = 'YOUR_REAL_MERCHANT_ID'; // سيتم استبداله برقم التاجر الخاص بك
const SYRIA_CASH_API_KEY = 'YOUR_REAL_API_KEY';      // سيتم استبداله بمفتاح الـ API الخاص بك

// 1. Game Revenue Logic (House Edge - 40% Automated Profit)
app.post('/api/game/loss', async (req, res) => {
    const { userId, amount } = req.body;

    console.log(`[HOUSE REVENUE] Attempting real-time transfer of ${amount} SYP to Owner (${REVENUE_RECIPIENT})`);

    try {
        // --- REAL SYRIATEL CASH API CALL ---
        /*
        const response = await axios.post(`${PAYMENT_CONFIG.SYRIA_CASH.ENDPOINT}/transfer`, {
            api_key: SYRIA_CASH_API_KEY,
            merchant: SYRIA_CASH_MERCHANT,
            amount: amount,
            receiver: REVENUE_RECIPIENT,
            description: `Profit from User ${userId}`
        });

        if (response.data.success) {
            console.log(`✅ [SUCCESS] Revenue transferred to ${REVENUE_RECIPIENT}`);
        } else {
            console.warn(`⚠️ [WARNING] Gateway rejected transfer: ${response.data.message}`);
        }
        */

        // For now, we simulate success and log locally until keys are provided
        const sql = `UPDATE users SET balance = balance + ? WHERE role = 'admin' LIMIT 1`;
        db.query(sql, [amount], (err) => {
            if (err) console.error('Database Admin update failed', err);
        });

        res.json({
            success: true,
            message: 'Profit recorded successfully. Waiting for API Keys for real transfer.'
        });

    } catch (error) {
        console.error('Revenue Transfer System Error:', error.message);
        res.status(500).json({ error: 'Gateway Connection Failed' });
    }
});

// 2. User Deposit (Manual Verification)
app.post('/api/bank/deposit', async (req, res) => {
    const { userId, amount, method, proof, transactionId } = req.body;
    console.log(`[DEPOSIT ATTEMPT] User: ${userId}, Amount: ${amount}, Method: ${method}, TXID: ${transactionId}`);

    const sql = `INSERT INTO transactions (user_id, type, amount, method, proof, transaction_id, status) VALUES (?, 'deposit', ?, ?, ?, ?, 'pending')`;
    db.query(sql, [userId, amount, method, proof, transactionId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: result.insertId, status: 'pending', message: 'طلبك قيد المراجعة - سيتم تأكيد العمل بعد مطابقة رقم العملية' });
    });
});

// 3. User Withdraw
app.post('/api/bank/withdraw', async (req, res) => {
    const { userId, amount, method, account } = req.body;
    db.query('SELECT balance FROM users WHERE id = ?', [userId], async (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!results || results.length === 0) return res.status(404).json({ error: 'User not found' });
        if (results[0].balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

        // For now, withdrawals are ALSO manual for security
        const sql = `INSERT INTO transactions (user_id, type, amount, method, proof, status) VALUES (?, 'withdraw', ?, ?, ?, 'pending')`;
        db.query(sql, [userId, amount, method, account], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            // Deduct instantly to "hold" funds, or wait? Usually hold is better.
            db.query('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, userId]);
            res.json({ success: true, message: 'تم إرسال طلب السحب للمراجعة' });
        });
    });
});

// --- ADMIN ROUTES ---

// Get all pending transactions
// Get all pending transactions for Admin
app.get('/api/admin/transactions', (req, res) => {
    const sql = `
        SELECT t.*, u.email as user_email 
        FROM transactions t 
        JOIN users u ON t.user_id = u.id 
        WHERE t.status = 'pending' 
        ORDER BY t.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Process transaction (Approve/Reject)
app.post('/api/admin/process', (req, res) => {
    const { txnId, action, adminId } = req.body;

    // 1. Get Transaction details
    db.query('SELECT * FROM transactions WHERE id = ?', [txnId], (err, txns) => {
        if (err || txns.length === 0) return res.status(404).json({ error: 'Transaction not found' });
        const txn = txns[0];

        if (action === 'approve') {
            const newStatus = 'success';
            // If it's a deposit, we ADD balance to the user
            if (txn.type === 'deposit') {
                db.query('UPDATE users SET balance = balance + ? WHERE id = ?', [txn.amount, txn.user_id], (err) => {
                    db.query('UPDATE transactions SET status = ? WHERE id = ?', [newStatus, txnId]);
                    res.json({ success: true, userId: txn.user_id });
                });
            } else {
                // Withdrawal was already deducted from balance as "hold"
                db.query('UPDATE transactions SET status = ? WHERE id = ?', [newStatus, txnId]);
                res.json({ success: true });
            }
        } else {
            // Reject: If withdrawal, refund the held amount
            if (txn.type === 'withdraw') {
                db.query('UPDATE users SET balance = balance + ? WHERE id = ?', [txn.amount, txn.user_id]);
            }
            db.query('UPDATE transactions SET status = ? WHERE id = ?', ['rejected', txnId]);
            res.json({ success: true });
        }
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 AR Game API Server running on port ${PORT}`);
});
