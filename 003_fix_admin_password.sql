-- অ্যাডমিনের পাসওয়ার্ড ১০০% নিশ্চিতভাবে 'Admin@19Alpha' সেট করা হচ্ছে
UPDATE users 
SET password_hash = crypt('Admin@19Alpha', gen_salt('bf', 12))
WHERE username = 'admin';
