import prisma from "../config/prisma.js";
import { listUomQuerySchema, createUomSchema, updateUomSchema } from "../validation/uom.validation.js";

// GET /api/v1/uoms?page=1&limit=20&q=kg
export const listUoms = async (req, res) => {
  try {
    const { page, limit, q } = listUomQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const [total, data] = await Promise.all([
      prisma.uom.count({ where }),
      prisma.uom.findMany({
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

// GET /api/v1/uoms/:id
export const getUom = async (req, res) => {
  const id = Number(req.params.id);
  const item = await prisma.uom.findUnique({ where: { id } });

  if (!item) return res.status(404).json({ code: "NOT_FOUND", message: "UOM not found" });
  return res.json({ data: item });
};

// POST /api/v1/uoms
export const createUom = async (req, res) => {
  try {
    const body = createUomSchema.parse(req.body);

    const created = await prisma.uom.create({
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
    // unique code
    if (e?.code === "P2002") {
      return res.status(409).json({ code: "CONFLICT", message: "UOM code already exists" });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
  }
};

// PUT /api/v1/uoms/:id
export const updateUom = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = updateUomSchema.parse(req.body);

    const existing = await prisma.uom.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "UOM not found" });

    const updated = await prisma.uom.update({
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
      return res.status(409).json({ code: "CONFLICT", message: "UOM code already exists" });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
  }
};

// DELETE /api/v1/uoms/:id
export const deleteUom = async (req, res) => {
  const id = Number(req.params.id);

  const existing = await prisma.uom.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "UOM not found" });

  const usedCount = await prisma.ingredient.count({ where: { uomId: id, deletedAt: null } });
  if (usedCount > 0) {
    return res.status(409).json({
      code: "CONFLICT",
      message: "UOM đang được sử dụng bởi ingredients, không thể xoá",
    });
  }

  await prisma.uom.delete({ where: { id } });
  return res.status(204).send();
};
