#!/usr/bin/env bash
# Walks a fake GPS route around Lumphini Park on the Android emulator.
# Usage: tools/simulate-run.sh [pace: walk|jog|sprint|car] [laps]
#   walk ≈ 5 km/h, jog ≈ 10 km/h, sprint ≈ 18 km/h, car ≈ 40 km/h
# Start the run in the app first (tap START RUN), then run this.
set -euo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
PACE="${1:-jog}"
LAPS="${2:-1}"

case "$PACE" in
  walk)   KMH=5 ;;
  jog)    KMH=10 ;;
  sprint) KMH=18 ;;
  car)    KMH=40 ;;
  *) echo "pace must be walk|jog|sprint|car"; exit 1 ;;
esac

# lat,lng corners of a loop around the lake (same as the HTML demo)
ROUTE="13.7283,100.5398 13.7283,100.5427 13.7295,100.5448 13.7318,100.5453 13.7339,100.5445 13.7345,100.5423 13.7340,100.5400 13.7321,100.5389 13.7299,100.5389 13.7283,100.5398"

python3 -I - "$KMH" "$LAPS" "$ROUTE" <<'PY' | while read -r lng lat delay; do
import math, sys
kmh, laps, route = float(sys.argv[1]), int(sys.argv[2]), sys.argv[3].split()
pts = [tuple(map(float, p.split(","))) for p in route]
step_s = 1.0                      # one fix per second of wall-clock
step_m = kmh / 3.6 * step_s       # metres covered per fix
def dist(a, b):
    r = math.pi / 180
    x = math.sin((b[0]-a[0])*r/2)**2 + math.cos(a[0]*r)*math.cos(b[0]*r)*math.sin((b[1]-a[1])*r/2)**2
    return 2 * 6371000 * math.asin(math.sqrt(x))
for _ in range(laps):
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(dist(a, b) / step_m))
        for i in range(n):
            t = i / n
            print(f"{a[1]+(b[1]-a[1])*t:.6f} {a[0]+(b[0]-a[0])*t:.6f} {step_s}")
PY
  "$ADB" emu geo fix "$lng" "$lat" >/dev/null
  sleep "$delay"
done
echo "route finished"
