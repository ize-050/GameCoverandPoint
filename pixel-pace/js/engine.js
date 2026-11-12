/* ==========================================================
   engine.js — pure game logic (no DOM): state, sprite art,
   run simulation, True-Effort Verification, quests, leveling.
   The UI subscribes through PP.bus events.
   ========================================================== */
window.PP = window.PP || {};

/* ---------- tiny event bus ---------- */
PP.bus = (() => {
  const h = {};
  return {
    on(e, fn) { (h[e] = h[e] || []).push(fn); },
    emit(e, d) { (h[e] || []).forEach((fn) => fn(d)); },
  };
})();

/* ---------- pixel sprites ---------- */
PP.sprite = (() => {
  // 12 x 16 character. h hair · s skin · k eye · b shirt · p pants · w shoes · a arm skin
  const BASE = [
    '....hhhh....',
    '...hhhhhh...',
    '..hhhhhhhh..',
    '..hsssssss..',
    '..sskssksss.',
    '..ssssssss..',
    '...ssssss...',
    '..bbbbbbbb..',
    '.abbbbbbbba.',
    '.abbbbbbbba.',
    '..bbbbbbbb..',
  ];
  const LEGS = [
    ['..pppppppp..', '..pppppppp..', '..ppp..ppp..', '..ppp..ppp..', '.wwww..wwww.'],
    ['..pppppppp..', '..pppppppp..', '...ppp.ppp..', '..ppp...ppp.', '.wwww...wwww'],
  ];
  const BOSS = [ // 16 x 16 dragon-ish blob
    '................',
    '...r........r...',
    '..rrr......rrr..',
    '..rrrrrrrrrrrr..',
    '.rrrrrrrrrrrrrr.',
    '.rrwwrrrrrrwwrr.',
    '.rrwkrrrrrrkwrr.',
    '.rrrrrrrrrrrrrr.',
    '.rrrrrryyrrrrrr.',
    '..rrrrryyrrrrr..',
    '..rrwrwrwrwrrr..',
    '...rrrrrrrrrr...',
    '..rr.rrrrrr.rr..',
    '..rr..rrrr..rr..',
    '.rrr..rrrr..rrr.',
    '.rr...rr.rr..rr.',
  ];

  function paint(ctx, rows, colors, scale) {
    rows.forEach((row, y) => {
      [...row].forEach((c, x) => {
        const col = colors[c];
        if (!col) return;
        ctx.fillStyle = col;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      });
    });
  }

  /** draw the runner onto a canvas. opts: {frame, palette, shoe, aura} */
  function drawHero(canvas, opts = {}) {
    const { frame = 0, palette, shoe = '#f4f1ff', aura = null } = opts;
    const P = palette || PP.COSMETICS.sprite[0].palette;
    const W = 12, H = 16;
    canvas.width = W * 4; canvas.height = H * 4;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const colors = { h: P.hair, s: '#ffcfa0', a: '#ffcfa0', k: '#14122b', b: P.shirt, p: P.pants, w: shoe };
    if (aura) { // pixel halo behind the sprite
      ctx.fillStyle = aura + '55';
      ctx.fillRect(0, 12, canvas.width, canvas.height - 16);
      ctx.fillStyle = aura + '33';
      ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
    }
    paint(ctx, BASE.concat(LEGS[frame % 2]), colors, 4);
    // 1px outline-ish shadow on the ground
    ctx.fillStyle = '#0006';
    ctx.fillRect(8, H * 4 - 3, W * 4 - 16, 3);
  }

  function drawBoss(canvas, frame = 0, hurt = false) {
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    paint(ctx, BOSS, { r: hurt ? '#ff9a9a' : '#ff4f4f', w: '#ffffff', k: '#14122b', y: '#ffd24f' }, 4);
  }

  return { drawHero, drawBoss };
})();

/* ---------- geo helpers ---------- */
PP.geo = {
  haversine(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  },
};

/* ---------- state ---------- */
PP.state = (() => {
  const C = PP.CONFIG;
  const s = {
    phase: 2,                      // TEV phase shown in demo (1 = MVP, 2 = wearables)
    mode: 'run',
    profile: { ...C.startProfile, gear: { shoes: 'white', aura: 'none', sprite: 'kid' } },
    run: null,                     // set by newRun()
  };
  s.newRun = () => {
    s.run = {
      status: 'idle',              // idle | running | paused | finished
      seconds: 0, meters: 0, xp: 0,
      segIdx: 0, segT: 0,          // position along ROUTE
      pos: PP.ROUTE[0].slice(),
      velSec: 0, flagged: false, flagReason: '',
      paceSec: 0,
      cleared: {}, bountyDone: {}, storyDefeated: false,
      tev: null,
      healthPause: false,
    };
  };
  s.newRun();
  return s;
})();

/* ---------- leveling ---------- */
PP.addXp = (amount) => {
  const p = PP.state.profile;
  p.xp += amount;
  let leveled = false;
  while (p.xp >= PP.xpNeeded(p.level)) {
    p.xp -= PP.xpNeeded(p.level);
    p.level += 1;
    leveled = true;
  }
  if (leveled) PP.bus.emit('levelup', p.level);
};

/* ---------- True-Effort Verification ---------- */
PP.tev = {
  /** evaluate all five layers for the current mode. returns layer statuses + overall verdict */
  evaluate(run) {
    const S = PP.state, M = PP.MODES[S.mode], C = PP.CONFIG;
    const full = S.phase >= 2;
    const moving = run.status === 'running';
    const L = [];

    // 1. velocity — active in every phase; sticky once flagged
    const over = M.kmh > C.velocityCapKmh;
    let st = run.flagged ? 'fail' : over && moving ? 'warn' : 'ok';
    L.push({ st, read: `${M.kmh.toFixed(0)} km/h` + (over ? `  ·  ${Math.min(run.velSec, C.velocityCapSeconds)}/${C.velocityCapSeconds}s over cap` : '') });

    // 2. cadence
    const noSteps = M.cadence < 20 && M.kmh > 3;
    L.push({ st: !full ? 'off' : noSteps ? 'fail' : 'ok', read: `${M.cadence} steps/min` + (noSteps ? '  ·  no impacts' : '') });

    // 3. heart rate
    let hrSt = 'ok', hrRead = `${M.hr} BPM`;
    if (M.hr >= C.hrDanger) { hrSt = 'fail'; hrRead += '  ·  DANGER'; }
    else if (M.kmh >= 12 && M.hr < 95) { hrSt = 'fail'; hrRead += '  ·  resting HR at speed'; }
    L.push({ st: !full ? 'off' : hrSt, read: hrRead });

    // 4. AI classification
    const aiBad = M.ai !== 'RUNNING';
    L.push({ st: !full ? 'off' : aiBad ? 'fail' : 'ok', read: `${M.ai}  ·  ${M.aiConf}%` });

    // 5. spatial route
    const hw = M.terrain === 'HIGHWAY';
    L.push({ st: !full ? 'off' : hw ? 'fail' : (M.elev ? 'ok' : 'warn'), read: `${M.terrain}` + (M.elev ? '  ·  elev ✓' : '  ·  flat') });

    // overall
    const dangerous = full && M.hr >= C.hrDanger;
    const blocked = run.flagged || L.some((l, i) => i > 0 && l.st === 'fail');
    let verdict = 'ok', title = 'EFFORT VERIFIED', sub = 'XP & quests are counting.';
    if (dangerous) { verdict = 'warn'; title = 'HEALTH WARNING'; sub = 'Heart rate too high — run paused for your safety.'; }
    else if (run.flagged) { verdict = 'fail'; title = 'VEHICULAR FLAG'; sub = 'XP & quest tracking suspended for this session.'; }
    else if (blocked) { verdict = 'fail'; title = 'NOT RUNNING'; sub = 'Layers disagree — distance is invalidated.'; }
    else if (L.some((l) => l.st === 'warn')) { verdict = 'warn'; title = 'WATCHING…'; sub = 'Suspicious signal, still earning XP.'; }

    return { layers: L, verdict, title, sub, blocked, dangerous };
  },
};

/* ---------- run simulation ---------- */
PP.sim = (() => {
  let timer = null;
  const C = PP.CONFIG;

  function pointAt(run) {
    const R = PP.ROUTE, a = R[run.segIdx], b = R[(run.segIdx + 1) % R.length];
    return [a[0] + (b[0] - a[0]) * run.segT, a[1] + (b[1] - a[1]) * run.segT];
  }

  function advance(run, meters) {
    let left = meters;
    while (left > 0) {
      const R = PP.ROUTE, a = R[run.segIdx], b = R[(run.segIdx + 1) % R.length];
      const segLen = PP.geo.haversine(a, b);
      const remain = segLen * (1 - run.segT);
      if (left < remain) { run.segT += left / segLen; left = 0; }
      else { left -= remain; run.segIdx = (run.segIdx + 1) % R.length; run.segT = 0; }
    }
    run.pos = pointAt(run);
  }

  function tick() {
    const S = PP.state, run = S.run, M = PP.MODES[S.mode];
    if (run.status !== 'running') return;
    const dt = C.simSecondsPerTick;

    // layer 1 sticky detection
    if (M.kmh > C.velocityCapKmh) run.velSec += dt; else run.velSec = Math.max(0, run.velSec - dt);
    if (!run.flagged && run.velSec >= C.velocityCapSeconds) {
      run.flagged = true;
      PP.bus.emit('flag', 'VEHICULAR');
    }

    const t = PP.tev.evaluate(run);
    run.tev = t;
    run.seconds += dt;

    if (t.dangerous) { // safety first: pause automatically
      run.status = 'paused'; run.healthPause = true;
      PP.bus.emit('status', run.status);
      PP.bus.emit('tick', run);
      return;
    }

    const meters = (M.kmh / 3.6) * dt;
    advance(run, meters); // avatar still moves, but may not count

    if (!t.blocked) {
      run.meters += meters;
      run.paceSec += M.kmh >= 10 ? dt : 0;
      const gain = meters * C.xpPerMeter;
      run.xp += gain;
      PP.addXp(gain);
      PP.state.profile.totalKm += meters / 1000;
      PP.bus.emit('xp', Math.round(gain));
      checkCheckpoints(run);
      checkBounties(run);
      checkStory(run);
    }
    PP.bus.emit('tick', run);
  }

  function checkCheckpoints(run) {
    PP.CHECKPOINTS.forEach((cp) => {
      if (run.cleared[cp.id]) return;
      if (PP.geo.haversine(run.pos, PP.ROUTE[cp.idx]) < 45) {
        run.cleared[cp.id] = true;
        PP.state.profile.gold += cp.reward.gold;
        PP.addXp(cp.reward.xp);
        PP.bus.emit('quest', { title: `${cp.name} CLEARED!`, reward: `+${cp.reward.gold} gold  +${cp.reward.xp} XP`, id: cp.id });
      }
    });
  }

  function checkBounties(run) {
    PP.BOUNTIES.forEach((b) => {
      if (run.bountyDone[b.id]) return;
      const v = bountyValue(b, run);
      if (v >= b.target) {
        run.bountyDone[b.id] = true;
        PP.state.profile.gold += b.reward.gold;
        PP.bus.emit('quest', { title: `BOUNTY: ${b.title}`, reward: `+${b.reward.gold} gold  ·  ${b.reward.item}`, id: b.id });
      }
    });
  }

  function checkStory(run) {
    if (!run.storyDefeated && PP.state.profile.totalKm >= C.storyTargetKm) {
      run.storyDefeated = true;
      PP.state.profile.gold += 300;
      PP.bus.emit('boss', true);
    }
  }

  PP.bountyValue = bountyValue;
  function bountyValue(b, run) {
    return b.kind === 'distance' ? run.meters : b.kind === 'pace' ? run.paceSec : run.xp;
  }

  return {
    start() {
      const run = PP.state.run;
      if (run.status === 'finished') PP.state.newRun();
      PP.state.run.status = 'running';
      PP.state.run.healthPause = false;
      if (!timer) timer = setInterval(tick, C.tickMs);
      PP.bus.emit('status', 'running');
    },
    pause() { PP.state.run.status = 'paused'; PP.bus.emit('status', 'paused'); },
    finish() {
      PP.state.run.status = 'finished';
      clearInterval(timer); timer = null;
      PP.bus.emit('status', 'finished');
    },
    reset() {
      clearInterval(timer); timer = null;
      PP.state.newRun();
      PP.bus.emit('status', 'idle');
      PP.bus.emit('tick', PP.state.run);
    },
    setMode(m) {
      PP.state.mode = m;
      PP.state.run.tev = PP.tev.evaluate(PP.state.run);
      PP.bus.emit('mode', m);
      PP.bus.emit('tick', PP.state.run);
    },
    setPhase(p) {
      PP.state.phase = p;
      PP.state.run.tev = PP.tev.evaluate(PP.state.run);
      PP.bus.emit('mode', PP.state.mode);
      PP.bus.emit('tick', PP.state.run);
    },
  };
})();
