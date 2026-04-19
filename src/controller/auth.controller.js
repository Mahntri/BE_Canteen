import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import prisma from "../config/prisma.js";
import { validateLogin } from '../validation/auth.validation.js';

dotenv.config();

const AuthController = {
  login: async (req, res) => {
    try {
      const validation = validateLogin(req.body);
      if (!validation.isValid) {
        return res.status(400).json({ success: false, message: validation.message });
      }

      const { email, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { email: email },
        include: { 
          role: {
            include: { role_permissions: { include: { permissions: true } } }
          },
          user_permissions: { include: { permissions: true } },
          organization: true 
        } 
      });
      
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });
      }

      if (user.isActive === false) {
        return res.status(403).json({ 
          success: false, 
          message: 'Tài khoản của bạn hiện đang bị khóa. Vui lòng liên hệ quản trị viên.' 
        });
      }

      const roleCodes = user.role?.role_permissions.map(rp => rp.permissions.code) || [];
      const userCodes = user.user_permissions.map(up => up.permissions.code) || [];
      const finalPermissions = [...new Set([...roleCodes, ...userCodes])];

      const payload = { 
        userId: user.id, 
        role: user.role?.name || 'GUEST',
        orgId: user.orgId || null,
        permissions: finalPermissions 
      };

      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { 
        expiresIn: process.env.JWT_EXPIRES_IN || '1d'
      });

      return res.status(200).json({
        success: true,
        message: 'Đăng nhập thành công',
        access_token: accessToken,
        user: {
          id: user.id,
          full_name: user.fullName,
          role: user.role?.name,
          orgId: user.orgId,              
          orgName: user.organization?.name,
          permissions: finalPermissions 
        }
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: 'Lỗi Server' });
    }
  },

  getMe: async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { role: true, department: true }
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User không tồn tại' });
      }

      const { passwordHash, ...userData } = user;
      return res.status(200).json({ success: true, data: userData });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Lỗi Server', error: error.message });
    }
  }
};

export default AuthController;