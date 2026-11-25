import { asyncHandler } from '../../utils/errors.js';
import { changeUserPassword, getCurrentUserProfile, loginUser } from './auth.service.js';

export const login = asyncHandler(async (req, res) => {
  const { identifier, username, email, password } = req.body || {};
  const result = await loginUser({
    identifier: identifier || username || email,
    password,
    ipAddress: req.ip,
  });

  res.cookie('bms_token', result.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    data: result,
  });
});

export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie('bms_token');
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const me = asyncHandler(async (req, res) => {
  const profile = await getCurrentUserProfile(req.user.id);
  res.json({
    success: true,
    data: profile,
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const result = await changeUserPassword({
    userId: req.user.id,
    username: req.user.username,
    currentPassword,
    newPassword,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: result,
  });
});
