import express from "express";
import runsRouter from "./routes/runs.routes.js";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "MurphMCRankeds API",
    status: "online",
  });
});

app.use("/runs", runsRouter);

export default app;