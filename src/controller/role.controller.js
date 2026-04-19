import prisma from "../config/prisma.js";

export const getAllRoles = async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { id: 'asc' }
    });
    
    return res.status(200).json({ 
      success: true, 
      message: "Lấy danh sách vai trò thành công",
      data: roles 
    });
  } catch (error) {
    console.error("Lỗi getAllRoles:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Lỗi hệ thống khi lấy danh sách vai trò",
      error_detail: error.message 
    });
  }
};