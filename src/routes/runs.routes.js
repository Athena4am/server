import express from "express";

import {
  createRunController,
  getRunController,
  registerEventController,
  finishRunController,
  getRunHistoryController,
} from "../controllers/runs.controller.js";

import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Crear una run SOLO con sesión: se registra el auth_user_id del token.
router.post(
  "/",
  requireAuth,
  createRunController,
);

// Historial de partidas del usuario autenticado: GET /runs/history
// Debe ir ANTES de la ruta "/:runId" para no ser capturada por ella.
router.get(
  "/history",
  requireAuth,
  getRunHistoryController,
);

router.get(
  "/:runId",
  getRunController,
);

// Registrar eventos / finalizar: requieren sesión y que la run sea del usuario.
router.post(
  "/:runId/events",
  requireAuth,
  registerEventController,
);

router.post(
  "/:runId/finish",
  requireAuth,
  finishRunController,
);

export default router;