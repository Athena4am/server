import {
  createRun,
  getRun,
  registerEvent,
  finishRun,
} from "../services/runs.service.js";

export async function createRunController(req, res) {
  try {
    const { authUserId } = req.body ?? {};
    const run = await createRun(authUserId);

    return res.status(201).json(run);
  } catch (error) {
    console.error(
      "[API] Error creando run:",
      error,
    );

    return res.status(500).json({
      error: "No se pudo crear la run.",
    });
  }
}

export async function finishRunController(req, res) {
  const { runId } = req.params;
  const { startedAt, finishedAt } = req.body ?? {};

  try {
    const result = await finishRun(runId, { startedAt, finishedAt });

    if (result.error === "RUN_NOT_FOUND") {
      return res.status(404).json({ error: "Run no encontrada." });
    }

    if (result.error === "INVALID_TIMESTAMPS") {
      return res.status(400).json({ error: "Timestamps inválidos." });
    }

    return res.json(result);
  } catch (error) {
    console.error("[API] Error finalizando run:", error);
    return res.status(500).json({ error: "No se pudo finalizar la run." });
  }
}

export async function getRunController(req, res) {
  const { runId } = req.params;

  try {
    const run = await getRun(runId);

    if (!run) {
      return res.status(404).json({
        error: "Run no encontrada.",
      });
    }

    return res.json(run);
  } catch (error) {
    console.error(
      "[API] Error obteniendo run:",
      error,
    );

    return res.status(500).json({
      error: "No se pudo obtener la run.",
    });
  }
}

export async function registerEventController(req, res) {
  const { runId } = req.params;
  const { event } = req.body;

  try {
    const result = await registerEvent(
      runId,
      event,
    );

    if (result.error === "RUN_NOT_FOUND") {
      return res.status(404).json({
        error: "Run no encontrada.",
      });
    }

    if (result.error === "INVALID_EVENT") {
      return res.status(400).json({
        error: "Evento inválido.",
      });
    }

    if (
      result.error === "EVENT_ALREADY_REGISTERED"
    ) {
      return res.status(409).json({
        error: "Evento ya registrado.",
        runId,
        event,
      });
    }

    if (
      result.error === "EVENT_OUT_OF_ORDER"
    ) {
      return res.status(409).json({
        error: "Evento fuera de orden.",
        expected: result.expected,
        received: result.received,
      });
    }

    return res.status(201).json(result);
  } catch (error) {
    console.error(
      "[API] Error registrando evento:",
      error,
    );

    return res.status(500).json({
      error: "No se pudo registrar el evento.",
    });
  }
}