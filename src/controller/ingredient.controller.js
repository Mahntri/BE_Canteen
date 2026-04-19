import prisma from "../config/prisma.js";
import {
  listQuerySchema,
  createIngredientSchema,
  updateIngredientSchema,
} from "../validation/ingredient.validation.js";

const mapIngredient = (x) => ({
  ...x,
  minStockLevel: x.minStockLevel != null ? Number(x.minStockLevel) : null,
  price: x.price != null ? Number(x.price) : null,
});

// GET /api/v1/ingredients?page=1&limit=10&q=...
export const listIngredients = async (req, res) => {
  try {
    const { page, limit, q } = listQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(q
        ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
        : {}),
    };

    const [total, data] = await Promise.all([
      prisma.ingredient.count({ where }),
      prisma.ingredient.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: limit,
        include: {
          uom: true,
          group: true  
        },
      }),
    ]);

    return res.json({ data: data.map(mapIngredient), meta: { page, limit, total } });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
  }
};

// GET /api/v1/ingredients/:id
export const getIngredient = async (req, res) => {
  const id = Number(req.params.id);
  const item = await prisma.ingredient.findFirst({
    where: { id, deletedAt: null },
    include: { uom: true, group: true },
  });

  if (!item) return res.status(404).json({ code: "NOT_FOUND", message: "Ingredient not found" });
  return res.json({ data: mapIngredient(item) });
};

// POST /api/v1/ingredients
export const createIngredient = async (req, res) => {
  try {
    const body = createIngredientSchema.parse(req.body);

    const uomId = body.uomId ?? 1;

    const created = await prisma.ingredient.create({
      data: {
        code: body.code,
        name: body.name,
        // unit: body.unit ?? null,
        minStockLevel: body.minStockLevel,

        ...(body.price !== undefined ? { price: body.price } : {}),
        uomId,
        ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
      },
      include: { uom: true, group: true },
    });

    return res.status(201).json({ data: mapIngredient(created) });
  } catch (e) {
    console.error("createIngredient error:", e);

    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    if (e?.code === "P2002") {
      return res.status(409).json({ code: "CONFLICT", message: "Ingredient code already exists" });
    }
    if (e?.code === "P2003") {
      return res.status(400).json({ code: "BAD_REQUEST", message: "uomId/groupId không hợp lệ" });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
  }
};

// PUT /api/v1/ingredients/:id
export const updateIngredient = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = updateIngredientSchema.parse(req.body);

    const existing = await prisma.ingredient.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "Ingredient not found" });

    const updated = await prisma.ingredient.update({
      where: { id },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.unit !== undefined ? { unit: body.unit ?? null } : {}),
        ...(body.minStockLevel !== undefined ? { minStockLevel: body.minStockLevel } : {}),
        ...(body.price !== undefined ? { price: body.price } : {}),

        ...(body.uomId !== undefined ? { uomId: body.uomId } : {}),
        ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
      },
      include: { uom: true, group: true },
    });

    return res.json({ data: mapIngredient(updated) });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    if (e?.code === "P2002") {
      return res.status(409).json({ code: "CONFLICT", message: "Ingredient code already exists" });
    }
    if (e?.code === "P2003") {
      return res.status(400).json({ code: "BAD_REQUEST", message: "uomId/groupId không hợp lệ" });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
  }
};

// DELETE /api/v1/ingredients/:id (soft delete)
export const deleteIngredient = async (req, res) => {
  const id = Number(req.params.id);

  const existing = await prisma.ingredient.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "Ingredient not found" });

  await prisma.ingredient.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return res.status(204).send();
};
