import {
  createRun,
  getRun,
  registerEvent,
  finishRun,
  getRunHistory,
} from "../services/runs.service.js";

export async function createRunController(req, res) {
  try {
    // El dueño de la run es el usuario autenticado por el token.
    const authUserId = req.authUser?.id ?? null;
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
  const requesterUserId = req.authUser?.id ?? null;

  try {
    const result = await finishRun(runId, requesterUserId);

    if (result.error === "RUN_NOT_FOUND") {
      return res.status(404).json({ error: "Run no encontrada." });
    }

    if (result.error === "RUN_NOT_COMPLETED") {
      return res.status(400).json({
        error: "La run no completó todos los hitos. No se puntúa.",
      });
    }

    if (result.error === "INVALID_TIMESTAMPS") {
      return res.status(400).json({ error: "Timestamps inválidos." });
    }

    if (result.error === "FORBIDDEN") {
      return res.status(403).json({ error: "No autorizado." });
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
  const requesterUserId = req.authUser?.id ?? null;

  try {
    const result = await registerEvent(runId, event, requesterUserId);

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

    if (result.error === "FORBIDDEN") {
      return res.status(403).json({
        error: "No autorizado.",
      });
    }

    if (result.error === "EVENT_ALREADY_REGISTERED") {
      return res.status(409).json({
        error: "Evento ya registrado.",
        runId,
        event,
      });
    }

    if (result.error === "EVENT_OUT_OF_ORDER") {
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

export async function getRunHistoryController(req, res) {
  const authUserId = req.authUser?.id ?? null;

  if (!authUserId) {
    return res.status(401).json({
      error: "No autenticado.",
    });
  }

  try {
    const history = await getRunHistory(authUserId);
    return res.json(history);
  } catch (error) {
    console.error(
      "[API] Error obteniendo historial:",
      error,
    );

    return res.status(500).json({
      error: "No se pudo obtener el historial.",
    });
  }
}