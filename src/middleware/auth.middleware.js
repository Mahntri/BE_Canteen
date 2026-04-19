import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const authGuard = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized: Thiếu Token' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ 
        success: false, 
        message: 'Forbidden: Token không hợp lệ hoặc hết hạn' 
      });
    }
    req.user = decodedUser;
    next();
  });
};

export const requireRole = (...roleCodes) => {
  return (req, res, next) => {
    if (!req.user || !roleCodes.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Yêu cầu quyền ${roleCodes.join(" / ")}`
      });
    }
    next();
  };
};

export const hasPermission = (requiredCode) => {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions.includes(requiredCode)) {
      return res.status(403).json({
        success: false,
        message: `Bạn không có quyền truy cập tính năng này (${requiredCode})`
      });
    }
    next();
  };
};

export const checkPermission = (requiredCode) => {
  return (req, res, next) => {
    const { permissions } = req.user;

    if (!permissions || !permissions.includes(requiredCode)) {
      return res.status(403).json({
        success: false,
        message: `Bạn không có quyền thực hiện hành động này (${requiredCode})`
      });
    }
    next();
  };
};