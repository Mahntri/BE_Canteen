import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const prisma = new PrismaClient();

const MOCK_USERS = [
    // 1. ADMIN_DEMO
    {
        "username": "admin_demo",
        "email": "admin@demo.com",
        "employeeCode": "ADM01",
        "fullName": "Nguyễn Văn An",
        "gender": "MALE",
        "jobTitle": "IT Manager",
        "departmentName": "Phòng Công Nghệ",
        "phoneNumber": "909123456",
        "address": "Ba Đình, Hà Nội"
    },
    // 2. EMPLOYEE_USER 
    {
        "username": "employee_user",
        "email": "employee@demo.com",
        "employeeCode": "HR01",
        "fullName": "Lý Thị Lan",
        "gender": "FEMALE",
        "jobTitle": "HR Director",
        "departmentName": "Phòng Nhân Sự",
        "phoneNumber": "909123466",
        "address": "Bắc Từ Liêm, Hà Nội"
    },
    // 3. SUPERVISOR_USER 
    {
        "username": "supervisor_user",
        "email": "supervisor@demo.com",
        "employeeCode": "OPS01",
        "fullName": "Lê Thị Phương",
        "gender": "FEMALE",
        "jobTitle": "Operations Manager",
        "departmentName": "Phòng Vận Hành",
        "phoneNumber": "909123470",
        "address": "Gia Lâm, Hà Nội"
    },
    // 4. CANTEEN_USER 
    {
        "username": "canteen_user",
        "email": "canteen@demo.com",
        "employeeCode": "KIT01",
        "fullName": "Đặng Thị Thảo",
        "gender": "FEMALE",
        "jobTitle": "Head Chef",
        "departmentName": "Bếp trung tâm",
        "phoneNumber": "909123474",
        "address": "Phú Xuyên, Hà Nội"
    },
    // 5. KHO & VẬT TƯ
    { "username": "thu_kho_quan", "employeeCode": "WH01", "fullName": "Phạm Văn Quân", "email": "quan.pham@demo.com", "gender": "MALE", "jobTitle": "Warehouse Keeper", "departmentName": "Kho & Vật tư", "phoneNumber": "909123471", "address": "Thanh Trì, Hà Nội" }
];

async function main() {
    console.log("=========================================");
    console.log("BẮT ĐẦU SEED DỮ LIỆU ");
    console.log("=========================================");

    // ========================================================
    // 0. CLEAN DATA 
    // ========================================================
    console.log("--> 0. Cleaning old data...");
    await prisma.bookingAuditLog.deleteMany({});
    await prisma.bookingPriorityRule.deleteMany({});
    await prisma.bookingRolePermission.deleteMany({});
    await prisma.bookingApprovalPolicy.deleteMany({});
    await prisma.dishReview.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.eventParticipant.deleteMany({});
    await prisma.event.deleteMany({});
    await prisma.booking_items.deleteMany({});
    await prisma.bookings.deleteMany({});
    await prisma.transactions.deleteMany({});
    await prisma.menuItem.deleteMany({});
    await prisma.menu.deleteMany({});
    await prisma.dish_recipes.deleteMany({});
    await prisma.inventoryTransactionDetail.deleteMany({});
    await prisma.inventoryTransaction.deleteMany({});
    await prisma.inventoryBatch.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.dishes.deleteMany({});
    await prisma.ingredient.deleteMany({});
    await prisma.ingredientGroup.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.shifts.deleteMany({});
    
    console.log("    + Cleaning Car module...");
    await prisma.carBookingLog.deleteMany({});
    await prisma.carBooking.deleteMany({});
    await prisma.driverRating.deleteMany({});
    await prisma.driver.deleteMany({});
    await prisma.vehicle.deleteMany({});

    // ========================================================
    // 1. TẠO ROLES
    // ========================================================
    console.log("--> 1. Tạo Roles...");
    const rolesData = ["ADMIN", "CANTEEN", "EMPLOYEE", "SUPERVISOR", "DRIVER"];
    const roles = {};
    for (const name of rolesData) {
        const r = await prisma.role.upsert({
            where: { name },
            update: {},
            create: { name, description: `Role ${name}`, is_system_role: true },
        });
        roles[name] = r.id;
    }

    // ========================================================
    // 2. TẠO ORGANIZATION 
    // ========================================================
    console.log("--> 2. Tạo Organization & Cấu hình...");
    const org = await prisma.organization.upsert({
        where: { id: 1 },
        update: {
            defaultBankName: "MB",
            defaultBankAccount: "10000492004", 
            defaultAccountName: "CONG TY DEMO"
        },
        create: {
            code: "ORG_DEMO",
            name: "Công ty Demo",
            fullName: "Công ty Cổ phần Công nghệ Demo",
            address: "Hà Nội, Việt Nam",
            defaultBankName: "MB",
            defaultBankAccount: "10000492004",
            defaultAccountName: "CONG TY DEMO"
        },
    });

    await prisma.organizationSetting.upsert({
        where: { orgId: org.id },
        update: { maxDebtAmount: 500000 },
        create: {
            orgId: org.id,
            maxMealPricePerDay: 35000,
            allowedBookingDaysInAdvance: 30,
            canBookingOnWeekend: false,
            staffBookingDeadlineTime: "16:00",
            managerBookingDeadlineTime: "09:00",
            maxDebtAmount: 500000
        },
    });

    // ========================================================
    // 3. TẠO PHÒNG BAN 
    // ========================================================
    console.log("--> 3. Tạo Cây Đơn Vị...");
    const createDept = async (code, name, type, parentId = null) => {
        return prisma.department.upsert({
            where: { orgId_code: { orgId: org.id, code } },
            update: { parentId },
            create: { orgId: org.id, code, name, type, parentId }
        });
    };

    const depTech = await createDept("DEP_TECH", "Phòng Công Nghệ", "UNIT");
    const teamAI = await createDept("TEAM_AI", "Team AI & Data", "GROUP", depTech.id);
    const teamWeb = await createDept("TEAM_WEB", "Team Web Frontend", "GROUP", depTech.id);
    const teamMobile = await createDept("TEAM_MOBILE", "Team Mobile App", "GROUP", depTech.id);
    const teamSys = await createDept("TEAM_SYS", "Team System & DevOps", "GROUP", depTech.id);

    const depHR = await createDept("DEP_HR", "Phòng Nhân Sự", "UNIT");
    const grpRec = await createDept("GRP_REC", "Tuyển dụng (Recruitment)", "GROUP", depHR.id);
    const grpCB = await createDept("GRP_CB", "Lương thưởng (C&B)", "GROUP", depHR.id);

    const depOPS = await createDept("DEP_OPS", "Phòng Vận Hành", "UNIT");
    const grpWH = await createDept("GRP_WH", "Kho & Vật tư", "GROUP", depOPS.id);
    const grpLog = await createDept("GRP_LOG", "Vận chuyển & Điều phối", "GROUP", depOPS.id);
    const grpKit = await createDept("GRP_KIT", "Bếp trung tâm", "GROUP", depOPS.id);

    const deptMap = {
        "Phòng Công Nghệ": depTech.id,
        "Team AI & Data": teamAI.id,
        "Team Web Frontend": teamWeb.id,
        "Team Mobile App": teamMobile.id,
        "Team System & DevOps": teamSys.id,
        "Phòng Nhân Sự": depHR.id,
        "Tuyển dụng (Recruitment)": grpRec.id,
        "Lương thưởng (C&B)": grpCB.id,
        "Phòng Vận Hành": depOPS.id,
        "Kho & Vật tư": grpWH.id,
        "Vận chuyển & Điều phối": grpLog.id,
        "Bếp trung tâm": grpKit.id
    };

    // ========================================================
    // 4. TẠO USERS & WALLETS
    // ========================================================
    console.log("--> 4. Tạo Users...");
    const passwordHash = await bcrypt.hash("123456", 10);

    for (const u of MOCK_USERS) {
        let roleId = roles["EMPLOYEE"];
        if (u.jobTitle && (u.jobTitle.includes("Manager") || u.jobTitle.includes("Director") || u.jobTitle.includes("Head"))) {
            roleId = roles["SUPERVISOR"];
        }
        if (u.username === "admin_demo") roleId = roles["ADMIN"];
        if (u.username === "canteen_user") roleId = roles["CANTEEN"];

        const finalUsername = u.username || u.email.split('@')[0];
        const deptId = deptMap[u.departmentName] || null;

        const createdUser = await prisma.user.upsert({
            where: { username: finalUsername },
            update: { departmentId: deptId, fullName: u.fullName, roleId: roleId },
            create: {
                username: finalUsername,
                email: u.email,
                fullName: u.fullName,
                passwordHash,
                employeeCode: u.employeeCode,
                orgId: org.id,
                roleId: roleId,
                departmentId: deptId,
                jobTitle: u.jobTitle,
                phoneNumber: u.phoneNumber,
                address: u.address,
                gender: u.gender
            }
        });

        await prisma.wallets.upsert({
            where: { user_id: createdUser.id },
            update: {},
            create: { user_id: createdUser.id, balance: 0 }
        });
    }

    // ========================================================
    // 5. PHÂN QUYỀN 
    // ========================================================
    console.log("--> 5. Phân Quyền...");
    const permissionsData = [
        { code: "CONFIG", module: "CANTEEN", desc: "Cấu hình hệ thống" },
        { code: "INGREDIENTS", module: "CANTEEN", desc: "Quản lý nguyên liệu" },
        { code: "DISHES", module: "CANTEEN", desc: "Quản lý món ăn" },
        { code: "MENU", module: "CANTEEN", desc: "Quản lý thực đơn" },
        { code: "INVENTORY", module: "CANTEEN", desc: "Quản lý kho" },
        { code: "PURCHASING", module: "CANTEEN", desc: "Quản lý mua hàng" },
        { code: "REGISTRATION", module: "CANTEEN", desc: "Đăng ký suất ăn" },
        { code: "RATING", module: "CANTEEN", desc: "Đánh giá chất lượng" },
        { code: "PAYMENT", module: "CANTEEN", desc: "Thanh toán" },
        { code: "BOOKING_ROOM", module: "BOOKING", desc: "Quản lý phòng họp" },
        { code: "BOOKING_CAR", module: "BOOKING", desc: "Quản lý xe" },
        
        { code: "DISPATCH", module: "BOOKING", desc: "Điều phối xe" },
        { code: "DRIVER", module: "BOOKING", desc: "Quản lý tài xế" },
        
        { code: "REPORT", module: "SYSTEM", desc: "Báo cáo & Thống kê" },
        { code: "SYSTEM_ADMIN", module: "SYSTEM", desc: "Quản trị hệ thống" },
    ];

    for (const p of permissionsData) {
        await prisma.permissions.upsert({
            where: { code: p.code },
            update: { module: p.module, description: p.desc },
            create: { code: p.code, module: p.module, description: p.desc },
        });
    }

    const roleMapping = {
        "CANTEEN": ["CONFIG", "INGREDIENTS", "DISHES", "MENU", "INVENTORY", "PURCHASING", "REGISTRATION", "RATING", "PAYMENT"],
        "EMPLOYEE": ["MENU", "REGISTRATION", "RATING", "BOOKING_ROOM", "BOOKING_CAR"],
        "SUPERVISOR": ["MENU", "REGISTRATION", "RATING", "PAYMENT", "BOOKING_ROOM", "BOOKING_CAR", "DISPATCH", "DRIVER", "REPORT"],
        "ADMIN": ["SYSTEM_ADMIN", "CONFIG", "DISPATCH", "DRIVER", "REPORT"] 
    };

    for (const [roleName, permissionCodes] of Object.entries(roleMapping)) {
        const roleId = roles[roleName];
        if (!roleId) continue;
        const perms = await prisma.permissions.findMany({ where: { code: { in: permissionCodes } } });
        for (const p of perms) {
            await prisma.role_permissions.upsert({
                where: { role_id_permission_id: { role_id: roleId, permission_id: p.id } },
                update: {},
                create: { role_id: roleId, permission_id: p.id },
            });
        }
    }

    const adminUser = await prisma.user.findUnique({ where: { username: "admin_demo" } });
    await prisma.department.update({ where: { id: depTech.id }, data: { managerId: adminUser.id } });
    const hrUser = await prisma.user.findUnique({ where: { username: "employee_user" } });
    await prisma.department.update({ where: { id: depHR.id }, data: { managerId: hrUser.id } });
    const opsUser = await prisma.user.findUnique({ where: { username: "supervisor_user" } });
    await prisma.department.update({ where: { id: depOPS.id }, data: { managerId: opsUser.id } });

    // ========================================================
    // 6. CA LÀM VIỆC
    // ========================================================
    console.log("--> 6. Tạo Ca làm việc...");
    await prisma.shifts.create({
        data: {
            name: "Ca Trưa",
            start_time: new Date("1970-01-01T11:30:00Z"),
            end_time: new Date("1970-01-01T13:00:00Z"),
            booking_deadline: new Date("1970-01-01T10:00:00Z")
        }
    });

    // ========================================================
    // 7. NGUYÊN LIỆU 
    // ========================================================
    console.log("--> 7. Tạo Nguyên liệu...");
    const uomList = [
        { code: "kg", name: "Kilogram" }, { code: "g", name: "Gram" },
        { code: "l", name: "Lít" }, { code: "ml", name: "Millilit" },
        { code: "chai", name: "Chai" }, { code: "qua", name: "Quả/Trái" },
        { code: "goi", name: "Gói" }, { code: "hop", name: "Hộp" },
        { code: "lon", name: "Lon" }, { code: "bo", name: "Bó" }
    ];
    const uomMap = {};
    for (const u of uomList) {
        const res = await prisma.uom.upsert({ where: { code: u.code }, update: {}, create: u });
        uomMap[u.code] = res.id;
    }

    const groupList = [
        { code: "GRP_DRY", name: "Đồ khô" }, { code: "GRP_MEAT", name: "Thịt & Thủy hải sản" },
        { code: "GRP_VEG", name: "Rau củ quả" }, { code: "GRP_DRINK", name: "Đồ uống" },
        { code: "GRP_EGG", name: "Trứng & Sữa" }
    ];
    const groupMap = {};
    for (const g of groupList) {
        const res = await prisma.ingredientGroup.upsert({ where: { code: g.code }, update: {}, create: g });
        groupMap[g.code] = res.id;
    }

    const ingredients = [
        { code: "ING_GAO", name: "Gạo Tám Thơm", price: 20000, uom: "kg", group: "GRP_DRY" },
        { code: "ING_MAM", name: "Nước mắm", price: 35000, uom: "chai", group: "GRP_DRY" },
        { code: "ING_THIT_LON", name: "Thịt lợn ba chỉ", price: 120000, uom: "kg", group: "GRP_MEAT" },
        { code: "ING_THIT_BO", name: "Thịt bò thăn", price: 250000, uom: "kg", group: "GRP_MEAT" },
        { code: "ING_GA", name: "Thịt gà", price: 70000, uom: "kg", group: "GRP_MEAT" },
        { code: "ING_TRUNG", name: "Trứng gà", price: 3000, uom: "qua", group: "GRP_EGG" },
        { code: "ING_RAU_MUONG", name: "Rau muống", price: 10000, uom: "bo", group: "GRP_VEG" },
        { code: "ING_CA_CHUA", name: "Cà chua", price: 20000, uom: "kg", group: "GRP_VEG" },
    ];

    for (const ing of ingredients) {
        await prisma.ingredient.create({
            data: { code: ing.code, name: ing.name, price: ing.price, minStockLevel: 10, uomId: uomMap[ing.uom], groupId: groupMap[ing.group] }
        });
    }

    // ========================================================
    // 8. TẠO KHO
    // ========================================================
    console.log("--> 8. Tạo Warehouse...");
    const warehouseKeeper = await prisma.user.findUnique({ where: { username: "thu_kho_quan" } });
    await prisma.warehouse.upsert({
        where: { warehouse_code: "WH_MAIN" },
        update: {},
        create: {
            warehouse_code: "WH_MAIN", warehouse_name: "Kho Bếp Trung Tâm", location: "Tầng 1 - Bếp", status: "active",
            departmentId: grpWH.id, accountantId: warehouseKeeper ? warehouseKeeper.id : undefined, type: "AMBIENT", orgId: org.id
        }
    });

    // ========================================================
    // 9. MODULE XE - TẠO DỮ LIỆU XE 
    // ========================================================
    console.log("--> 9. Tạo Xe (Vehicles)...");
    
    const today = new Date();
    const pastDate = new Date(today); pastDate.setDate(today.getDate() - 3); // Hết hạn 3 ngày
    const soonDate10 = new Date(today); soonDate10.setDate(today.getDate() + 10); // Còn 10 ngày
    const soonDate25 = new Date(today); soonDate25.setDate(today.getDate() + 25); // Còn 25 ngày
    const safeDate = new Date("2026-12-31");

    const vehiclesData = [
        { name: "Toyota Camry", code: "VH001", plateNumber: "51A-12345", type: "Sedan 5 chỗ", seatCapacity: 5, fuelType: "Xăng", yearOfManufacture: 2022, status: "ON_TRIP", insuranceExpiry: pastDate, registrationExpiry: safeDate },
        { name: "Honda CR-V", code: "VH002", plateNumber: "51B-67890", type: "SUV 7 chỗ", seatCapacity: 7, fuelType: "Xăng", yearOfManufacture: 2023, status: "AVAILABLE", insuranceExpiry: safeDate, registrationExpiry: soonDate10 },
        { name: "Ford Transit", code: "VH003", plateNumber: "51C-11111", type: "Minivan 9 chỗ", seatCapacity: 9, fuelType: "Dầu", yearOfManufacture: 2021, status: "AVAILABLE", insuranceExpiry: safeDate, registrationExpiry: safeDate },
        { name: "Mercedes E-Class", code: "VH004", plateNumber: "51D-22222", type: "Sedan 5 chỗ", seatCapacity: 5, fuelType: "Xăng", yearOfManufacture: 2022, status: "MAINTENANCE", insuranceExpiry: safeDate, registrationExpiry: safeDate },
        { name: "Toyota Innova", code: "VH005", plateNumber: "51E-33333", type: "SUV 7 chỗ", seatCapacity: 7, fuelType: "Xăng", yearOfManufacture: 2020, status: "AVAILABLE", insuranceExpiry: safeDate, registrationExpiry: soonDate25 },
        { name: "Hyundai Accent", code: "VH006", plateNumber: "51F-44444", type: "Sedan 5 chỗ", seatCapacity: 5, fuelType: "Xăng", yearOfManufacture: 2019, status: "UNAVAILABLE", insuranceExpiry: safeDate, registrationExpiry: safeDate }
    ];

    for (const v of vehiclesData) {
        await prisma.vehicle.upsert({
            where: { code: v.code },
            update: {},
            create: {
                orgId: org.id,
                ...v,
                lastMaintenanceDate: new Date("2024-01-15"),
                nextMaintenanceDate: new Date("2024-04-15")
            }
        });
    }

    // ========================================================
    // 10. MODULE XE - TẠO TÀI XẾ 
    // ========================================================
    console.log("--> 10. Tạo Tài xế...");
    
    const driverRole = roles["DRIVER"];

    const driversList = [
        { username: "taixe_tung", name: "Phạm Thanh Tùng", license: "B2", exp: 6, status: "OFF_DUTY" }, // Nghỉ phép
        { username: "taixe_tuan", name: "Trần Minh Tuấn", license: "C", exp: 8, status: "AVAILABLE" },  // Sẵn sàng
        { username: "taixe_nam", name: "Lê Hoàng Nam", license: "D", exp: 10, status: "AVAILABLE" },    // Sẵn sàng
        { username: "taixe_hung", name: "Nguyễn Văn Hùng", license: "E", exp: 15, status: "ON_TRIP" }   // Đang chạy
    ];

    for (const d of driversList) {
        const user = await prisma.user.upsert({
            where: { username: d.username },
            update: {},
            create: {
                username: d.username, email: `${d.username}@demo.com`, fullName: d.name, passwordHash, orgId: org.id,
                roleId: driverRole, departmentId: depOPS.id, employeeCode: `DRV_${d.username.toUpperCase()}`
            }
        });

        await prisma.driver.upsert({
            where: { userId: user.id },
            update: {},
            create: {
                userId: user.id, licenseNumber: `GPLX-${d.username}`, licenseClass: d.license,
                licenseExpiry: new Date("2028-05-10"), yearsOfExperience: d.exp, status: d.status
            }
        });
    }

    // ========================================================
    // 11. CẤU HÌNH PHÊ DUYỆT & ƯU TIÊN (NEW)
    // ========================================================
    console.log("--> 11. Cấu hình Phê duyệt & Ưu tiên...");

    // 11.1 Booking Role Permissions
    // Định nghĩa quyền cơ bản cho từng Role
    const rolePermissions = [
        { roleName: "ADMIN", canBook: true, canBypass: true, canApprove: true, maxHours: 720 }, 
        { roleName: "SUPERVISOR", canBook: true, canBypass: true, canApprove: true, maxHours: 168 }, 
        { roleName: "EMPLOYEE", canBook: true, canBypass: false, canApprove: false, maxHours: 48 }, 
    ];

    for (const rp of rolePermissions) {
        const roleId = roles[rp.roleName];
        if (roleId) {
            await prisma.bookingRolePermission.create({
                data: {
                    roleId: roleId,
                    canBook: rp.canBook,
                    canBypassApproval: rp.canBypass,
                    canApproveOthers: rp.canApprove,
                    maxAdvanceHours: rp.maxHours
                }
            });
        }
    }

    // 11.2 Booking Priority Rules
    // Định nghĩa trọng số ưu tiên khi tranh chấp phòng
    const priorityRules = [
        { roleName: "ADMIN", weight: 100, preempt: true },      
        { roleName: "SUPERVISOR", weight: 50, preempt: true }, 
        { roleName: "EMPLOYEE", weight: 10, preempt: false },   
    ];

    for (const pr of priorityRules) {
        const roleId = roles[pr.roleName];
        if (roleId) {
            await prisma.bookingPriorityRule.create({
                data: {
                    roleId: roleId,
                    priorityWeight: pr.weight,
                    canPreemptLowerPriority: pr.preempt
                }
            });
        }
    }

    // 11.3 Booking Approval Policies
    // Tạo một số chính sách phê duyệt mẫu
    await prisma.bookingApprovalPolicy.createMany({
        data: [
            {
                orgId: org.id,
                name: "Chính sách mặc định (Cần duyệt)",
                isAutoApprove: false,
                requiresManagerApproval: true
            },
            {
                orgId: org.id,
                name: "Chính sách Ưu tiên Lãnh đạo (Tự động duyệt)",
                isAutoApprove: true,
                requiresManagerApproval: false,
                targetRoleId: roles["ADMIN"] 
            }
        ]
    });

    console.log("=========================================");
    console.log("SEED HOÀN TẤT");
    console.log("=========================================");
}

main()
    .catch((e) => {
        console.error("LỖI SEED:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });