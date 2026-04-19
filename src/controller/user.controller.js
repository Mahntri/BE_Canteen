import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';

const userController = {
    getAllUsers: async (req, res) => {
        const users = await prisma.user.findMany({
            include: {
                role: true,
                department: true,
                user_permissions: { include: { permissions: true } }
            }
        });
        res.json({ success: true, data: users });
    },

    getUserDetail: async (req, res) => {
        try {
            const { id } = req.params;
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
                    department: true
                }
            });

            if (!user) return res.status(404).json({ success: false, message: "User không tồn tại" });

            const rolePerms = user.role?.role_permissions.map(rp => rp.permissions) || [];
            const personalPerms = user.user_permissions.map(up => up.permissions) || [];

            const allPermissions = Array.from(
                new Map([...rolePerms, ...personalPerms].map(p => [p.id, p])).values()
            );

            res.json({
                success: true,
                data: {
                    ...user,
                    allPermissions
                }
            });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    },

    createUser: async (req, res) => {
        try {
            const { password, full_name, role_id, department_id, employee_code, phone_number, job_title, is_active, ...rest } = req.body;
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await prisma.user.create({
                data: {
                    ...rest,
                    fullName: full_name,
                    passwordHash: hashedPassword,
                    roleId: Number(role_id),
                    departmentId: department_id ? Number(department_id) : null,
                    employeeCode: employee_code,
                    phoneNumber: phone_number,
                    jobTitle: job_title,
                    isActive: is_active !== undefined ? is_active : true
                }
            });
            res.status(201).json({ success: true, data: newUser });
        } catch (e) {
            console.error("Create user error:", e);
            res.status(500).json({ success: false, message: e.message });
        }
    },

    moveUserDepartment: async (req, res) => {
        const { id } = req.params;
        const { departmentId } = req.body;
        const updated = await prisma.user.update({
            where: { id },
            data: { departmentId: Number(departmentId) }
        });
        res.json({ success: true, data: updated, message: "Đã chuyển đơn vị" });
    },

    removeFromDepartment: async (req, res) => {
        const { id } = req.params;
        await prisma.user.update({
            where: { id },
            data: { departmentId: null }
        });
        res.json({ success: true, message: "Đã gỡ khỏi đơn vị" });
    },

    toggleLockAccount: async (req, res) => {
        const { id } = req.params;
        const user = await prisma.user.findUnique({ where: { id } });
        const updated = await prisma.user.update({
            where: { id },
            data: { isActive: !user.isActive }
        });
        res.json({ success: true, message: updated.isActive ? "Đã mở khóa" : "Đã khóa tài khoản" });
    },

    resetPassword: async (req, res) => {
        const { id } = req.params;
        const { newPassword } = req.body;
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id },
            data: { passwordHash: hashedPassword }
        });
        res.json({ success: true, message: "Đã đổi mật khẩu thành công" });
    },



    updateUser: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                full_name,
                employee_code,
                email,
                gender,
                job_title,
                phone_number,
                address,
                role_id,
                department_id
            } = req.body;

            const updated = await prisma.user.update({
                where: { id: id },
                data: {
                    fullName: full_name,
                    employeeCode: employee_code,
                    email: email,
                    gender: gender,
                    jobTitle: job_title,
                    phoneNumber: phone_number,
                    address: address,
                    roleId: role_id ? Number(role_id) : undefined,
                    departmentId: department_id !== undefined
                        ? (department_id ? Number(department_id) : null)
                        : undefined
                }
            });

            res.json({ success: true, data: updated, message: "Cập nhật thông tin thành công" });
        } catch (e) {
            console.error("Prisma Update Error:", e.message);
            res.status(400).json({ success: false, message: "Lỗi dữ liệu: " + e.message });
        }
    },

    deleteUser: async (req, res) => {
        try {
            const { id } = req.params;

            const user = await prisma.user.findUnique({ where: { id: id } });

            if (!user) {
                return res.status(404).json({ success: false, message: "Không tìm thấy người dùng trên hệ thống" });
            }

            if (user.departmentId === null) {
                await prisma.user.delete({ where: { id: id } });
                return res.json({ success: true, message: "Đã xóa vĩnh viễn tài khoản" });
            } else {
                await prisma.user.update({
                    where: { id: id },
                    data: { departmentId: null }
                });
                return res.json({ success: true, message: "Đã gỡ nhân viên khỏi đơn vị thành công" });
            }
        } catch (e) {
            console.error("Lỗi Prisma:", e.message);
            res.status(400).json({ success: false, message: "Lỗi dữ liệu: " + e.message });
        }
    },

    updateUserPermissions: async (req, res) => {
        try {
            const { id } = req.params;
            const { permissionIds } = req.body;

            await prisma.$transaction([
                prisma.user_permissions.deleteMany({ where: { user_id: id } }),
                prisma.user_permissions.createMany({
                    data: permissionIds.map(pId => ({
                        user_id: id,
                        permission_id: pId
                    }))
                })
            ]);
            res.json({ success: true, message: "Cập nhật quyền riêng thành công" });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    },

    getUserPermissions: async (req, res) => {
        try {
            const { id } = req.params;

            const user = await prisma.user.findUnique({
                where: { id },
                select: {
                    id: true,
                    roleId: true,
                    role: {
                        include: {
                            role_permissions: { select: { permission_id: true } }
                        }
                    },
                    user_permissions: {
                        select: { permission_id: true }
                    }
                }
            });

            if (!user) return res.status(404).json({ success: false, message: "User không tồn tại" });

            const rolePermissionIds = user.role?.role_permissions.map(rp => rp.permission_id) || [];

            const personalPermissionIds = user.user_permissions.map(up => up.permission_id) || [];

            const allAssignedPermissionIds = [...new Set([...rolePermissionIds, ...personalPermissionIds])];

            res.json({
                success: true,
                data: {
                    userId: user.id,
                    roleId: user.roleId,
                    rolePermissionIds,
                    personalPermissionIds,
                    allAssignedPermissionIds
                }
            });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    },

    getRoles: async (req, res) => {
        try {
            const roles = await prisma.role.findMany();
            res.json({ success: true, data: roles });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    },

    getRolePermissions: async (req, res) => {
        try {
            const { id } = req.params;
            const role = await prisma.role.findUnique({
                where: { id: Number(id) },
                include: {
                    role_permissions: {
                        select: { permission_id: true }
                    }
                }
            });

            if (!role) return res.status(404).json({ success: false, message: "Role không tồn tại" });

            const permissionIds = role.role_permissions.map(rp => rp.permission_id);
            res.json({ success: true, data: permissionIds });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    },

    getDepartments: async (req, res) => {
        try {
            const departments = await prisma.department.findMany({
                orderBy: { name: 'asc' }
            });
            res.json({ success: true, data: departments });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    },
    importUsers: async (req, res) => {
        try {
            const { users } = req.body;
            if (!Array.isArray(users) || users.length === 0) {
                return res.status(400).json({ success: false, message: "Danh sách người dùng trống" });
            }

            const results = {
                successCount: 0,
                errors: []
            };

            const departments = await prisma.department.findMany();
            const roles = await prisma.role.findMany();
            const org = await prisma.organization.findFirst();
            const orgId = org ? org.id : null;

            if (!orgId) {
                return res.status(400).json({ success: false, message: "Hệ thống chưa có thông tin Tổ chức (Organization). Vui lòng tạo tổ chức trước." });
            }

            const defaultPasswordHash = "$2b$10$9nkGmOczwPoNGBHoHR15J.NFqB1kTU2/nQLtqWhPu7bAetC3ta5Pi";

            const defaultRole = roles.find(r => r.name === 'EMPLOYEE') || roles.find(r => r.name === 'USER') || roles[0];

            for (const userData of users) {
                try {
                    let deptId = null;
                    if (userData.department) {
                        const d = departments.find(d =>
                            d.name.toLowerCase() === userData.department.toLowerCase() ||
                            d.code.toLowerCase() === userData.department.toLowerCase()
                        );
                        if (d) deptId = d.id;
                    }

                    let roleId = defaultRole?.id;
                    if (userData.position) {
                        const r = roles.find(r => r.name.toLowerCase() === userData.position.toLowerCase());
                        if (r) roleId = r.id;
                    }
                    else if (userData.title) {
                        const r = roles.find(r => r.name.toLowerCase() === userData.title.toLowerCase());
                        if (r) roleId = r.id;
                    }

                    let gender = 'OTHER';
                    if (userData.gender) {
                        const g = String(userData.gender).toLowerCase().trim();
                        if (['nam', 'male', 'man', 'm'].includes(g)) gender = 'MALE';
                        else if (['nu', 'nữ', 'female', 'woman', 'f'].includes(g)) gender = 'FEMALE';
                    }

                    let username = userData.email;
                    if (username.length > 50) {
                        username = userData.code || userData.email.split('@')[0].substring(0, 50);
                    }

                    const phoneNumber = userData.phone !== undefined && userData.phone !== null ? String(userData.phone) : null;

                    const employeeCode = userData.code || userData.employeeCode;
                    const codeStr = employeeCode !== undefined && employeeCode !== null ? String(employeeCode) : null;

                    await prisma.user.create({
                        data: {
                            username: username,
                            email: userData.email,
                            fullName: userData.name,
                            employeeCode: codeStr,
                            passwordHash: defaultPasswordHash,
                            departmentId: deptId,
                            roleId: roleId,
                            gender: gender,
                            phoneNumber: phoneNumber,
                            address: userData.address,
                            isActive: userData.status !== 'inactive',
                            jobTitle: userData.title,
                            orgId: orgId
                        }
                    });
                    results.successCount++;
                } catch (err) {
                    console.error("Import error for user:", userData.email, err.message);
                    let msg = err.message;
                    if (err.code === 'P2002') {
                        const target = err.meta?.target || [];
                        msg = `Dữ liệu trùng lặp: ${target.join(', ')}`;
                    } else if (err.code === 'P2003') {
                        msg = "Lỗi liên kết dữ liệu (Foreign Key)";
                    }

                    results.errors.push({
                        email: userData.email,
                        message: msg
                    });
                }
            }

            res.json({
                success: true,
                message: `Đã nhập thành công ${results.successCount} nhân viên.`,
                errors: results.errors
            });

        } catch (e) {
            console.error("Bulk import error:", e);
            res.status(500).json({ success: false, message: e.message });
        }
    },
    bulkAction: async (req, res) => {
        try {
            const { userIds, action } = req.body;
            if (!Array.isArray(userIds) || userIds.length === 0) {
                return res.status(400).json({ success: false, message: "Danh sách người dùng trống" });
            }

            let result;
            let message = "";

            switch (action) {
                case 'DELETE':
                    result = await prisma.user.deleteMany({
                        where: { id: { in: userIds } }
                    });
                    message = `Đã xóa ${result.count} người dùng.`;
                    break;
                case 'LOCK':
                    result = await prisma.user.updateMany({
                        where: { id: { in: userIds } },
                        data: { isActive: false }
                    });
                    message = `Đã khóa ${result.count} người dùng.`;
                    break;
                case 'UNLOCK':
                    result = await prisma.user.updateMany({
                        where: { id: { in: userIds } },
                        data: { isActive: true }
                    });
                    message = `Đã mở khóa ${result.count} người dùng.`;
                    break;
                default:
                    return res.status(400).json({ success: false, message: "Hành động không hợp lệ" });
            }

            res.json({ success: true, message: message, data: result });
        } catch (e) {
            console.error("Bulk action error:", e);
            res.status(500).json({ success: false, message: e.message });
        }
    },
    getPermissionsTree: async (req, res) => {
        try {
            const permissions = await prisma.permissions.findMany({
                orderBy: { id: 'asc' }
            });

            // Group by module
            const modules = {};
            permissions.forEach(p => {
                if (!modules[p.module]) {
                    modules[p.module] = {
                        id: p.module.toLowerCase(),
                        label: p.module,
                        children: []
                    };
                }
                modules[p.module].children.push({
                    id: p.id,
                    code: p.code,
                    label: p.description || p.code
                });
            });

            res.json({ success: true, data: Object.values(modules) });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    },
};

export default userController;