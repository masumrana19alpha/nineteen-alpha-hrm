-- Fix Admin Password to the correct bcrypt hash for 'Admin@19Alpha'
-- PostgreSQL's pgcrypto extension is used to generate the hash securely
UPDATE users 
SET password_hash = crypt('Admin@19Alpha', gen_salt('bf', 12))
WHERE username = 'admin';
