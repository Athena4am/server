import express from "express";

import {
  createRunController,
  getRunController,
  registerEventController,
  finishRunController,
  getRunHistoryController,
} from "../controllers/runs.controller.js";

const router = express.Router();

router.post(
  "/",
  createRunController,
);

// Historial de partidas de un usuario: GET /runs/history?authUserId=...
// Debe ir ANTES de la ruta "/:runId" para no ser capturada por ella.
router.get(
  "/history",
  getRunHistoryController,
);

router.get(
  "/:runId",
  getRunController,
);

router.post(
  "/:runId/events",
  registerEventController,
);

router.post(
  "/:runId/finish",
  finishRunController,
);

export default router;