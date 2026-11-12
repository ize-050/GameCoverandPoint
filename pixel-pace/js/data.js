/* ==========================================================
   data.js — static configuration & content (no logic)
   Mirrors the proposal: XP/leveling, quests, TEV layers, roadmap.
   ========================================================== */
window.PP = window.PP || {};

PP.CONFIG = {
  center: [13.7313, 100.5414],     // Lumphini Park, Bangkok
  zoom: 17,
  simSecondsPerTick: 5,            // each 250 ms of real time = 5 s of "run time"
  tickMs: 250,
  xpPerMeter: 0.25,
  velocityCapKmh: 20,              // proposal §3 layer 1
  velocityCapSeconds: 30,
  hrDanger: 190,
  startProfile: { level: 4, xp: 120, gold: 240, totalKm: 2.1 },
  storyTargetKm: 5,
};

/** xp needed to clear a level */
PP.xpNeeded = (lv) => 100 + (lv - 1) * 60;

/* a loop around the Lumphini Park lake (lat, lng) */
PP.ROUTE = [
  [13.7283, 100.5398], [13.7283, 100.5412], [13.7284, 100.5427], [13.7287, 100.5440],
  [13.7295, 100.5448], [13.7306, 100.5452], [13.7318, 100.5453], [13.7330, 100.5451],
  [13.7339, 100.5445], [13.7344, 100.5435], [13.7345, 100.5423], [13.7344, 100.5411],
  [13.7340, 100.5400], [13.7332, 100.5392], [13.7321, 100.5389], [13.7310, 100.5388],
  [13.7299, 100.5389], [13.7290, 100.5392],
];

PP.CHECKPOINTS = [
  { id: 'cp1', icon: '☠', name: 'Monitor Lizard Cave', where: 'Lake south shore', idx: 3,  reward: { gold: 40, xp: 30 } },
  { id: 'cp2', icon: '♞', name: 'Rama VI Keep',        where: 'North-east gate',  idx: 8,  reward: { gold: 60, xp: 45 } },
  { id: 'cp3', icon: '♛', name: 'Pavilion Dungeon',    where: 'West lake pavilion', idx: 14, reward: { gold: 80, xp: 60 } },
];

PP.BOUNTIES = [
  { id: 'b1', title: 'Run 3 km before sunset',    kind: 'distance', target: 3000, unit: 'm',   reward: { gold: 50, item: 'Energy Gel' } },
  { id: 'b2', title: 'Hold 6:00/km for 10 min',   kind: 'pace',     target: 600,  unit: 's',   reward: { gold: 70, item: 'Speed Boots' } },
  { id: 'b3', title: 'Burn 150 XP in one run',    kind: 'xp',       target: 150,  unit: 'xp',  reward: { gold: 30, item: 'XP Potion' } },
];

/* Running modes available in the demo "cheat simulator" */
PP.MODES = {
  run:    { label: 'RUN 10 km/h',   kmh: 10, cadence: 164, hr: 148, ai: 'RUNNING',  aiConf: 97, terrain: 'PEDESTRIAN PATH', elev: true,  cls: '' },
  sprint: { label: 'SPRINT 18 km/h', kmh: 18, cadence: 188, hr: 176, ai: 'RUNNING',  aiConf: 95, terrain: 'PEDESTRIAN PATH', elev: true,  cls: 'amber' },
  ebike:  { label: 'E-BIKE 15 km/h', kmh: 15, cadence: 0,   hr: 76,  ai: 'CYCLING',  aiConf: 93, terrain: 'PEDESTRIAN PATH', elev: false, cls: 'pink' },
  scooter:{ label: 'SCOOTER 12 km/h',kmh: 12, cadence: 2,   hr: 78,  ai: 'VEHICLE',  aiConf: 90, terrain: 'PEDESTRIAN PATH', elev: false, cls: 'pink' },
  car:    { label: 'CAR 38 km/h',    kmh: 38, cadence: 0,   hr: 72,  ai: 'VEHICLE',  aiConf: 99, terrain: 'HIGHWAY',         elev: false, cls: 'pink' },
  danger: { label: 'OVEREXERT',      kmh: 13, cadence: 178, hr: 197, ai: 'RUNNING',  aiConf: 96, terrain: 'PEDESTRIAN PATH', elev: true,  cls: 'amber' },
};

/* True-Effort Verification layers (proposal §3) */
PP.TEV_LAYERS = [
  { n: 1, name: 'VELOCITY CAPPING',   phase: 1, why: '> 20 km/h for 30 s flags the run "Vehicular".' },
  { n: 2, name: 'CADENCE & STEPS',    phase: 2, why: 'GPS distance with zero step impacts is invalid.' },
  { n: 3, name: 'HEART-RATE TELEMETRY', phase: 2, why: 'Fast but resting HR → likely e-bike. Extreme HR → health pause.' },
  { n: 4, name: 'AI ACTIVITY CLASS',  phase: 2, why: 'On-device ML reads gyro + accelerometer signatures.' },
  { n: 5, name: 'SPATIAL ROUTE',      phase: 2, why: 'OSM terrain + elevation vs. impossibly steady highway speed.' },
];

/* Cosmetics unlocked by level (proposal §2.1) */
PP.COSMETICS = {
  shoes: [
    { id: 'white',  name: 'CLASSIC', color: '#f4f1ff', unlock: 1 },
    { id: 'lime',   name: 'NEON',    color: '#7cff4f', unlock: 3 },
    { id: 'pink',   name: 'TURBO',   color: '#ff4fa3', unlock: 6 },
  ],
  aura: [
    { id: 'none',   name: 'NONE',    color: null,      unlock: 1 },
    { id: 'cyan',   name: 'ICE',     color: '#4fe3ff', unlock: 5 },
    { id: 'amber',  name: 'GOLD',    color: '#ffd24f', unlock: 8 },
  ],
  sprite: [
    { id: 'kid',    name: 'RUNNER',  palette: { shirt: '#4fe3ff', pants: '#3b3770', hair: '#5a3a1a' }, unlock: 1 },
    { id: 'ninja',  name: 'NINJA',   palette: { shirt: '#2a2a3a', pants: '#14122b', hair: '#111111' }, unlock: 7 },
    { id: 'knight', name: 'KNIGHT',  palette: { shirt: '#c9c9d9', pants: '#6a6a85', hair: '#b8860b' }, unlock: 10 },
  ],
};

PP.STORY = [
  { w: 'W1', label: 'Warm-up' }, { w: 'W2', label: '1K' }, { w: 'W3', label: '2K' },
  { w: 'W4', label: '3.5K' },    { w: 'BOSS', label: '5K', boss: true },
];

PP.ROADMAP = [
  { state: 'done', title: 'PHASE 0 · CONCEPT DEMO',   text: 'This HTML prototype: UX, pixel UI, run loop, TEV simulator.' },
  { state: 'now',  title: 'PHASE 1 · MVP',            text: 'KMP app: GPS tracking, Leaflet map, leveling, Velocity Capping.' },
  { state: '',     title: 'PHASE 2 · WEARABLES',      text: 'HealthKit + Health Connect: heart rate and cadence → full TEV.' },
  { state: '',     title: 'PHASE 3 · BANGKOK BETA',   text: 'Closed beta at Lumphini & Benjakitti parks, location quests, server load tests.' },
];
