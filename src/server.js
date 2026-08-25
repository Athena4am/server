import express from "express";
import crypto from "node:crypto";

const app = express();

app.use(express.json());

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

  res.status(201).json({
    runId,
    seed,
  });
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(
    `[MurphMCRankeds] API escuchando en http://localhost:${PORT}`,
  );
});