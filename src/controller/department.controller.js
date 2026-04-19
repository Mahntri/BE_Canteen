import prisma from "../config/prisma.js";

const validateParentCycle = async (currentId, newParentId) => {
    if (!newParentId) return true;
    if (currentId === newParentId) return false;

    let pointerId = newParentId;
    while (pointerId) {
        const parent = await prisma.department.findUnique({
            where: { id: pointerId },
            select: { parentId: true }
        });

        if (!parent) break;

        if (parent.parentId === currentId) return false;

        pointerId = parent.parentId;
    }
    return true;
};

const getAllDescendantIds = async (parentId) => {
    if (!parentId) return [];

    const children = await prisma.department.findMany({
        where: { parentId: parentId },
        select: { id: true }
    });

    let ids = children.map(c => c.id);
    for (const child of children) {
        const grandChildIds = await getAllDescendantIds(child.id);
        ids = [...ids, ...grandChildIds];
    }
    return ids;
};

// 1. Lấy cây đơn vị

export const getDepartmentsTree = async (req, res) => {
    try {
        const departments = await prisma.department.findMany({
            include: {
                users: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        isActive: true,
                        employeeCode: true,
                        phoneNumber: true,
                        address: true,
                        jobTitle: true,
                        gender: true,
                        roleId: true,      
                        departmentId: true  
                    }
                }
            },
            orderBy: { id: 'asc' }
        });

        const unassignedUsers = await prisma.user.findMany({
            where: { departmentId: null },
            select: {
                id: true,
                fullName: true,
                email: true,
                isActive: true,
                employeeCode: true,
                phoneNumber: true,
                address: true,
                jobTitle: true,
                gender: true,
                roleId: true,       
                departmentId: true  
            }
        });

        const buildTree = (depts, pid = null) => {
            return depts
                .filter(d => d.parentId === pid)
                .map(d => {
                    const userNodes = d.users.map(u => ({
                        id: u.id,
                        name: u.fullName,
                        type: "ACCOUNT",
                        email: u.email,
                        status: u.isActive ? 'active' : 'inactive',
                        employeeCode: u.employeeCode,
                        phone: u.phoneNumber,
                        address: u.address,
                        jobTitle: u.jobTitle,
                        gender: u.gender,
                        roleId: u.roleId,          
                        departmentId: u.departmentId, 
                        children: []
                    }));

                    const subDepts = buildTree(depts, d.id);
                    const combinedChildren = [...subDepts, ...userNodes];

                    return {
                        ...d,
                        memberCount: d.users.length,
                        children: combinedChildren
                    };
                });
        };

        const unassignedNode = {
            id: "DEP_UNASSIGNED",
            name: "Chưa thuộc phòng/nhóm",
            type: "VIRTUAL",
            children: unassignedUsers.map(u => ({
                id: u.id,
                name: u.fullName,
                type: "ACCOUNT",
                status: u.isActive ? 'active' : 'inactive',
                employeeCode: u.employeeCode,
                phone: u.phoneNumber,
                address: u.address,
                jobTitle: u.jobTitle,
                gender: u.gender,
                roleId: u.roleId,            
                departmentId: u.departmentId, 
                children: []
            })),
            memberCount: unassignedUsers.length
        };

        return res.json({
            success: true,
            data: [...buildTree(departments), unassignedNode]
        });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};

// 2. Lấy danh sách thành viên

export const getDepartmentMembers = async (req, res) => {
    try {
        const { id } = req.params;
        let whereClause = {};

        if (id === "UNASSIGNED" || id === "DEP_UNASSIGNED") {
            whereClause = { departmentId: null };
        } else if (isNaN(id)) {
            whereClause = { id: id };
        } else {
            const currentId = Number(id);
            const subIds = await getAllDescendantIds(currentId);
            whereClause = { departmentId: { in: [currentId, ...subIds] } };
        }

        const members = await prisma.user.findMany({
            where: whereClause,
            include: {
                role: { select: { name: true } },
                department: { select: { name: true } }
            }
        });

        return res.json({ success: true, data: members });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};

// 3. Tạo mới đơn vị
export const createDepartment = async (req, res) => {
    try {
        const { code, name, parentId, type, isCostCenter, bankName, bankAccount, orgId } = req.body;

        const validParentId = (parentId && parentId !== 'all') ? Number(parentId) : null;
        const typeUpper = type ? type.toUpperCase() : 'UNIT';
        const organizationConnectId = orgId ? Number(orgId) : 1;

        const prismaData = {
            code,
            name,
            type: typeUpper,
            isCostCenter: isCostCenter === true || isCostCenter === 'true',
            bankName,
            bankAccount,
            organization: {
                connect: { id: organizationConnectId }
            }
        };

        if (validParentId) {
            prismaData.parent = {
                connect: { id: validParentId }
            };
        }

        const created = await prisma.department.create({
            data: prismaData
        });

        return res.status(201).json({ success: true, data: created });
    } catch (e) {
        console.error("Prisma Create Error:", e);
        return res.status(400).json({ success: false, message: e.message });
    }
};

// 4. Cập nhật đơn vị
export const updateDepartment = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { code, name, parentId, isCostCenter, bankName, bankAccount } = req.body;

        const prismaData = {
            code,
            name,
            isCostCenter: isCostCenter !== undefined ? (isCostCenter === true || isCostCenter === 'true') : undefined,
            bankName,
            bankAccount
        };

        if (parentId !== undefined) {
            const validParentId = (parentId && parentId !== 'all') ? Number(parentId) : null;

            if (validParentId === id) {
                return res.status(400).json({ success: false, message: "Không thể chọn chính mình làm cha" });
            }

            if (!(await validateParentCycle(id, validParentId))) {
                return res.status(400).json({ success: false, message: "Lỗi vòng lặp cấu trúc" });
            }

            if (validParentId) {
                prismaData.parent = {
                    connect: { id: validParentId }
                };
            } else {
                prismaData.parent = {
                    disconnect: true
                };
            }
        }

        const updated = await prisma.department.update({
            where: { id },
            data: prismaData
        });
        return res.json({ success: true, data: updated });
    } catch (e) {
        console.error("Update Dept Error:", e);
        return res.status(400).json({ success: false, message: e.message });
    }
};

// 5. Xóa đơn vị
export const deleteDepartment = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const dept = await prisma.department.findUnique({
            where: { id },
            include: {
                _count: { select: { users: true, children: true } }
            }
        });

        if (!dept) return res.status(404).json({ success: false, message: "Không tìm thấy đơn vị" });

        if (dept._count.users > 0) return res.status(400).json({ success: false, message: `Còn ${dept._count.users} nhân viên trong đơn vị này.` });
        if (dept._count.children > 0) return res.status(400).json({ success: false, message: `Còn ${dept._count.children} đơn vị con.` });

        await prisma.department.delete({ where: { id } });
        return res.json({ success: true, message: "Xóa thành công" });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};

// Các hàm phụ khác
export const listDepartments = async (req, res) => {
    try {
        const data = await prisma.department.findMany({ include: { parent: true } });
        return res.json({ success: true, data });
    } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
};

export const getDepartment = async (req, res) => {
    try {
        const item = await prisma.department.findUnique({ where: { id: Number(req.params.id) }, include: { parent: true } });
        return res.json({ success: true, data: item });
    } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
};

export const getUnassignedMembers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({ where: { departmentId: null } });
        return res.json({ success: true, data: users });
    } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
};