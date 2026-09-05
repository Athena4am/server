import express from "express";

import {
  createRunController,
  getRunController,
  registerEventController,
  finishRunController,
} from "../controllers/runs.controller.js";

const router = express.Router();

router.post(
  "/",
  createRunController,
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