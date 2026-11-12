/* ==========================================================
   ui.js — rendering & DOM bindings. Reads PP.state, listens to PP.bus.
   ========================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const S = PP.state, C = PP.CONFIG;
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (s) => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;

  /* ---------- clock ---------- */
  const tickClock = () => { const d = new Date(); $('clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  tickClock(); setInterval(tickClock, 30000);

  /* ---------- toast & modal ---------- */
  let toastT;
  function toast(html) {
    const t = $('toast'); t.innerHTML = html; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }
  function modal(html, onClose) {
    const m = $('modal'), box = $('modal-box');
    box.innerHTML = html + '<button class="btn" id="modal-ok">AWESOME!</button>';
    m.classList.add('on');
    $('modal-ok').onclick = () => { m.classList.remove('on'); onClose && onClose(); };
  }

  /* ---------- gear helpers ---------- */
  const gear = () => {
    const g = S.profile.gear, K = PP.COSMETICS;
    return {
      shoe: K.shoes.find((x) => x.id === g.shoes).color,
      aura: K.aura.find((x) => x.id === g.aura).color,
      palette: K.sprite.find((x) => x.id === g.sprite).palette,
    };
  };
  let frame = 0;
  function drawAvatars() {
    const g = gear();
    PP.sprite.drawHero($('hud-avatar'), { frame, palette: g.palette, shoe: g.shoe, aura: g.aura });
    PP.sprite.drawHero($('hero-canvas'), { frame, palette: g.palette, shoe: g.shoe, aura: g.aura });
    if (playerCanvas) PP.sprite.drawHero(playerCanvas, { frame, palette: g.palette, shoe: g.shoe, aura: g.aura });
  }
  setInterval(() => { frame++; drawAvatars(); }, 350);

  /* ---------- map ---------- */
  let map, playerMarker, playerCanvas, trail, trailPts = [];
  const flagMarkers = {};
  function initMap() {
    if (!window.L) { $('map').style.background = '#12351c'; return; }
    map = L.map('map', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, keyboard: false })
      .setView(C.center, C.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true }).addTo(map);
    L.polyline(PP.ROUTE.concat([PP.ROUTE[0]]), { color: '#ffd24f', weight: 4, opacity: .55, dashArray: '4 8' }).addTo(map);
    trail = L.polyline([], { color: '#7cff4f', weight: 7, opacity: .95, lineCap: 'square', lineJoin: 'miter' }).addTo(map);

    PP.CHECKPOINTS.forEach((cp) => {
      const icon = L.divIcon({ className: '', html: `<div class="pp-flag pulse" id="flag-${cp.id}">${cp.icon}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      flagMarkers[cp.id] = L.marker(PP.ROUTE[cp.idx], { icon }).addTo(map);
    });

    const pi = L.divIcon({ className: '', html: '<div class="pp-player" id="pp-player"><canvas id="pp-player-cv"></canvas></div>', iconSize: [40, 52], iconAnchor: [20, 46] });
    playerMarker = L.marker(PP.ROUTE[0], { icon: pi, zIndexOffset: 1000 }).addTo(map);
    playerCanvas = playerMarker.getElement().querySelector('canvas');
    map.setView(PP.ROUTE[0], C.zoom);
  }

  /* ---------- nav ---------- */
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.screen === name));
    if (name === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
    if (name === 'quests') $('quest-dot').classList.remove('on');
    render();
  }
  $('nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.screen); });

  /* ---------- run controls ---------- */
  function renderControls() {
    const r = S.run, el = $('controls');
    el.className = 'controls' + (r.status === 'running' || r.status === 'paused' ? ' two' : '');
    if (r.status === 'idle') el.innerHTML = '<button class="btn" data-a="start">▶ START RUN</button>';
    else if (r.status === 'running') el.innerHTML = '<button class="btn amber" data-a="pause">❚❚ PAUSE</button><button class="btn pink" data-a="finish">■ FINISH</button>';
    else if (r.status === 'paused') el.innerHTML = '<button class="btn" data-a="start">▶ RESUME</button><button class="btn pink" data-a="finish">■ FINISH</button>';
    else el.innerHTML = '<button class="btn" data-a="reset">↻ NEW RUN</button>';
  }
  $('controls').addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'start') PP.sim.start();
    if (a === 'pause') PP.sim.pause();
    if (a === 'finish') PP.sim.finish();
    if (a === 'reset') { PP.sim.reset(); trailPts = []; trail && trail.setLatLngs([]); resetFlags(); }
  });

  /* ---------- cheat drawer ---------- */
  $('mode-grid').innerHTML = Object.entries(PP.MODES)
    .map(([k, m]) => `<button class="btn small ${m.cls}" data-mode="${k}">${m.label}</button>`).join('');
  $('sim-toggle').onclick = () => { $('sim-drawer').classList.add('on'); $('hud-bottom').style.display = 'none'; $('sim-toggle').style.display = 'none'; };
  const closeDrawer = () => { $('sim-drawer').classList.remove('on'); $('hud-bottom').style.display = ''; $('sim-toggle').style.display = ''; };
  $('sim-close').onclick = closeDrawer;
  $('mode-grid').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { PP.sim.setMode(b.dataset.mode); } });
  $('phase-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) PP.sim.setPhase(+b.dataset.phase); });

  /* ---------- renderers ---------- */
  function renderHud() {
    const p = S.profile, r = S.run;
    $('hud-lv').textContent = 'LV ' + p.level;
    $('hud-xpbar').style.width = (100 * p.xp / PP.xpNeeded(p.level)) + '%';
    $('hud-gold').textContent = Math.round(p.gold);
    $('s-dist').textContent = (r.meters / 1000).toFixed(2);
    $('s-time').textContent = fmtTime(r.seconds);
    $('s-xp').textContent = '+' + Math.round(r.xp);

    // banner
    const b = $('banner'), t = r.tev;
    let cls = '', msg = '';
    if (r.healthPause) { cls = 'amber'; msg = '♥ HEALTH WARNING<br>Heart rate too high — run paused. Slow down!'; }
    else if (r.flagged) { cls = 'red'; msg = '⚠ VEHICULAR DETECTED<br>XP & quest tracking suspended.'; }
    else if (t && t.blocked && r.status === 'running') { cls = 'red'; msg = '⚠ NOT RUNNING<br>' + t.sub; }
    else if (t && t.verdict === 'warn' && r.status === 'running') { cls = 'amber'; msg = '… CHECKING SPEED<br>Hold on, verifying your effort.'; }
    const sig = cls + msg;
    if (b.dataset.sig !== sig) {
      b.dataset.sig = sig;
      b.className = 'banner' + (cls ? ' on ' + cls : '');
      b.innerHTML = msg;
    }

    // map marker
    if (map && playerMarker) {
      playerMarker.setLatLng(r.pos);
      map.panTo(r.pos, { animate: true, duration: .25, easeLinearity: 1 });
      playerMarker.getElement().querySelector('.pp-player').classList.toggle('bob', r.status === 'running');
    }
  }

  function renderQuests() {
    const r = S.run;
    $('bounties').innerHTML = PP.BOUNTIES.map((b) => {
      const v = Math.min(PP.bountyValue(b, r), b.target), done = r.bountyDone[b.id];
      const label = b.unit === 'm' ? `${(v / 1000).toFixed(2)} / ${(b.target / 1000)} km` : b.unit === 's' ? `${fmtTime(v)} / ${fmtTime(b.target)}` : `${Math.round(v)} / ${b.target} XP`;
      return `<div class="quest ${done ? 'done' : ''}"><div class="t">${b.title}</div>
        <div class="bar thin"><i style="width:${100 * v / b.target}%"></i></div>
        <div class="meta"><span>${label}</span><span class="reward">+${b.reward.gold}<span class="coin-ico" style="display:inline-block;width:10px;height:10px;margin:0 4px"></span>${b.reward.item}</span></div></div>`;
    }).join('');

    $('locquests').innerHTML = PP.CHECKPOINTS.map((cp) => {
      const d = Math.round(PP.geo.haversine(r.pos, PP.ROUTE[cp.idx])), done = r.cleared[cp.id];
      return `<div class="quest ${done ? 'done' : ''}"><div class="t">${cp.icon} ${cp.name}</div>
        <div class="meta"><span>${cp.where}</span><span>${done ? 'CLEARED' : d + ' m away'}</span></div>
        <div class="meta"><span class="reward">+${cp.reward.gold} gold</span><span class="reward">+${cp.reward.xp} XP</span></div></div>`;
    }).join('');

    const km = Math.min(S.profile.totalKm, C.storyTargetKm);
    $('boss-hp').style.width = (100 * (1 - km / C.storyTargetKm)) + '%';
    $('boss-km').textContent = `${km.toFixed(2)} / ${C.storyTargetKm} km`;
    const reached = km / C.storyTargetKm * (PP.STORY.length - 1);
    $('chain').innerHTML = PP.STORY.map((n, i) => `<div class="node ${i <= reached && !n.boss ? 'done' : ''} ${n.boss ? 'boss-n' : ''}"><i></i>${n.w}<br>${n.label}</div>`).join('');
  }

  function renderTev() {
    const t = S.run.tev || PP.tev.evaluate(S.run);
    const v = $('verdict');
    if (S.run.status === 'idle' && !S.run.tev) { v.className = 'verdict idle'; }
    else {
      v.className = 'verdict ' + t.verdict;
      v.innerHTML = `${t.title}<small>${t.sub}</small>`;
    }
    $('tev-phase').textContent = 'PHASE ' + S.phase;
    $('layers').innerHTML = PP.TEV_LAYERS.map((l, i) => {
      const x = t.layers[i], st = x.st;
      const mark = st === 'ok' ? '✔' : st === 'fail' ? '✖' : st === 'warn' ? '!' : l.n;
      return `<div class="layer ${st}"><div class="n">${mark}</div>
        <div><div class="name">${l.name}</div><div class="read">${st === 'off' ? 'Needs wearables (Phase 2)' : x.read}</div><div class="why">${l.why}</div></div>
        <span class="tag ${l.phase === 1 ? 'lime' : 'cyan'}">P${l.phase}</span></div>`;
    }).join('');
  }

  function renderHero() {
    const p = S.profile, K = PP.COSMETICS;
    $('hero-sub').textContent = `LEVEL ${p.level} · ${Math.round(p.xp)} / ${PP.xpNeeded(p.level)} XP`;
    const sta = 40 + p.level * 6, spd = 30 + p.level * 5, luk = 20 + p.level * 4;
    [['sta', sta], ['spd', spd], ['luk', luk]].forEach(([k, v]) => { $('st-' + k).style.width = Math.min(100, v) + '%'; $('v-' + k).textContent = v; });
    const aura = gear().aura;
    $('aura').classList.toggle('on', !!aura);
    $('aura').style.background = aura ? `radial-gradient(${aura}aa 0 40%, transparent 70%)` : 'none';

    const slot = (kind, list, sw) => list.map((c) => {
      const locked = p.level < c.unlock, sel = p.gear[kind] === c.id;
      const sample = c.color ? `<div class="sw" style="background:${c.color}"></div>` : c.palette ? `<div class="sw" style="background:${c.palette.shirt}"></div>` : '<div class="sw" style="background:transparent;border-style:dashed"></div>';
      return `<button class="slot ${sel ? 'sel' : ''} ${locked ? 'locked' : ''}" data-kind="${kind}" data-id="${c.id}">${sample}${locked ? 'LV ' + c.unlock : c.name}</button>`;
    }).join('');
    $('slots-shoes').innerHTML = slot('shoes', K.shoes);
    $('slots-aura').innerHTML = slot('aura', K.aura);
    $('slots-sprite').innerHTML = slot('sprite', K.sprite);
    drawAvatars();
  }
  document.querySelector('#screen-hero').addEventListener('click', (e) => {
    const b = e.target.closest('.slot'); if (!b || b.classList.contains('locked')) return;
    S.profile.gear[b.dataset.kind] = b.dataset.id; renderHero();
  });

  function renderRoad() {
    const html = PP.ROADMAP.map((r) => `<li class="${r.state}"><i></i><b>${r.title}</b><small>${r.text}</small></li>`).join('');
    $('road-side').innerHTML = html; $('road-hero').innerHTML = html;
  }

  function resetFlags() {
    PP.CHECKPOINTS.forEach((cp) => { const el = document.getElementById('flag-' + cp.id); if (el) { el.classList.remove('cleared'); el.classList.add('pulse'); el.textContent = cp.icon; } });
  }

  function activeScreen() { return document.querySelector('.screen.active').id.replace('screen-', ''); }
  function render() {
    renderHud(); renderControls();
    const a = activeScreen();
    if (a === 'quests') renderQuests();
    if (a === 'tev') renderTev();
    if (a === 'hero') renderHero();
    // drawer selection state
    document.querySelectorAll('#mode-grid button').forEach((b) => b.classList.toggle('sel', b.dataset.mode === S.mode));
    document.querySelectorAll('#phase-seg button').forEach((b) => b.classList.toggle('on', +b.dataset.phase === S.phase));
  }

  /* ---------- bus subscriptions ---------- */
  let sinceTrail = 0;
  PP.bus.on('tick', (r) => {
    if (r.status === 'running' && map) { trailPts.push(r.pos.slice()); if (!r.tev.blocked) trail.setLatLngs(trailPts); }
    render();
  });
  PP.bus.on('status', () => { render(); if (S.run.status === 'finished') summary(); });
  PP.bus.on('mode', render);
  PP.bus.on('xp', (n) => {
    if (n < 1 || activeScreen() !== 'map') return;
    sinceTrail++; if (sinceTrail % 3) return;
    const f = document.createElement('div'); f.className = 'floatxp'; f.textContent = '+' + n + ' XP';
    f.style.left = '56%'; f.style.top = '48%';
    $('screen-map').appendChild(f); setTimeout(() => f.remove(), 1100);
  });
  PP.bus.on('levelup', (lv) => {
    PP.sim.pause();
    const g = gear(); const c = document.createElement('canvas');
    PP.sprite.drawHero(c, { frame: 0, palette: g.palette, shoe: g.shoe, aura: g.aura });
    const unlock = [].concat(PP.COSMETICS.shoes, PP.COSMETICS.aura, PP.COSMETICS.sprite).filter((x) => x.unlock === lv);
    modal(`<h2>LEVEL UP!<br>LV ${lv}</h2><div id="lu-sprite"></div><p>Stamina +6 · Speed +5${unlock.length ? '<br><span class="coin">NEW: ' + unlock.map((u) => u.name).join(', ') + '</span>' : ''}</p>`, () => { if (S.run.status === 'paused' && !S.run.healthPause) PP.sim.start(); });
    $('lu-sprite').appendChild(c);
  });
  PP.bus.on('quest', (q) => {
    toast(`★ ${q.title}<br>${q.reward}`);
    $('quest-dot').classList.add('on');
    const fl = document.getElementById('flag-' + q.id);
    if (fl) { fl.classList.add('cleared'); fl.classList.remove('pulse'); fl.textContent = '✔'; }
  });
  PP.bus.on('flag', () => { render(); });
  PP.bus.on('boss', () => {
    PP.sim.pause();
    modal('<h2>BOSS DEFEATED!</h2><p>The Benjakitti Wyrm falls.<br><span class="coin">+300 gold · Chapter 1 complete</span></p>', () => PP.sim.start());
  });

  function summary() {
    const r = S.run;
    modal(`<h2>RUN COMPLETE</h2><p>${(r.meters / 1000).toFixed(2)} km in ${fmtTime(r.seconds)}<br><span class="coin">+${Math.round(r.xp)} XP earned</span>${r.flagged ? '<br><span style="color:var(--red)">Vehicular flag: XP was suspended</span>' : ''}</p>`);
  }

  /* ---------- boot ---------- */
  PP.sprite.drawBoss($('boss'));
  renderRoad();
  initMap();
  PP.sim.setMode('run');
  render();
})();
