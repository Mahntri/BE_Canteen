import prisma from "../config/prisma.js";
import { listQuerySchema, createGroupSchema, updateGroupSchema } from "../validation/ingredientGroup.validation.js";

// GET /api/v1/ingredient-groups
export const listIngredientGroups = async (req, res) => {
    try {
        const { page, limit, q } = listQuerySchema.parse(req.query);
        const skip = (page - 1) * limit;

        const where = q ? {
            OR: [
                { code: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
            ],
        } : {};

        const [total, data] = await Promise.all([
            prisma.ingredientGroup.count({ where }),
            prisma.ingredientGroup.findMany({
                where,
                orderBy: { id: "asc" },
                skip,
                take: limit,
            }),
        ]);

        return res.json({ data, meta: { page, limit, total } });
    } catch (e) {
        if (e?.name === "ZodError") {
            return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
        }
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
    }
};

// GET /api/v1/ingredient-groups/:id
export const getIngredientGroup = async (req, res) => {
    const id = Number(req.params.id);
    const item = await prisma.ingredientGroup.findUnique({ where: { id } });

    if (!item) return res.status(404).json({ code: "NOT_FOUND", message: "Ingredient group not found" });
    return res.json({ data: item });
};

// POST /api/v1/ingredient-groups
export const createIngredientGroup = async (req, res) => {
    try {
        const body = createGroupSchema.parse(req.body);

        const created = await prisma.ingredientGroup.create({
            data: {
                code: body.code,
                name: body.name,
                description: body.description ?? null,
            },
        });

        return res.status(201).json({ data: created });
    } catch (e) {
        if (e?.name === "ZodError") {
            return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
        }
        if (e?.code === "P2002") {
            return res.status(409).json({ code: "CONFLICT", message: "Group code already exists" });
        }
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
    }
};

// PUT /api/v1/ingredient-groups/:id
export const updateIngredientGroup = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const body = updateGroupSchema.parse(req.body);

        const existing = await prisma.ingredientGroup.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "Ingredient group not found" });

        const updated = await prisma.ingredientGroup.update({
            where: { id },
            data: {
                ...(body.code !== undefined ? { code: body.code } : {}),
                ...(body.name !== undefined ? { name: body.name } : {}),
                ...(body.description !== undefined ? { description: body.description ?? null } : {}),
            },
        });

        return res.json({ data: updated });
    } catch (e) {
        if (e?.name === "ZodError") {
            return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
        }
        if (e?.code === "P2002") {
            return res.status(409).json({ code: "CONFLICT", message: "Group code already exists" });
        }
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
    }
};

// DELETE /api/v1/ingredient-groups/:id
export const deleteIngredientGroup = async (req, res) => {
    const id = Number(req.params.id);

    const existing = await prisma.ingredientGroup.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "Ingredient group not found" });

    // Check if any ingredients are using this group
    const usedCount = await prisma.ingredient.count({ where: { groupId: id, deletedAt: null } });
    if (usedCount > 0) {
        return res.status(409).json({
            code: "CONFLICT",
            message: "Cannot delete group that is being used by ingredients",
        });
    }

    await prisma.ingredientGroup.delete({ where: { id } });
    return res.status(204).send();
};
