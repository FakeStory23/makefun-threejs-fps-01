// The match: five rounds to win, nine at most, and every round is a small
// economy. The round machine owns the phase, the timers, the money and the bomb;
// it decides nothing about positions or shooting, it only says what happens
// when the world reports a fact (a kill, a plant, a timeout).
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const DEFUSE_SECONDS = 5;
export const PLANT_SECONDS = 3;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const ECONOMY = {
  startMoney: 800,
  kill: 300,
  plant: 300,
  win: 3250,
  loss: 1900,
};

export function createRounds() {
  const state = {
    phase: 'menu', // menu | buy | live | end | match
    round: 1,
    score: [0, 0], // [attackers, defenders]
    timer: 0,
    winner: -1,
    winReason: '',
    bomb: {
      state: 'carried', // carried | planted | exploded | defused
      site: null,
      pos: null,
      plantProgress: 0,
      fuse: 0,
      defuseProgress: 0,
      defuser: null,
    },
  };

  function resetBomb() {
    state.bomb.state = 'carried';
    state.bomb.site = null;
    state.bomb.pos = null;
    state.bomb.plantProgress = 0;
    state.bomb.fuse = 0;
    state.bomb.defuseProgress = 0;
    state.bomb.defuser = null;
  }

  return {
    state,
    startMatch() {
      state.score = [0, 0];
      state.round = 1;
      state.winner = -1;
      state.winReason = '';
      resetBomb();
      state.phase = 'buy';
      state.timer = BUY_SECONDS;
    },
    startRound() {
      resetBomb();
      state.phase = 'buy';
      state.timer = BUY_SECONDS;
    },
    openBuy() {
      state.phase = 'buy';
      state.timer = BUY_SECONDS;
    },
    startLive() {
      state.phase = 'live';
      state.timer = ROUND_SECONDS;
    },
    plant(site, x, z) {
      state.bomb.state = 'planted';
      state.bomb.site = site;
      state.bomb.pos = { x, z };
      state.bomb.fuse = BOMB_SECONDS;
      state.bomb.defuseProgress = 0;
      state.bomb.defuser = null;
    },
    // Advances the clock one step. Returns an event string when the phase
    // changes, so the caller can react once: 'live' | 'timeout' | 'explode'.
    tick(dt) {
      if (state.phase === 'buy') {
        state.timer -= dt;
        if (state.timer <= 0) {
          state.phase = 'live';
          state.timer = ROUND_SECONDS;
          return 'live';
        }
      } else if (state.phase === 'live') {
        if (state.bomb.state === 'planted') {
          state.bomb.fuse -= dt;
          if (state.bomb.fuse <= 0) {
            state.bomb.state = 'exploded';
            return 'explode';
          }
        } else {
          state.timer -= dt;
          if (state.timer <= 0) return 'timeout';
        }
      }
      return null;
    },
    endRound(winner, reason) {
      state.phase = 'end';
      state.winner = winner;
      state.winReason = reason;
      state.score[winner] += 1;
      state.timer = 4.5;
    },
    nextRound() {
      if (state.score[0] >= WIN_ROUNDS || state.score[1] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
        state.phase = 'match';
        state.winner = state.score[0] > state.score[1] ? 0 : state.score[1] > state.score[0] ? 1 : 0;
        state.winReason = state.score[0] === state.score[1] ? 'Draw — attackers take it on rounds' : 'Match over';
        state.timer = 0;
        return 'match';
      }
      state.round += 1;
      state.winner = -1;
      state.winReason = '';
      resetBomb();
      state.phase = 'buy';
      state.timer = BUY_SECONDS;
      return 'buy';
    },
    matchWinner() {
      return state.score[0] > state.score[1] ? 0 : state.score[1] > state.score[0] ? 1 : 0;
    },
  };
}
