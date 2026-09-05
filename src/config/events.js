export const EVENT_ORDER = [
  "player_joined",
  "entered_nether",
  "entered_end",
  "dragon_killed",
  "surrender",
  "player_left",
  "game_over",
];

export const NORMAL_EVENTS = EVENT_ORDER.filter(
  (event) =>
    event !== "surrender" &&
    event !== "player_left",
);