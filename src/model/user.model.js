import prisma from "../config/prisma.js";

const UserModel = {
  findByEmail: async (email) => {
    const user = await prisma.user.findFirst({
      where: {
        email,
        isActive: true, 
      },
      include: {
        role: {
          include: {
            role_permissions: { include: { permissions: true } }
          }
        },
        user_permissions: {
          include: { permissions: true }
        }
      }
    });

    if (!user) return null;

    const roleCodes = user.role?.role_permissions.map(rp => rp.permissions.code) || [];
    const userCodes = user.user_permissions.map(up => up.permissions.code) || [];
    const finalPermissions = [...new Set([...roleCodes, ...userCodes])];

    return {
      ...user,  
      role_code: user.role?.name ?? null,
      permissions: finalPermissions
    };
  },

  findById: async (id) => {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            role_permissions: { include: { permissions: true } }
          }
        },
        user_permissions: {
          include: { permissions: true }
        },
        department: true,
        organization: true
      }
    });

    if (!user) return null;

    const roleCodes = user.role?.role_permissions.map(rp => rp.permissions.code) || [];
    const userCodes = user.user_permissions.map(up => up.permissions.code) || [];
    const finalPermissions = [...new Set([...roleCodes, ...userCodes])];

    return {
      ...user,  
      role_code: user.role?.name ?? null,
      role_name: user.role?.description ?? null,
      department_name: user.department?.name ?? null,
      org_name: user.organization?.name ?? null,
      permissions: finalPermissions
    };
  },
};

export default UserModel;