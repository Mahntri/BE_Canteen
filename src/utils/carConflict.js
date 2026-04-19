import prisma from '../config/prisma.js';

export const checkConflict = async (startTime, endTime, vehicleId, driverId, excludeBookingId = null) => {
    const whereClause = {
        status: { in: ['ASSIGNED', 'ON_TRIP', 'INCIDENT'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        ...(excludeBookingId && { id: { not: excludeBookingId } }),
        OR: []
    };

    if (vehicleId) whereClause.OR.push({ vehicleId: Number(vehicleId) });
    if (driverId) whereClause.OR.push({ driverId: Number(driverId) });

    if (whereClause.OR.length === 0) return null; 

    const conflict = await prisma.carBooking.findFirst({
        where: whereClause,
        include: { vehicle: true, driver: { include: { user: true } } }
    });

    return conflict; 
};