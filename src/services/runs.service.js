import crypto from "node:crypto";
import sql from "../db.js";
import { EVENT_ORDER, NORMAL_EVENTS } from "../config/events.js";

const PAR_TIME_BASE_SECONDS = 1200; // 20 minutos de referencia.

export function calcularParTime(seed) {
  // Par time determinista por seed: varía entre 80% y 120% del base.
  // La seed puede venir como string largo (hasta 2^64 en Bedrock);
  // tomamos los últimos dígitos para el cálculo sin perder precisión.
  let lastDigits = Number(seed);
  const seedStr = String(seed);
  if (seedStr.length > 9) {
    // Quedarnos con los últimos 9 dígitos es suficiente para variar el par.
    lastDigits = Number(seedStr.slice(-9));
  }
  if (!Number.isFinite(lastDigits) || Number.isNaN(lastDigits)) {
    lastDigits = 0;
  }

  const normalized = ((lastDigits % 1000) + 1000) % 1000;
  const factor = 0.8 + (normalized / 1000) * 0.4;
  return Math.round(PAR_TIME_BASE_SECONDS * factor);
}

// Eventos que dejan la run sin puntuar (no cambian el ELO).
export const IA_SPAM_EVENTS = ["surrender", "player_left"];

// ─────────────────────────────────────────────
// SEEDS CURADAS (speedrun-friendly)
// ─────────────────────────────────────────────
// El servidor elige de esta lista manual, NO al azar. Cada seed debe
// haber sido verificada manualmente (generando el mundo) y cumplir:
//   - portal + lava + aldea + cofre cerca del spawn (overworld)
//   - bastión y fortaleza accesibles justo al entrar al Nether
//
// ⚠️ Estas strings son marcadores que DEBEN reemplazarse por seeds
// reales verificadas. Las seeds de Minecraft se guardan como string
// (admite numeros largos que superan el entero de 32 bits).
const SEEDS_CURADAS = [
  // "REEMPLAZA_ESTA_SEED",
];

// Selecciona la próxima seed curada (rotación simple para no repetir
// seguido y que cada run use una seed verificada).
let ultimaSeedIdx = -1;

function seleccionarSeed() {
  if (SEEDS_CURADAS.length === 0) {
    // Fallback: seed aleatoria si aún no hay seeds curadas cargadas.
    return String(Math.floor(Math.random() * 2_000_000_000));
  }

  ultimaSeedIdx = (ultimaSeedIdx + 1) % SEEDS_CURADAS.length;
  return SEEDS_CURADAS[ultimaSeedIdx];
}

export async function createRun(authUserId) {
  const seed = seleccionarSeed();

  const runId = `run_${crypto.randomBytes(4).toString("hex")}`;
  const parTime = calcularParTime(seed);

  const [run] = await sql`
    insert into runs (
      run_id,
      seed,
      status,
      milestones,
      events,
      par_time,
      auth_user_id
    )
    values (
      ${runId},
      ${seed},
      ${"created"},
      ${{}},
      ${[]},
      ${parTime},
      ${authUserId}
    )
    returning run_id, seed, status, par_time;
  `;

  return {
    runId: run.run_id,
    seed: run.seed,
    status: run.status,
    parTime: run.par_time,
  };
}

export async function getRun(runId) {
  const [run] = await sql`
    select *
    from runs
    where run_id = ${runId}
  `;

  if (!run) {
    return null;
  }

  return {
    runId: run.run_id,
    seed: run.seed,
    status: run.status,
    player: run.player,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    milestones: run.milestones,
    events: run.events,
  };
}

export async function registerEvent(runId, event, requesterUserId = null) {
  const [run] = await sql`
    select *
    from runs
    where run_id = ${runId}
  `;

  if (!run) {
    return { error: "RUN_NOT_FOUND" };
  }

  // Solo el dueño de la run puede registrarle eventos.
  if (requesterUserId && run.auth_user_id && run.auth_user_id !== requesterUserId) {
    return { error: "FORBIDDEN" };
  }

  if (!EVENT_ORDER.includes(event)) {
    return { error: "INVALID_EVENT" };
  }

  const events = run.events ?? [];

  if (events.includes(event)) {
    return {
      error: "EVENT_ALREADY_REGISTERED",
      runId,
      event,
    };
  }

  // Eventos que terminan la run inmediatamente.
  if (
    event === "surrender" ||
    event === "player_left"
  ) {
    const updatedEvents = [...events, event];

    await sql`
      update runs
      set
        events = ${updatedEvents},
        status = 'abandoned',
        finished_at = now(),
        elo_delta = 0
      where run_id = ${runId}
    `;

    return {
      success: true,
      runId,
      event,
      status: "abandoned",
    };
  }

  // Determinar qué evento debería recibirse ahora.
  const expectedIndex = events.filter(
    (item) =>
      item !== "surrender" &&
      item !== "player_left",
  ).length;

  const receivedIndex = NORMAL_EVENTS.indexOf(event);

  if (receivedIndex !== expectedIndex) {
    return {
      error: "EVENT_OUT_OF_ORDER",
      expected: NORMAL_EVENTS[expectedIndex] ?? null,
      received: event,
    };
  }

  const updatedEvents = [...events, event];

  let status = run.status;

  if (event === "player_joined") {
    status = "running";
  }

  if (event === "game_over") {
    status = "finished";
  }

  await sql`
    update runs
    set
      events = ${updatedEvents},
      status = ${status},
      started_at = case
        when ${event} = 'player_joined'
        then coalesce(started_at, now())
        else started_at
      end,
      finished_at = case
        when ${event} = 'game_over'
        then now()
        else finished_at
      end
    where run_id = ${runId}
  `;

  return {
    success: true,
    runId,
    event,
    status,
  };
}

const BASE_ELO = 1000;
const MAX_ELO_DELTA = 50;
const ELO_PER_PERCENT = 0.5; // 0.5 ELO por cada 1% de desviación.

// Eventos que deben haberse registrado ANTES de poder puntuar una run.
const REQUIRED_EVENTS_TO_SCORE = [
  "player_joined",
  "entered_nether",
  "entered_end",
  "dragon_killed",
  "game_over",
];

export async function finishRun(runId, requesterUserId = null) {
  const [run] = await sql`
    select *
    from runs
    where run_id = ${runId}
  `;

  if (!run) {
    return { error: "RUN_NOT_FOUND" };
  }

  // Solo el dueño puede finalizar su propia run.
  if (requesterUserId && run.auth_user_id && run.auth_user_id !== requesterUserId) {
    return { error: "FORBIDDEN" };
  }

  // ── Idempotencia ─────────────────────────────────────
  // Si la run ya fue puntuada (new_elo calculado o elo_delta guardado
  // para abandono), devolvemos el resultado sin volver a aplicarlo.
  if (run.elo_delta !== null && run.elo_delta !== undefined) {
    return {
      runId,
      status: run.status,
      durationSeconds: run.duration_seconds,
      parTime: run.par_time ?? calcularParTime(run.seed),
      eloDelta: run.elo_delta,
      newElo: run.new_elo,
      alreadyScored: true,
    };
  }

  // ── Solo se puntúa si la run terminó correctamente ──
  // (game_over registrado con todos los hitos previos).
  const events = run.events ?? [];

  const hasGameOver = events.includes("game_over");
  const hasAllRequired = REQUIRED_EVENTS_TO_SCORE.every((ev) =>
    events.includes(ev),
  );

  if (!hasGameOver || !hasAllRequired) {
    return { error: "RUN_NOT_COMPLETED" };
  }

  // ── Tiempo real registrado por el SERVIDOR ──────────
  // Usamos started_at y finished_at que el propio servidor escribió
  // cuando recibió player_joined y game_over. NUNCA confiamos en
  // timestamps enviados por el cliente.
  const started = run.started_at ? new Date(run.started_at) : null;
  const finished = run.finished_at ? new Date(run.finished_at) : null;

  if (!started || !finished || Number.isNaN(started.getTime()) || Number.isNaN(finished.getTime())) {
    return { error: "INVALID_TIMESTAMPS" };
  }

  const durationSeconds = Math.max(
    0,
    Math.round((finished.getTime() - started.getTime()) / 1000),
  );

  const parTime = run.par_time ?? calcularParTime(run.seed);
  const deviationPct = ((parTime - durationSeconds) / parTime) * 100;

  let eloDelta = Math.round(deviationPct * ELO_PER_PERCENT);
  eloDelta = Math.max(-MAX_ELO_DELTA, Math.min(MAX_ELO_DELTA, eloDelta));

  let newElo = null;

  if (run.auth_user_id) {
    const [profile] = await sql`
      select elo
      from profiles
      where auth_user_id = ${run.auth_user_id}
    `;

    if (profile) {
      newElo = Math.max(0, (profile.elo ?? BASE_ELO) + eloDelta);

      await sql`
        update profiles
        set elo = ${newElo}
        where auth_user_id = ${run.auth_user_id}
      `;
    }
  }

  await sql`
    update runs
    set
      duration_seconds = ${durationSeconds},
      status = 'finished',
      elo_delta = ${eloDelta},
      new_elo = ${newElo}
    where run_id = ${runId}
  `;

  return {
    runId,
    status: "finished",
    durationSeconds,
    parTime,
    eloDelta,
    newElo,
    alreadyScored: false,
  };
}

export async function getRunHistory(authUserId, limit = 20) {
  const runs = await sql`
    select
      run_id,
      status,
      started_at,
      finished_at,
      elo_delta,
      new_elo,
      duration_seconds
    from runs
    where auth_user_id = ${authUserId}
      -- Solo partidas que se jugaron de verdad: excluir runs "created"
      -- creadas pero nunca iniciadas (sin eventos y sin tiempos).
      and (
        exists (select 1 from jsonb_array_elements_text(events) ev where ev not in ('player_joined'))
        or started_at is not null
        or status in ('finished', 'abandoned')
      )
    order by coalesce(finished_at, started_at, created_at) desc
    limit ${limit}
  `;

  return runs.map((run) => ({
    runId: run.run_id,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    eloDelta: run.elo_delta,
    newElo: run.new_elo,
    durationSeconds: run.duration_seconds,
  }));
}