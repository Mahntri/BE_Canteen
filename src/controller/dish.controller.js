import prisma from '../config/prisma.js';

const DishController = {
  // 1. Tạo món mới
  create: async (req, res) => {
    try {
      const { code, name, type, price, category, description, instruction, image_url, ingredients } = req.body;
      
      let totalCost = 0;
      for (const item of ingredients) {
        const ingDb = await prisma.ingredient.findUnique({ where: { id: item.ingredientId } });
        if (!ingDb) {
            return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Nguyên liệu ID ${item.ingredientId} không tồn tại` } });
        }
        totalCost += Number(ingDb.price) * Number(item.quantity);
      }

      if (Number(price) < totalCost) {
         return res.status(400).json({ 
             error: { 
                 code: "DISH_PRICE_TOO_LOW", 
                 message: `Giá bán (${Number(price).toLocaleString()}) thấp hơn giá vốn (${totalCost.toLocaleString()})` 
             } 
         });
      }

      const newDish = await prisma.dishes.create({
        data: {
          code, name, type, category, description, instruction, image_url,
          price: Number(price),
          costPrice: totalCost,
          is_active: true, 
          dish_recipes: {
            create: ingredients.map(ing => ({
              ingredient_id: ing.ingredientId,
              quantity: ing.quantity
            }))
          }
        },
        include: { dish_recipes: { include: { ingredients: true } } }
      });

      return res.status(201).json({ data: newDish, message: "Tạo món thành công" });

    } catch (error) {
      console.error("Create Dish Error:", error);
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  },

  // 2. Lấy danh sách món
  getAll: async (req, res) => {
    try {
        const { type, q } = req.query;
        
        const where = {
            is_active: true, 
            ...(type && { type: type }),
            ...(q && { 
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { code: { contains: q, mode: 'insensitive' } }
                ]
            })
        };

        const dishesList = await prisma.dishes.findMany({
            where,
            include: { 
                dish_recipes: { include: { ingredients: { include: { uom: true } } } } 
            },
            orderBy: { id: 'desc' }
        });

        const result = dishesList.map(dish => ({
            ...dish,
            isActive: dish.is_active, 
            image: dish.image_url, 
            price: Number(dish.price),
            costPrice: Number(dish.costPrice) || 0
        }));

        return res.status(200).json({ data: result });
    } catch (error) {
        console.error("Lỗi getAll Dishes:", error); 
        return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Lỗi server" } });
    }
  },

  // 3. Cập nhật món
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { code, name, type, price, category, description, instruction, image_url, ingredients } = req.body;
      
      const currentDish = await prisma.dishes.findUnique({
        where: { id: Number(id) },
        include: { dish_recipes: true }
      });

      if (!currentDish) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Món ăn không tồn tại" } });

      const newPrice = (price !== undefined) ? Number(price) : Number(currentDish.price);
      let newCostPrice = 0;
      
      const ingredientsToCheck = ingredients ? ingredients : currentDish.dish_recipes.map(r => ({
           ingredientId: r.ingredient_id,
           quantity: Number(r.quantity)
      }));

      for (const item of ingredientsToCheck) {
        const ingDb = await prisma.ingredient.findUnique({ where: { id: item.ingredientId } });
        if (ingDb) newCostPrice += (Number(ingDb.price) * Number(item.quantity));
      }

      if (newPrice < newCostPrice) {
         return res.status(400).json({
          error: { code: "DISH_PRICE_TOO_LOW", message: "Giá bán thấp hơn giá vốn" }
        });
      }

      const updateData = { 
          code, name, type, category, description, instruction, image_url,
          price: newPrice,
          costPrice: newCostPrice
      };

      if (ingredients) {
        updateData.dish_recipes = {
            deleteMany: {},
            create: ingredients.map(ing => ({
                ingredient_id: ing.ingredientId,
                quantity: ing.quantity
            }))
        };
      }

      const updatedDish = await prisma.dishes.update({
        where: { id: Number(id) },
        data: updateData,
        include: { dish_recipes: true }
      });

      return res.status(200).json({ data: updatedDish });

    } catch (error) {
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  },
  
  // 4. Xóa món
  delete: async (req, res) => {
      try {
          const id = Number(req.params.id);

          const existingDish = await prisma.dishes.findUnique({ where: { id } });
          if (!existingDish) {
              return res.status(404).json({ error: { message: "Không tìm thấy món ăn" } });
          }

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const dishInMenu = await prisma.menuItem.findFirst({
              where: {
                  dishId: id,
                  menu: {
                      date: { gte: today }
                  }
              },
              include: { menu: true }
          });

          if (dishInMenu) {
              const dateStr = new Date(dishInMenu.menu.date).toLocaleDateString('vi-VN');
              return res.status(409).json({
                  error: { 
                      code: "DISH_IN_USE", 
                      message: `Không thể xóa: Món này đang có trong thực đơn ngày ${dateStr}` 
                  }
              });
          }

          await prisma.dishes.update({
              where: { id },
              data: { is_active: false }
          });

          return res.status(200).json({ data: { message: "Đã ẩn món ăn thành công" } });
      } catch (error) {
          console.error("Delete Dish Error:", error);
          return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Lỗi server" } });
      }
  }
};

export default DishController;