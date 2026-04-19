import prisma from '../config/prisma.js';

const purchaseController = {
    // 1. GET LIST 
    getAll: async (req, res) => {
        try {
            const { search, status, page = 1, limit = 10 } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const whereClause = {
                type: "IMPORT_PURCHASE",
                ...(status && { status: status }),
                ...(search && {
                    OR: [
                        { code: { contains: search, mode: 'insensitive' } },
                        { supplierName: { contains: search, mode: 'insensitive' } },
                        { warehouse: { warehouse_name: { contains: search, mode: 'insensitive' } } }
                    ]
                })
            };

            const [orders, total] = await Promise.all([
                prisma.inventoryTransaction.findMany({
                    where: whereClause,
                    include: {
                        warehouse: { select: { warehouse_name: true } },
                        details: { include: { ingredient: true } }
                    },
                    skip,
                    take: Number(limit),
                    orderBy: { transactionDate: 'desc' }
                }),
                prisma.inventoryTransaction.count({ where: whereClause })
            ]);

            res.json({
                success: true,
                data: orders,
                pagination: { total, page: Number(page), limit: Number(limit) }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
        }
    },

    // 2. POST 
    create: async (req, res) => {
        try {
            const {
                code, warehouseId, transactionDate, status, description,
                supplierName, supplierPhone, totalAmount,
                items
            } = req.body;

            const newOrder = await prisma.$transaction(async (tx) => {
                const order = await tx.inventoryTransaction.create({
                    data: {
                        code,
                        warehouseId: Number(warehouseId),
                        type: "IMPORT_PURCHASE",
                        status: status || "PENDING",
                        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
                        description, // notes
                        supplierName,
                        supplierPhone,
                        totalAmount: Number(totalAmount || 0)
                    }
                });

                // Tạo Details (Items)
                if (items && items.length > 0) {
                    await tx.inventoryTransactionDetail.createMany({
                        data: items.map(item => ({
                            transactionId: order.id,
                            ingredientId: Number(item.ingredientId),
                            quantity: Number(item.quantity),
                            price: Number(item.price)
                        }))
                    });
                }

                if (status === 'COMPLETED' && items) {
                    for (const item of items) {
                        await tx.inventory.upsert({
                            where: {
                                warehouseId_ingredientId: {
                                    warehouseId: Number(warehouseId),
                                    ingredientId: Number(item.ingredientId)
                                }
                            },
                            update: { quantity: { increment: Number(item.quantity) } },
                            create: {
                                warehouseId: Number(warehouseId),
                                ingredientId: Number(item.ingredientId),
                                quantity: Number(item.quantity)
                            }
                        });
                    }
                }

                return order;
            });

            res.status(201).json({ success: true, data: newOrder });
        } catch (error) {
            res.status(400).json({ success: false, message: "Không thể tạo phiếu", error: error.message });
        }
    },

// 3. PUT 
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { 
                status, description, supplierName, supplierPhone, totalAmount, 
                warehouseId, transactionDate,
                items 
            } = req.body;

            const oldOrder = await prisma.inventoryTransaction.findUnique({
                where: { id },
                include: { details: true }
            });

            if (!oldOrder) {
                return res.status(404).json({ success: false, message: "Phiếu không tồn tại" });
            }

            const updatedOrder = await prisma.$transaction(async (tx) => {
                
                if (oldOrder.status === 'COMPLETED') {
                    for (const oldItem of oldOrder.details) {
                        await tx.inventory.updateMany({
                            where: {
                                warehouseId: oldOrder.warehouseId, 
                                ingredientId: oldItem.ingredientId
                            },
                            data: {
                                quantity: { decrement: Number(oldItem.quantity) } 
                            }
                        });
                    }
                }

                const order = await tx.inventoryTransaction.update({
                    where: { id },
                    data: {
                        status, 
                        description, 
                        supplierName, 
                        supplierPhone,
                        warehouseId: warehouseId ? Number(warehouseId) : undefined,
                        transactionDate: transactionDate ? new Date(transactionDate) : undefined,
                        totalAmount: totalAmount !== undefined ? Number(totalAmount) : undefined
                    }
                });

                if (items && Array.isArray(items)) {
                    await tx.inventoryTransactionDetail.deleteMany({
                        where: { transactionId: id }
                    });

                    if (items.length > 0) {
                        await tx.inventoryTransactionDetail.createMany({
                            data: items.map(item => ({
                                transactionId: id,
                                ingredientId: Number(item.ingredientId),
                                quantity: Number(item.quantity),
                                price: Number(item.price)
                            }))
                        });
                    }
                }

                const currentStatus = status || oldOrder.status;
                const currentWarehouseId = warehouseId ? Number(warehouseId) : oldOrder.warehouseId;

                if (currentStatus === 'COMPLETED' && items && items.length > 0) {
                    for (const newItem of items) {
                        await tx.inventory.upsert({
                            where: {
                                warehouseId_ingredientId: {
                                    warehouseId: currentWarehouseId,
                                    ingredientId: Number(newItem.ingredientId)
                                }
                            },
                            update: { 
                                quantity: { increment: Number(newItem.quantity) } 
                            },
                            create: {
                                warehouseId: currentWarehouseId,
                                ingredientId: Number(newItem.ingredientId),
                                quantity: Number(newItem.quantity),
                                minStock: 0 
                            }
                        });
                    }
                }

                return order;
            });

            const result = await prisma.inventoryTransaction.findUnique({
                where: { id },
                include: { details: { include: { ingredient: true } } }
            });

            res.json({ success: true, data: result, message: "Cập nhật phiếu và tồn kho thành công" });
        } catch (error) {
            console.error(error);
            res.status(400).json({ success: false, message: "Lỗi cập nhật", error: error.message });
        }
    },

    // 4. DELETE
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            await prisma.inventoryTransaction.delete({ where: { id } });
            res.json({ success: true, message: "Đã xóa phiếu thành công" });
        } catch (error) {
            res.status(400).json({ success: false, message: "Lỗi xóa phiếu", error: error.message });
        }
    }
};

export default purchaseController;