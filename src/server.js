import express from "express";
import crypto from "node:crypto";

const app = express();

app.use(express.json());

const runs = new Map();

const EVENT_ORDER = [
  "player_joined",
  "entered_nether",
  "entered_end",
  "game_over",
];

app.get("/", (req, res) => {
  res.json({
    name: "MurphMCRankeds API",
    status: "online",
  });
});

app.post("/runs", (req, res) => {
  const seed = Math.floor(
    Math.random() * 2_000_000_000,
  );

  const runId = `run_${crypto.randomBytes(4).toString("hex")}`;

  runs.set(runId, {
    runId,
    seed,
    status: "created",
    events: [],
  });

  res.status(201).json({
    runId,
    seed,
  });
});

app.post("/runs/:runId/events", (req, res) => {
  const { runId } = req.params;
  const { event } = req.body;

  const run = runs.get(runId);

  if (!run) {
    return res.status(404).json({
      error: "Run no encontrada.",
    });
  }

  if (!EVENT_ORDER.includes(event)) {
    return res.status(400).json({
      error: "Evento inválido.",
    });
  }

  // Evitar duplicados
  if (run.events.includes(event)) {
    return res.status(409).json({
      error: "Evento ya registrado.",
      runId,
      event,
    });
  }

  // Validar orden
  const expectedIndex = run.events.length;
  const receivedIndex = EVENT_ORDER.indexOf(event);

  if (receivedIndex !== expectedIndex) {
    return res.status(409).json({
      error: "Evento fuera de orden.",
      expected: EVENT_ORDER[expectedIndex],
      received: event,
    });
  }

  run.events.push(event);

  if (event === "player_joined") {
    run.status = "running";
  }

  if (event === "game_over") {
    run.status = "finished";
  }

  return res.status(201).json({
    success: true,
    runId,
    event,
    status: run.status,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `[MurphMCRankeds] API escuchando en http://localhost:${PORT}`,
  );
});