import prisma from "../config/prisma.js";

const DepartmentModel = {
  findById: (id) => {
    return prisma.department.findUnique({ where: { id: Number(id) } });
  },
  
  findByCode: (code) => {
    return prisma.department.findUnique({ where: { code } });
  },

  getAllSimple: () => {
    return prisma.department.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' }
    });
  }
};

export default DepartmentModel;