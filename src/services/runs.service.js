import crypto from "node:crypto";
import sql from "../db.js";
import { EVENT_ORDER, NORMAL_EVENTS } from "../config/events.js";

const PAR_TIME_BASE_SECONDS = 1200; // 20 minutos de referencia.

export function calcularParTime(seed) {
  // Par time determinista por seed: varía entre 80% y 120% del base.
  const normalized = ((seed % 1000) + 1000) % 1000;
  const factor = 0.8 + (normalized / 1000) * 0.4;
  return Math.round(PAR_TIME_BASE_SECONDS * factor);
}

export async function createRun(authUserId) {
  const seed = Math.floor(
    Math.random() * 2_000_000_000,
  );

  const runId = `run_${crypto.randomBytes(4).toString("hex")}`;
  const parTime = calcularParTime(seed);

  const [run] = await sql`
    insert into runs (
      run_id,
      seed,
      status,
      milestones,
      events,
      par_time
    )
    values (
      ${runId},
      ${seed},
      ${"created"},
      ${{}},
      ${[]},
      ${parTime}
    )
    returning run_id, seed, status, par_time;
  `;

  if (authUserId) {
    await sql`
      update runs
      set auth_user_id = ${authUserId}
      where run_id = ${runId}
    `;
  }

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

export async function registerEvent(runId, event) {
  const [run] = await sql`
    select *
    from runs
    where run_id = ${runId}
  `;

  if (!run) {
    return {
      error: "RUN_NOT_FOUND",
    };
  }

  if (!EVENT_ORDER.includes(event)) {
    return {
      error: "INVALID_EVENT",
    };
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
    const updatedEvents = [
      ...events,
      event,
    ];

    await sql`
      update runs
      set
        events = ${updatedEvents},
        status = 'abandoned',
        finished_at = now()
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

  const receivedIndex =
    NORMAL_EVENTS.indexOf(event);

  if (receivedIndex !== expectedIndex) {
    return {
      error: "EVENT_OUT_OF_ORDER",
      expected: NORMAL_EVENTS[expectedIndex] ?? null,
      received: event,
    };
  }

  const updatedEvents = [
    ...events,
    event,
  ];

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

export async function finishRun(runId, { startedAt, finishedAt }) {
  const [run] = await sql`
    select *
    from runs
    where run_id = ${runId}
  `;

  if (!run) {
    return { error: "RUN_NOT_FOUND" };
  }

  const started = startedAt ? new Date(startedAt) : run.started_at;
  const finished = finishedAt ? new Date(finishedAt) : run.finished_at;

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

  await sql`
    update runs
    set
      duration_seconds = ${durationSeconds},
      status = 'finished',
      finished_at = now()
    where run_id = ${runId}
  `;

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

  return {
    runId,
    status: "finished",
    durationSeconds,
    parTime,
    eloDelta,
    newElo,
  };
}