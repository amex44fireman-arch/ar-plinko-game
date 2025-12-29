-- AR GAME DATABASE SCHEMA
-- Import this file into your MySQL Database

CREATE DATABASE IF NOT EXISTS ar_game_db;
USE ar_game_db;

-- 1. Users Table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    balance DECIMAL(15, 2) DEFAULT 0.00,
    debt DECIMAL(15, 2) DEFAULT 0.00,
    role ENUM('user', 'admin') DEFAULT 'user',
    energy INT DEFAULT 15,
    accumulated_profit DECIMAL(15, 2) DEFAULT 0.00,
    last_energy_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_withdrawal DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Transactions Table
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    type ENUM('deposit', 'withdraw', 'game_loss', 'game_win') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    method VARCHAR(50), -- SyriaCash, ShamCash, etc.
    proof TEXT, -- URL or Base64 of receipt image
    transaction_id VARCHAR(100), -- Manual transaction ID from provider
    status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. House Wallet Logs (Optional, for detailed tracking)
CREATE TABLE house_revenue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    amount DECIMAL(15, 2) NOT NULL,
    source_user_id INT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- SEED ADMIN ACCOUNT ---
-- Email: admin@ar-game.com
-- Password: (hashed version of 'AdminPass2025')
-- We insert a row using the correct column names.
INSERT INTO users (first_name, last_name, email, password, role, balance)
VALUES ('System', 'Admin', 'admin@ar-game.com', '$2a$10$7v6NfG6/f6zXG6vXG6vXG6vXG6vXG6vXG6vXG6vXG6vXG6vX', 'admin', 0.00); 
-- Note: Replace the hash above with a real bcrypt hash if you can generate one, or just register the admin via the UI.
