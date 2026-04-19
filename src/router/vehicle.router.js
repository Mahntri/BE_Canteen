import { Router } from "express";
import {
    listVehicles,
    createVehicle,
    getVehicle,
    updateVehicle,
    deleteVehicle,
    toggleVehicleActive,
    listVehicleDocuments,
    createVehicleDocument,
    deleteVehicleDocument,
} from "../controller/vehicle.controller.js";

const router = Router();

// Vehicles CRUD
router.get("/", listVehicles);
router.post("/", createVehicle);
router.get("/:id", getVehicle);
router.patch("/:id", updateVehicle);
router.patch("/:id/toggle-active", toggleVehicleActive);
router.delete("/:id", deleteVehicle);

// Vehicle Documents
router.get("/:id/documents", listVehicleDocuments);
router.post("/:id/documents", createVehicleDocument);
router.delete("/:id/documents/:docId", deleteVehicleDocument);

export default router;
