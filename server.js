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
        API_KEY: process.env.SYRIA_CASH_KEY || 'YOUR_SYRIA_CASH_KEY',
        MERCHANT_ID: process.env.SYRIA_CASH_MERCHANT || 'YOUR_MERCHANT_ID',
        ENDPOINT: process.env.SYRIA_CASH_URL || 'https://apisyria.com/api/v1'
    },
    SHAM_CASH: {
        // Placeholder for future integration
        API_KEY: 'PENDING',
        ENDPOINT: 'PENDING'
    }
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- Database Connection ---
// Replace with your real SQL credentials provided by your host
// Database Connection using Environment Variables for Security
// Database Connection Pool (Auto-Reconnecting)
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ar_game_db',
    port: process.env.DB_PORT || 3306,
    connectTimeout: 20000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test Connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.stack);
    } else {
        console.log('✅ Connected to MySQL Database (Pool).');
        connection.release();
    }
});

// --- Config ---
const ADMIN_WALLET_ID = 1; // The ID of your admin account in SQL

// --- Routes ---

// 0. Connectivity Ping
app.get('/api/ping', (req, res) => res.json({ status: 'alive' }));

// --- ENERGY SYSTEM ---
// Reset Energy Daily logic should ideally be a CRON job.
// Here we do a "lazy reset" when the user requests energy info.
const MAX_ENERGY = 15;
const ENERGY_PRICE = 5000;

app.get('/api/game/energy/:userId', (req, res) => {
    const { userId } = req.params;
    db.query('SELECT energy, last_energy_update FROM users WHERE id = ?', [userId], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: 'User error' });

        let user = results[0];
        const now = new Date();
        const lastUpdate = new Date(user.last_energy_update);

        // Check if day changed
        const isNewDay = now.getDate() !== lastUpdate.getDate() || now.getMonth() !== lastUpdate.getMonth();

        if (isNewDay) {
            // Reset to 15
            db.query('UPDATE users SET energy = ?, last_energy_update = NOW() WHERE id = ?', [MAX_ENERGY, userId]);
            res.json({ energy: MAX_ENERGY, max: MAX_ENERGY });
        } else {
            res.json({ energy: user.energy, max: MAX_ENERGY });
        }
    });
});

app.post('/api/game/buy-energy', (req, res) => {
    const { userId } = req.body;
    // Buying 15 more attempts
    db.query('SELECT balance FROM users WHERE id = ?', [userId], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: 'Error' });

        const balance = results[0].balance;
        if (balance < ENERGY_PRICE) return res.status(400).json({ error: 'Insufficient funds' });

        db.query('UPDATE users SET balance = balance - ?, energy = energy + 15 WHERE id = ?', [ENERGY_PRICE, userId], (err) => {
            if (err) return res.status(500).json({ error: 'Update failed' });
            res.json({ success: true, message: 'Energy refreshed!' });
        });
    });
});

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

// 1. Unified Game Result (Replaces old logic)
app.post('/api/game/result', async (req, res) => {
    const { userId, betAmount, multiplier, multiplierIndex } = req.body;

    // Check Energy & Fundamentals
    db.query('SELECT energy, role, balance, accumulated_profit, debt FROM users WHERE id = ?', [userId], async (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: 'User error' });
        const user = results[0];

        if (user.role !== 'admin' && user.energy <= 0) {
            return res.status(403).json({ error: 'No energy' });
        }

        if (user.balance < betAmount) {
            return res.status(400).json({ error: 'Insufficient funds' });
        }

        // Logic:
        // 1. Bet is 1000.
        // 2. We "skim" 10% immediately for the House Accumulator.
        //    EntryTax = 1000 * 0.10 = 100.
        //    EffectiveBet = 900.
        // 3. User plays with 900.
        // 4. If Win (x2): Payout = 1800.
        //    House Net from this round = +100 (skim) - 900 (payout from house funds? No).
        //    Wait, "House Edge" means House *keeps* the edge.
        //    If user wins, House loses.
        //    But user says "I take 10%... cumulative".
        //    Let's stick to the User's "Invisible Tax":
        //    Calculated Payout = (Bet * 0.9) * Multiplier.
        //    The "missing" 10% (Bet * 0.1) is added to `accumulated_profit`.

        const houseCut = betAmount * 0.10;
        const effectiveBet = betAmount - houseCut;
        let finalPayout = effectiveBet * multiplier;

        // Auto-Repay Debt Logic
        let debtRepaid = 0;
        if (finalPayout > 0 && user.debt > 0) {
            debtRepaid = Math.min(finalPayout, user.debt);
            finalPayout -= debtRepaid; // Payout reduced by repayment amount
            // finalPayout is the amount going to user balance
            // debtRepaid is amount deducted from debt
        }

        // Accumulate the cut
        let newAccumulated = (Number(user.accumulated_profit) || 0) + houseCut;

        // Multiplier 0 Handling (The Sweep)
        let transferMsg = null;
        if (multiplier === 0) {
            // Total Loss for User.
            // House gains: The Bet Amount (1000).
            // PLUS the accumulated profit from previous rounds?
            // "When ball on *0, profits convert to my account".
            // So we transfer (Bet + Accumulated).
            const transferAmount = betAmount + newAccumulated;

            // Log transfer
            console.log(`[SYRIATEL] 💰 JACKPOT SWEEP! Transferring ${transferAmount} SYP`);

            // Reset Accumulator after sweep
            newAccumulated = 0;
            transferMsg = transferAmount;
        }

        const energyDec = (user.role === 'admin') ? 0 : 1;

        // Update with Debt Logic
        db.query(`UPDATE users SET balance = balance + ?, debt = debt - ?, energy = energy - ?, accumulated_profit = ? WHERE id = ?`,
            [finalPayout, debtRepaid, energyDec, newAccumulated, userId],
            async (err) => {
                if (err) return res.status(500).json({ error: err.message });

                // If sweep happened, we theoretically call the API here
                if (transferMsg) {
                    // fireAndForgetTransfer(userId, transferMsg);
                }

                res.json({
                    success: true,
                    newBalance: Number(user.balance) - Number(betAmount) + finalPayout,
                    payout: (finalPayout + debtRepaid), // Show full win to user contextually? No, user balance updates with net.
                    // Actually, let's return 'netPayout' vs 'debtPaid' so UI can show it specially if needed.
                    debtPaid: debtRepaid,
                    remainingEnergy: user.energy - energyDec
                });
            }
        );
    });
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

// 3. User Withdraw (Updated with Limits)
app.post('/api/bank/withdraw', async (req, res) => {
    const { userId, amount, method, phone } = req.body;

    if (!phone || phone.length < 9) {
        return res.status(400).json({ error: 'عذراً، يجب إدخال رقم الهاتف بشكل صحيح لربطه بالحساب.' });
    }

    db.query('SELECT balance, last_withdrawal, phone FROM users WHERE id = ?', [userId], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: 'User error' });

        const user = results[0];

        // 0. Phone Binding Security Check
        if (user.phone) {
            if (user.phone !== phone) {
                return res.status(403).json({ error: 'مرفوض: رقم الهاتف لا يطابق الرقم المرتبط بهذا الحساب (ID).' });
            }
        } else {
            db.query('UPDATE users SET phone = ? WHERE id = ?', [phone, userId]);
        }

        // 1. Min Withdrawal
        if (amount < 50000) return res.status(400).json({ error: 'الحد الأدنى للسحب هو 50,000 ل.س' });

        // 2. Frequency Check
        if (user.last_withdrawal) {
            const last = new Date(user.last_withdrawal);
            const now = new Date();
            const diffHours = (now - last) / (1000 * 60 * 60);
            if (diffHours < 24) return res.status(400).json({ error: 'يمكنك السحب مرة واحدة فقط كل 24 ساعة.' });
        }

        // 3. Gradual Limit
        const maxWithdrawal = user.balance * 0.50;
        if (amount > maxWithdrawal) {
            return res.status(400).json({ error: `السحب التدريجي: لا يمكنك سحب أكثر من 50% من رصيدك (${maxWithdrawal.toFixed(0)} ل.س)` });
        }

        if (user.balance < amount) return res.status(400).json({ error: 'رصيد غير كاف' });

        const sql = `INSERT INTO transactions (user_id, type, amount, method, transaction_id, status) VALUES (?, 'withdraw', ?, ?, ?, 'pending')`;
        db.query(sql, [userId, amount, method, phone], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            db.query('UPDATE users SET balance = balance - ?, last_withdrawal = NOW() WHERE id = ?', [amount, userId]);
            res.json({ id: result.insertId, status: 'pending', message: 'تم استلام طلب السحب. سيتم تحويل المبلغ للرقم المربوط بحسابك.' });
        });
    });
});

// 4. LOAN SYSTEM (Request Based)
app.post('/api/bank/loan', (req, res) => {
    const { userId } = req.body;
    const LOAN_AMOUNT = 10000;

    db.query('SELECT balance, debt FROM users WHERE id = ?', [userId], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: 'User not found' });
        const user = results[0];

        if (user.debt > 0) return res.status(400).json({ error: 'عذراً، لديك دين سابق يجب سداده أولاً.' });
        if (user.balance > 1000) return res.status(400).json({ error: 'رصيدك كافٍ ولا تحتاج لدين حالياً.' });

        // Check for existing pending loan
        db.query('SELECT id FROM transactions WHERE user_id = ? AND type = "loan" AND status = "pending"', [userId], (err, pending) => {
            if (pending && pending.length > 0) return res.status(400).json({ error: 'لديك طلب سلفة قيد المراجعة بالفعل.' });

            // Create Pending Request
            const sql = `INSERT INTO transactions (user_id, type, amount, status, created_at) VALUES (?, 'loan', ?, 'pending', NOW())`;
            db.query(sql, [userId, LOAN_AMOUNT], (err, result) => {
                if (err) return res.status(500).json({ error: 'Failed to request loan' });
                res.json({ success: true, message: 'تم إرسال طلب السلفة (10,000) إلى الإدارة للمراجعة.', pending: true });
            });
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
// Process transaction (Approve/Reject)
app.post('/api/admin/process', (req, res) => {
    const { txnId, action, adminId } = req.body;

    db.query('SELECT * FROM transactions WHERE id = ?', [txnId], (err, txns) => {
        if (err || txns.length === 0) return res.status(404).json({ error: 'Transaction not found' });
        const txn = txns[0];

        if (action === 'approve') {
            const newStatus = 'success';

            if (txn.type === 'deposit') {
                db.query('UPDATE users SET balance = balance + ? WHERE id = ?', [txn.amount, txn.user_id], (err) => {
                    db.query('UPDATE transactions SET status = ? WHERE id = ?', [newStatus, txnId]);
                    res.json({ success: true, userId: txn.user_id });
                });
            } else if (txn.type === 'withdraw') {
                db.query('UPDATE transactions SET status = ? WHERE id = ?', [newStatus, txnId]);
                res.json({ success: true });
            } else if (txn.type === 'loan') {
                // Approve Loan: Add Balance AND Add Debt
                db.query('UPDATE users SET balance = balance + ?, debt = debt + ? WHERE id = ?', [txn.amount, txn.amount, txn.user_id], (err) => {
                    db.query('UPDATE transactions SET status = ? WHERE id = ?', [newStatus, txnId]);
                    res.json({ success: true });
                });
            } else {
                // Fallback
                db.query('UPDATE transactions SET status = ? WHERE id = ?', [newStatus, txnId]);
                res.json({ success: true });
            }

        } else {
            // REJECT
            const newStatus = 'failed';
            if (txn.type === 'withdraw') {
                // Refund if withdraw rejected
                db.query('UPDATE users SET balance = balance + ? WHERE id = ?', [txn.amount, txn.user_id], () => {
                    db.query('UPDATE transactions SET status = ? WHERE id = ?', [newStatus, txnId]);
                    res.json({ success: true, message: 'Transaction rejected and refunded' });
                });
            } else {
                // Deposit or Loan rejected = No user change
                db.query('UPDATE transactions SET status = ? WHERE id = ?', [newStatus, txnId]);
                res.json({ success: true });
            }
        }
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 AR Game API Server running on port ${PORT}`);
});
