-- ডাটাবেসে থাকা ভুয়া পাসওয়ার্ডসহ অ্যাডমিন ইউজারটি ডিলিট করে দেওয়া হচ্ছে।
-- সার্ভার চালু হওয়ার সময় server.js নিজেই নতুন করে সঠিক পাসওয়ার্ড দিয়ে ইউজারটি তৈরি করবে।
DELETE FROM user_access_controls WHERE user_id IN (SELECT id FROM users WHERE username = 'admin');
DELETE FROM users WHERE username = 'admin';
