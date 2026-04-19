import prisma from "../config/prisma.js";

const mapWarehouse = (wh) => ({
    id: wh.id,
    code: wh.warehouse_code,
    name: wh.warehouse_name,
    location: wh.location,
    status: wh.status,
    managerName: wh.manager,
    phone: wh.phone,
    area: Number(wh.area),
    capacity: wh.capacity,
    description: wh.description,
    type: wh.type,

    orgId: wh.orgId,
    createdAt: wh.createdAt,
    updatedAt: wh.updatedAt,
    departmentName: wh.department?.name || null,
    accountantName: wh.accountant?.fullName || null
});

const mapStockRow = (row) => ({
    ingredientId: row.ingredientId,
    ingredientName: row.ingredient?.name ?? null,
    unit: row.ingredient?.uom
        ? { id: row.ingredient.uom.id, code: row.ingredient.uom.code, name: row.ingredient.uom.name }
        : null,
    quantity: row.quantity != null ? Number(row.quantity) : 0,
    minStock: row.minStock != null ? Number(row.minStock) : 0,
});

// 1. LIST & SEARCH (GET /warehouses)
const listWarehouses = async (req, res) => {
    try {
        const orgId = 1;
        const { q, status, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where = {
            orgId,
            ...(status ? { status } : {}),
            ...(q ? {
                OR: [
                    { warehouse_code: { contains: q, mode: 'insensitive' } },
                    { warehouse_name: { contains: q, mode: 'insensitive' } },
                    { manager: { contains: q, mode: 'insensitive' } }
                ]
            } : {})
        };

        const [total, items] = await Promise.all([
            prisma.warehouse.count({ where }),
            prisma.warehouse.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    department: { select: { name: true } },
                    accountant: { select: { fullName: true } }
                },
                orderBy: { id: 'desc' }
            })
        ]);

        return res.json({
            success: true,
            data: items.map(mapWarehouse),
            meta: { page: Number(page), limit: Number(limit), total }
        });
    } catch (e) {
        return res.status(500).json({ code: "INTERNAL_ERROR", message: e.message });
    }
};

// 2. CREATE (POST /warehouses)
const createWarehouse = async (req, res) => {
    try {
        const orgId = 1;
        const body = req.body;

        const exists = await prisma.warehouse.findFirst({
            where: { orgId, warehouse_code: body.code }
        });
        if (exists) return res.status(409).json({ code: "CONFLICT", message: "Mã kho đã tồn tại" });

        const newWh = await prisma.warehouse.create({
            data: {
                orgId,
                warehouse_code: body.code,
                warehouse_name: body.name,
                location: body.location,
                area: body.area,
                capacity: body.capacity,
                manager: body.managerName,
                phone: body.phone,
                description: body.description,
                status: body.status || "active",
                type: body.type,
                departmentId: body.departmentId,
                accountantId: body.accountantId
            }
        });

        return res.status(201).json({ success: true, data: mapWarehouse(newWh) });
    } catch (e) {
        return res.status(500).json({ code: "INTERNAL_ERROR", message: e.message });
    }
};

// 3. UPDATE (PUT /warehouses/:id)
const updateWarehouse = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const body = req.body;
        const orgId = 1;

        const current = await prisma.warehouse.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ success: false, message: "Kho không tồn tại" });

        if (body.code !== undefined && body.code !== current.warehouse_code) {
            const exists = await prisma.warehouse.findFirst({
                where: { orgId, warehouse_code: body.code }
            });
            if (exists) return res.status(409).json({ success: false, message: "Mã kho mới đã tồn tại" });
        }

        const updateData = {};

        if (body.code !== undefined) updateData.warehouse_code = body.code;
        if (body.name !== undefined) updateData.warehouse_name = body.name;
        if (body.managerName !== undefined) updateData.manager = body.managerName;

        if (body.location !== undefined) updateData.location = body.location;
        if (body.phone !== undefined) updateData.phone = body.phone;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.status !== undefined) updateData.status = body.status;
        if (body.type !== undefined) updateData.type = body.type;

        if (body.area !== undefined) updateData.area = body.area;
        if (body.capacity !== undefined) updateData.capacity = body.capacity;
        if (body.departmentId !== undefined) updateData.departmentId = body.departmentId;
        if (body.accountantId !== undefined) updateData.accountantId = body.accountantId;

        const updated = await prisma.warehouse.update({
            where: { id },
            data: updateData
        });

        return res.json({ success: true, data: mapWarehouse(updated) });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};

// 4. DELETE (DELETE /warehouses/:id)
const deleteWarehouse = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const wh = await prisma.warehouse.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        inventories: true,
                        transactions: true,
                        batches: true
                    }
                }
            }
        });

        if (!wh) return res.status(404).json({ code: "NOT_FOUND", message: "Kho không tồn tại" });

        if (wh._count.inventories > 0 || wh._count.transactions > 0 || wh._count.batches > 0) {
            return res.status(409).json({
                code: "CONFLICT",
                message: "Không thể xóa: Kho đang có dữ liệu tồn kho hoặc lịch sử giao dịch. Hãy chuyển trạng thái sang 'inactive'."
            });
        }

        await prisma.warehouse.delete({ where: { id } });
        return res.json({ success: true, message: "Đã xóa kho thành công" });
    } catch (e) {
        return res.status(500).json({ code: "INTERNAL_ERROR", message: e.message });
    }
};

// 5. GET STOCKS (GET /warehouses/:id/stocks)
const getWarehouseStocks = async (req, res) => {
    try {
        const warehouseId = Number(req.params.id);
        if (Number.isNaN(warehouseId)) {
            return res.status(400).json({ code: "BAD_REQUEST", message: "warehouseId không hợp lệ" });
        }

        const wh = await prisma.warehouse.findUnique({
            where: { id: warehouseId },
            select: { id: true },
        });
        if (!wh) return res.status(404).json({ code: "NOT_FOUND", message: "Warehouse not found" });

        const rows = await prisma.inventory.findMany({
            where: {
                warehouseId,
                ingredient: { deletedAt: null },
            },
            select: {
                ingredientId: true,
                quantity: true,
                minStock: true,
                ingredient: {
                    select: {
                        name: true,
                        uom: { select: { id: true, code: true, name: true } },
                    },
                },
            },
            orderBy: [{ ingredientId: "asc" }],
        });

        return res.json({ success: true, data: rows.map(mapStockRow) });
    } catch (e) {
        console.error("getWarehouseStocks error:", e);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
    }
};

export default {
    listWarehouses,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse,
    getWarehouseStocks
};