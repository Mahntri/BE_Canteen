export const checkPermission = (requiredCode) => {
  return (req, res, next) => {
    const { permissions, role } = req.user || {};
    if (role === 'ADMIN') return next();

    if (permissions && Array.isArray(permissions) && permissions.includes(requiredCode)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Truy cập bị từ chối. Bạn cần quyền: [${requiredCode}]`
    });
  };
};

export const requireAnyRole = (...roles) => {
  return (req, res, next) => {
    const { role } = req.user || {};

    if (!role) {
      return res.status(401).json({ success: false, message: "Unauthorized: Phiên làm việc hết hạn" });
    }

    if (!roles.includes(role)) {
      return res.status(403).json({ success: false, message: "Forbidden: Bạn không thuộc nhóm quyền yêu cầu" });
    }
    
    next();
  };
};