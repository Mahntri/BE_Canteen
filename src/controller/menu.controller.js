import prisma from '../config/prisma.js';

const MenuController = {
  // 1. Lấy menu
  getMenus: async (req, res) => {
    try {
      const { date, from, to } = req.query;

      if (date) {
        const searchDate = new Date(date);
        const startOfDay = new Date(Date.UTC(searchDate.getUTCFullYear(), searchDate.getUTCMonth(), searchDate.getUTCDate(), 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(searchDate.getUTCFullYear(), searchDate.getUTCMonth(), searchDate.getUTCDate(), 23, 59, 59, 999));
        
        const menu = await prisma.menu.findFirst({
          where: { date: { gte: startOfDay, lte: endOfDay } },
          include: { items: { include: { dish: true } } }
        });

        if (!menu) return res.status(200).json(null); 

        const normalItems = menu.items.filter(i => i.category === 'NORMAL');
        const specialItems = menu.items.filter(i => i.category === 'SPECIAL');

        const data = {
          id: menu.id,
          date: menu.date.toISOString().split('T')[0],
          
          totalNormalPrice: normalItems.reduce((sum, i) => sum + Number(i.dish.price), 0),
          
          totalSpecialRevenue: specialItems.reduce((sum, i) => sum + (Number(i.dish.price) * (i.quantityLimit || 0)), 0),
          
          totalBookings: (normalItems.length > 0 ? (normalItems[0].quantityLimit || 0) : 0) + 
                         specialItems.reduce((sum, i) => sum + (i.quantityLimit || 0), 0),
          
          normalMenu: normalItems.map(i => ({
            dishId: i.dishId,
            dishName: i.dish.name,
            dishPrice: Number(i.dish.price),
            quantity: i.quantityLimit || 0,
            image_url: i.dish.image_url
          })),
          specialMenu: specialItems.map(i => ({
            dishId: i.dishId,
            dishName: i.dish.name,
            dishPrice: Number(i.dish.price),
            quantity: i.quantityLimit || 0,
            image_url: i.dish.image_url
          }))
        };
        return res.status(200).json(data);
      }

      if (from && to) {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const startFrom = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 0, 0, 0, 0));
        const endTo = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate(), 23, 59, 59, 999));

        const menus = await prisma.menu.findMany({
          where: { date: { gte: startFrom, lte: endTo } },
          include: { items: { include: { dish: true } } }
        });

        const data = menus.map(m => {
          const normalItems = m.items.filter(i => i.category === 'NORMAL');
          const specialItems = m.items.filter(i => i.category === 'SPECIAL');
          return {
            id: m.id,
            date: m.date.toISOString().split('T')[0],
            normalMenu: normalItems.map(i => ({
                dishName: i.dish.name, 
                dishPrice: Number(i.dish.price),
                quantity: i.quantityLimit
            })),
            specialMenu: specialItems.map(i => ({
                dishName: i.dish.name, 
                dishPrice: Number(i.dish.price),
                quantity: i.quantityLimit
            })),
            totalNormalPrice: normalItems.reduce((sum, i) => sum + Number(i.dish.price), 0),
            totalSpecialRevenue: specialItems.reduce((sum, i) => sum + (Number(i.dish.price) * (i.quantityLimit || 0)), 0),
            
            totalBookings: (normalItems.length > 0 ? (normalItems[0].quantityLimit || 0) : 0) + 
                           specialItems.reduce((sum, i) => sum + (i.quantityLimit || 0), 0),
          };
        });
        return res.status(200).json({ data });
      }
      return res.status(400).json({ error: { message: "Cần tham số date hoặc from/to" } });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: { message: "Lỗi server", details: error.message } });
    }
  },

  // 2. Lấy danh sách ngày
  getDatesWithMenus: async (req, res) => {
    try {
      const { year, month } = req.query;
      if (!year || !month) return res.status(400).json({ error: { message: "Cần tham số year và month" } });

      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // Last day of month

      const menus = await prisma.menu.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        select: { date: true }
      });
      const dates = menus.map(m => m.date.getUTCDate());
      return res.status(200).json(dates);
    } catch (error) {
      return res.status(500).json({ error: { message: "Lỗi server", details: error.message } });
    }
  },

  // 3. Tạo hoặc Update Menu
  upsertMenu: async (req, res) => {
    try {
      const { date, normalMenu = [], specialMenu = [] } = req.body;
      const orgId = req.user?.orgId || 1;

      if (!date) return res.status(400).json({ error: { code: "INVALID_DATE", message: "Ngày không hợp lệ" } });
      const menuDate = new Date(date);

      const mapItem = (i) => ({
        dishId: Number(i.dishId || i.id),
        quantity: Number(i.quantity || 0)
      });

      const cleanNormalMenu = normalMenu.map(mapItem).filter(i => !isNaN(i.dishId));
      const cleanSpecialMenu = specialMenu.map(mapItem).filter(i => !isNaN(i.dishId));
      const allDishIds = [...cleanNormalMenu, ...cleanSpecialMenu].map(i => i.dishId);

      if (allDishIds.length > 0) {
        const dishList = await prisma.dishes.findMany({ where: { id: { in: allDishIds } } });
        const dishMap = new Map(dishList.map(d => [d.id, d]));

        let totalPriceNormal = 0;

        for (const item of cleanNormalMenu) {
          const d = dishMap.get(item.dishId);
          if (!d) return res.status(404).json({ error: { code: "NOT_FOUND", message: `Món ID ${item.dishId} không tồn tại` } });
          totalPriceNormal += Number(d.price);
        }

        for (const item of cleanSpecialMenu) {
          if (!dishMap.get(item.dishId)) return res.status(404).json({ error: { code: "NOT_FOUND", message: `Món ID ${item.dishId} không tồn tại` } });
        }

        const orgSetting = await prisma.organizationSetting.findUnique({ where: { orgId } });
        const maxPrice = Number(orgSetting?.maxMealPricePerDay) || 35000;

        if (totalPriceNormal > maxPrice) {
          return res.status(400).json({
            error: {
              code: "MENU_PRICE_EXCEEDS_CAP",
              message: `Tổng giá món thường (${totalPriceNormal.toLocaleString()}đ) vượt quá mức trần (${maxPrice.toLocaleString()}đ)`
            }
          });
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        const startOfDay = new Date(Date.UTC(menuDate.getUTCFullYear(), menuDate.getUTCMonth(), menuDate.getUTCDate(), 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(menuDate.getUTCFullYear(), menuDate.getUTCMonth(), menuDate.getUTCDate(), 23, 59, 59, 999));

        let menu = await tx.menu.findFirst({
          where: { date: { gte: startOfDay, lte: endOfDay } }
        });

        if (!menu) {
          const saveDate = new Date(Date.UTC(menuDate.getUTCFullYear(), menuDate.getUTCMonth(), menuDate.getUTCDate(), 0, 0, 0, 0));
          menu = await tx.menu.create({ data: { date: saveDate, orgId } });
        }

        await tx.menuItem.deleteMany({ where: { menuId: menu.id } });

        const newItems = [];

        cleanNormalMenu.forEach(item => {
          newItems.push({
            menuId: menu.id,
            dishId: item.dishId,
            category: 'NORMAL',
            quantityLimit: item.quantity
          });
        });

        cleanSpecialMenu.forEach(item => {
          newItems.push({
            menuId: menu.id,
            dishId: item.dishId,
            category: 'SPECIAL',
            quantityLimit: item.quantity
          });
        });

        if (newItems.length > 0) {
          await tx.menuItem.createMany({ data: newItems });
        }

        return menu;
      });

      return res.status(200).json({ data: { message: "Lưu thực đơn thành công", menuId: result.id } });

    } catch (error) {
      console.error("LỖI UPSERT MENU:", error);
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Lỗi Server: " + error.message } });
    }
  },

  // 4. Xóa menu
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.menuItem.deleteMany({ where: { menuId: parseInt(id) } });
      await prisma.menu.delete({ where: { id: parseInt(id) } });
      return res.status(200).json({ message: "Xóa thực đơn thành công" });
    } catch (error) {
      return res.status(500).json({ error: { message: "Lỗi server", details: error.message } });
    }
  }
};

export default MenuController;