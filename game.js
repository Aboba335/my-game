(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const needleEl = document.getElementById("needle");
  const kmhEl = document.getElementById("kmhValue");
  const turboBadgeEl = document.getElementById("turboBadge");
  const locationNameEl = document.getElementById("locationName");
  const locationRowEl = locationNameEl.closest(".hud-location");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMsg = document.getElementById("overlayMsg");
  const startBtn = document.getElementById("startBtn");

  /** Локация меняется каждые STEP очков (цикл по списку). */
  const LOCATION_STEP = 1000;

  const LOCATIONS = [
    {
      label: "Пригород",
      skyTop: "#456488",
      skyBot: "#0d1218",
      shoulder: "#151d28",
      road: "#1e2d40",
      leftTint: "rgba(14,22,34,0.62)",
      rightTint: "rgba(26,36,50,0.48)",
      edge: "#2a3848",
      lane: "#4d6280",
      dividerA: "#e8b820",
      dividerB: "#f5ead0",
      rushRgb: "61,255,156",
      vignetteRgb: "6,10,18",
      decor: "none",
    },
    {
      label: "Тоннель",
      skyTop: "#121822",
      skyBot: "#060810",
      shoulder: "#181f28",
      road: "#2c3540",
      leftTint: "rgba(8,12,18,0.78)",
      rightTint: "rgba(14,18,26,0.72)",
      edge: "#455568",
      lane: "#5c6e82",
      dividerA: "#d4d632",
      dividerB: "#f8f8d8",
      rushRgb: "180,230,255",
      vignetteRgb: "2,4,8",
      decor: "tunnel",
    },
    {
      label: "Нью-Йорк",
      skyTop: "#352868",
      skyBot: "#080818",
      shoulder: "#201828",
      road: "#2a2838",
      leftTint: "rgba(34,26,52,0.55)",
      rightTint: "rgba(40,32,58,0.48)",
      edge: "#504870",
      lane: "#686888",
      dividerA: "#ffcc33",
      dividerB: "#fff0b0",
      rushRgb: "255,190,90",
      vignetteRgb: "12,8,24",
      decor: "city",
      windowColor: "#ffe4a8",
    },
    {
      label: "Пустыня",
      skyTop: "#e8a060",
      skyBot: "#5a2810",
      shoulder: "#c9a060",
      road: "#504840",
      leftTint: "rgba(160,120,70,0.42)",
      rightTint: "rgba(180,130,75,0.38)",
      edge: "#786040",
      lane: "#948060",
      dividerA: "#f0e8b8",
      dividerB: "#fffef0",
      rushRgb: "255,210,140",
      vignetteRgb: "40,22,12",
      decor: "none",
    },
    {
      label: "Ночной мост",
      skyTop: "#102840",
      skyBot: "#061220",
      shoulder: "#183040",
      road: "#344a5c",
      leftTint: "rgba(14,48,68,0.58)",
      rightTint: "rgba(22,62,82,0.5)",
      edge: "#5080a0",
      lane: "#7098b8",
      dividerA: "#f0e030",
      dividerB: "#fff8c8",
      rushRgb: "100,210,255",
      vignetteRgb: "4,16,26",
      decor: "bridge",
    },
  ];

  /** Четыре полосы: 0–1 встречные, 2–3 попутные. */
  const LANES = 4;
  const DIVIDER_AFTER_LANE = 2;
  const ROAD_MARGIN = 54;
  let ROAD_W = 800 - ROAD_MARGIN * 2;
  let LANE_W = ROAD_W / LANES;
  let W = 800;
  let H = 600;

  const SAME_DIR_SCROLL_MIX = 0.48;

  const PLAYER_W = 38;
  const PLAYER_H = 64;
  const PLAYER_MOVE = 480;

  let PLAYER_Y_MIN = H * 0.28;
  let PLAYER_Y_MAX = H - 48;

  const halfPw = PLAYER_W / 2;
  let PLAYER_X_MIN = ROAD_MARGIN + halfPw + 4;
  let PLAYER_X_MAX = ROAD_MARGIN + ROAD_W - halfPw - 4;

  const STRIPE_LEN = 44;
  const STRIPE_GAP = 36;

  const THROTTLE_MULT = 1.48;
  const BRAKE_MULT = 0.52;
  const MIN_PEDAL_MULT = 0.38;

  const TURBO_MULT = 1.38;

  const SPEED_LIMIT_KMH = 300;
  const KMH_SCALE_PAD = 56;
  const SCROLL_VEL_CAP_PX = 2680;

  const TRAFFIC_SPEED_PULL = 1.22;

  /** Каждые полные 50 км/ч на спидометре — поток «чужих» машин быстрее (для обгонов). */
  const KMH_TRAFFIC_STEP = 50;
  const KMH_TRAFFIC_PER_TIER = 0.055;
  /** Шанс за один тик заспавнить вторую машину (плотнее трафик). */
  const SPAWN_EXTRA_CAR_CHANCE = 0.44;

  function trafficBoostFromKmh(kmhSmoothed) {
    const tiers = Math.max(0, Math.floor(kmhSmoothed / KMH_TRAFFIC_STEP));
    return 1 + tiers * KMH_TRAFFIC_PER_TIER;
  }

  let playing = false;
  let traffic = [];
  let stripeOffset = 0;
  let spawnTimer = 0;
  let spawnEvery = 1.15;
  let baseSpeed = 220;
  let speedMul = 1;
  let score = 0;
  let needleKmhSmooth = 0;
  let prevLocationIdx = -1;

  /** @type {Set<string>} */
  const keys = new Set();

  const player = {
    x: ROAD_MARGIN + LANE_W * 3,
    y: H - 100,
  };

  function refreshLayout() {
    ROAD_W = W - ROAD_MARGIN * 2;
    LANE_W = ROAD_W / LANES;
    PLAYER_Y_MIN = H * 0.28;
    PLAYER_Y_MAX = H - 48;
    PLAYER_X_MIN = ROAD_MARGIN + halfPw + 4;
    PLAYER_X_MAX = ROAD_MARGIN + ROAD_W - halfPw - 4;
    player.x = Math.min(PLAYER_X_MAX, Math.max(PLAYER_X_MIN, player.x));
    player.y = Math.min(PLAYER_Y_MAX, Math.max(PLAYER_Y_MIN, player.y));
    for (const c of traffic) {
      c.x = Math.min(
        ROAD_MARGIN + ROAD_W - c.w / 2 - 4,
        Math.max(ROAD_MARGIN + c.w / 2 + 4, c.x)
      );
    }
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);
    if (W < 2 || H < 2) return;

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    refreshLayout();
  }

  function rectsOverlap(a, b) {
    return (
      Math.abs(a.x - b.x) * 2 < a.w + b.w &&
      Math.abs(a.y - b.y) * 2 < a.h + b.h
    );
  }

  function getLocationIndexForScore(s) {
    return Math.floor(Math.max(0, s) / LOCATION_STEP) % LOCATIONS.length;
  }

  function getThemeAtScore(s) {
    return LOCATIONS[getLocationIndexForScore(s)];
  }

  function syncLocationHud(forcedIndex) {
    const idx =
      forcedIndex !== undefined
        ? forcedIndex
        : getLocationIndexForScore(Math.floor(score));
    const theme = LOCATIONS[idx];
    locationNameEl.textContent = theme.label;
    if (playing && idx !== prevLocationIdx && prevLocationIdx >= 0) {
      locationRowEl.classList.remove("loc-pop");
      void locationRowEl.offsetWidth;
      locationRowEl.classList.add("loc-pop");
    }
    prevLocationIdx = idx;
  }

  function resetGame() {
    traffic = [];
    stripeOffset = 0;
    spawnTimer = 0;
    spawnEvery = 0.84;
    baseSpeed = 220;
    speedMul = 1;
    score = 0;
    keys.clear();
    prevLocationIdx = -1;
    player.x = (laneCenterX(2) + laneCenterX(3)) / 2;
    player.y = PLAYER_Y_MAX - 52;
    scoreEl.textContent = "0";
    needleKmhSmooth = 0;
    kmhEl.textContent = "0";
    needleEl.style.transform = "rotate(-118deg)";
    turboBadgeEl.classList.remove("turbo-badge--on", "turbo-badge--limit");
    syncLocationHud(0);
  }

  function maxScrollVelocityPx() {
    return SCROLL_VEL_CAP_PX;
  }

  function scrollVelocityToKmh(scrollVelPx) {
    if (scrollVelPx <= 0.5) return 0;
    const span = SPEED_LIMIT_KMH - KMH_SCALE_PAD;
    return Math.min(
      SPEED_LIMIT_KMH,
      KMH_SCALE_PAD + (scrollVelPx / SCROLL_VEL_CAP_PX) * span
    );
  }

  function getPedalMultiplier() {
    const gas = keys.has("up");
    const brake = keys.has("down");
    if (gas && brake) return 1;
    if (gas) return THROTTLE_MULT;
    if (brake) return Math.max(MIN_PEDAL_MULT, BRAKE_MULT);
    return 1;
  }

  function getTurboMultiplier() {
    return keys.has("turbo") ? TURBO_MULT : 1;
  }

  function showOverlay(title, msg, btnText) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    startBtn.textContent = btnText;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function laneCenterX(laneIdx) {
    return ROAD_MARGIN + LANE_W * (laneIdx + 0.5);
  }

  function spawnTrafficCar() {
    const colorsOn = ["#ff4466", "#ff8844", "#ee5577", "#ff9933"];
    const colorsWith = ["#66aaff", "#5599ee", "#77ccb8", "#8ab8ff"];
    const sameDir = Math.random() < 0.46;
    const lane = sameDir
      ? 2 + Math.floor(Math.random() * 2)
      : Math.floor(Math.random() * 2);
    const w = 34 + Math.random() * 10;
    const h = 52 + Math.random() * 14;
    const x = laneCenterX(lane);

    if (!sameDir) {
      traffic.push({
        x,
        y: -h - 10,
        w,
        h,
        sameDir: false,
        vyRel: baseSpeed * (0.78 + Math.random() * 0.42),
        indivMul: 0.56 + Math.random() * 0.78,
        color: colorsOn[Math.floor(Math.random() * colorsOn.length)],
      });
    } else {
      traffic.push({
        x,
        y: H + h + 24 + Math.random() * 140,
        w,
        h,
        sameDir: true,
        vyRel: -baseSpeed * (0.32 + Math.random() * 0.3),
        indivMul: 0.5 + Math.random() * 0.85,
        color: colorsWith[Math.floor(Math.random() * colorsWith.length)],
      });
    }
  }

  function drawSky(theme) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, theme.skyTop);
    g.addColorStop(1, theme.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawCityDecor(theme) {
    const win = theme.windowColor || "#ffd86a";
    const scroll = stripeOffset * 0.62;
    const topH = H * 0.36;

    function strip(leftSide) {
      let x = leftSide ? ROAD_MARGIN - 12 : ROAD_MARGIN + ROAD_W + 12;
      let n = 0;
      while (leftSide ? x > -140 : x < W + 140) {
        const bw = 18 + (((n << 3) + scroll * 1.6) % 26);
        const bh =
          topH * (0.34 + (((n * 11 + scroll) % 58) / 100));
        const bx = leftSide ? x - bw : x;
        ctx.fillStyle = "#161022";
        ctx.fillRect(bx, topH - bh, bw, bh);
        ctx.fillStyle = win;
        const rows = Math.max(2, Math.floor(bh / 17));
        for (let r = 0; r < rows; r++) {
          if (((n + r + scroll) | 0) % 6 > 2) {
            ctx.fillRect(bx + 3, topH - bh + 9 + r * 16, bw - 6, 9);
          }
        }
        x += leftSide ? -(bw + 7) : bw + 7;
        n++;
      }
    }

    strip(true);
    strip(false);
  }

  function drawTunnelDecor(theme) {
    const dark = "rgba(4,6,12,0.92)";
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, ROAD_MARGIN - 14, H);
    ctx.fillRect(ROAD_MARGIN + ROAD_W + 14, 0, W - ROAD_MARGIN - ROAD_W - 14, H);

    const gy = (stripeOffset * 1.4) % 70;
    ctx.strokeStyle = "rgba(90,110,140,0.35)";
    ctx.lineWidth = 3;
    for (let y = -gy; y < H + 90; y += 68) {
      ctx.beginPath();
      ctx.arc(W / 2, y, W * 0.72, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255,248,200,0.28)";
    for (let y = -gy; y < H + 40; y += 52) {
      const lx = ROAD_MARGIN + 6;
      const rx = ROAD_MARGIN + ROAD_W - 6;
      ctx.beginPath();
      ctx.arc(lx, y, 3, 0, Math.PI * 2);
      ctx.arc(rx, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBridgeDecor(theme) {
    const waterTop = H * 0.18;
    const wob = stripeOffset * 0.35;
    ctx.fillStyle = "rgba(8,35,58,0.55)";
    ctx.fillRect(0, waterTop, ROAD_MARGIN - 6, H - waterTop);
    ctx.fillRect(ROAD_MARGIN + ROAD_W + 6, waterTop, W - ROAD_MARGIN - ROAD_W - 6, H - waterTop);

    ctx.strokeStyle = "rgba(80,160,220,0.22)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const yy = waterTop + ((i * 37 + wob) % 80) + 20;
      ctx.beginPath();
      ctx.moveTo(4, yy);
      ctx.lineTo(ROAD_MARGIN - 12, yy + 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ROAD_MARGIN + ROAD_W + 12, yy + 8);
      ctx.lineTo(W - 4, yy);
      ctx.stroke();
    }
  }

  function drawRoad(dt, scrollVel, kmhForFx, theme) {
    stripeOffset =
      (stripeOffset + scrollVel * dt) % (STRIPE_LEN + STRIPE_GAP);

    drawSky(theme);

    if (theme.decor === "city") drawCityDecor(theme);

    ctx.fillStyle = theme.shoulder;
    ctx.fillRect(ROAD_MARGIN - 8, 0, ROAD_W + 16, H);

    ctx.fillStyle = theme.road;
    ctx.fillRect(ROAD_MARGIN, 0, ROAD_W, H);

    ctx.fillStyle = theme.leftTint;
    ctx.fillRect(ROAD_MARGIN, 0, LANE_W * DIVIDER_AFTER_LANE, H);
    ctx.fillStyle = theme.rightTint;
    ctx.fillRect(
      ROAD_MARGIN + LANE_W * DIVIDER_AFTER_LANE,
      0,
      LANE_W * (LANES - DIVIDER_AFTER_LANE),
      H
    );

    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ROAD_MARGIN, 0);
    ctx.lineTo(ROAD_MARGIN, H);
    ctx.moveTo(ROAD_MARGIN + ROAD_W, 0);
    ctx.lineTo(ROAD_MARGIN + ROAD_W, H);
    ctx.stroke();

    const stripeDash = [STRIPE_LEN, STRIPE_GAP];

    for (let i = 1; i < LANES; i++) {
      const x = ROAD_MARGIN + i * LANE_W;

      if (i === DIVIDER_AFTER_LANE) {
        ctx.setLineDash([]);
        ctx.strokeStyle = theme.dividerA;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 3, -40);
        ctx.lineTo(x - 3, H + 40);
        ctx.stroke();
        ctx.strokeStyle = theme.dividerB;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 3, -40);
        ctx.lineTo(x + 3, H + 40);
        ctx.stroke();
      } else {
        ctx.strokeStyle = theme.lane;
        ctx.lineWidth = 4;
        ctx.setLineDash(stripeDash);
        ctx.lineDashOffset =
          i < DIVIDER_AFTER_LANE ? -stripeOffset : stripeOffset * 0.92;
        ctx.beginPath();
        ctx.moveTo(x, -40);
        ctx.lineTo(x, H + 40);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);

    if (theme.decor === "tunnel") drawTunnelDecor(theme);
    if (theme.decor === "bridge") drawBridgeDecor(theme);

    const vr = theme.vignetteRgb || "6,10,18";

    if (kmhForFx >= 165) {
      const cx = W / 2;
      const cy = H / 2;
      const r = Math.max(W, H) * 0.92;
      const t = Math.min(1, (kmhForFx - 165) / (SPEED_LIMIT_KMH - 165));
      const g = ctx.createRadialGradient(cx, cy, r * 0.18, cx, cy, r);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(${vr},${0.14 + t * 0.42})`);
      ctx.fillStyle = g;
      ctx.fillRect(-80, -80, W + 160, H + 160);
    }

    if (kmhForFx >= 210) {
      const rush = Math.min(1, (kmhForFx - 210) / 90);
      const rgb = theme.rushRgb || "61,255,156";
      ctx.strokeStyle = `rgba(${rgb},${0.03 + rush * 0.09})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const yy = ((stripeOffset * 2 + i * 95) % (H + 120)) - 40;
        ctx.beginPath();
        ctx.moveTo(ROAD_MARGIN + 8, yy);
        ctx.lineTo(ROAD_MARGIN + ROAD_W - 8, yy + rush * 22);
        ctx.stroke();
      }
    }
  }

  function drawCar(cx, cy, w, h, fill, glow) {
    ctx.save();
    ctx.translate(cx, cy);
    const r = 6;
    ctx.fillStyle = fill;
    if (glow) {
      ctx.shadowColor = fill;
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-w / 2 + 5, -h / 2 + 10, w - 10, h * 0.28);

    ctx.fillStyle = "#ffd866";
    ctx.fillRect(-w / 2 + 4, h / 2 - 8, w / 3 - 4, 5);
    ctx.fillRect(w / 6, h / 2 - 8, w / 3 - 4, 5);

    ctx.restore();
  }

  function drawPlayer() {
    drawCar(player.x, player.y, PLAYER_W, PLAYER_H, "#3dff9c", true);
  }

  function updatePlayer(dt) {
    let mx = 0;
    let my = 0;
    if (keys.has("left")) mx -= 1;
    if (keys.has("right")) mx += 1;
    if (keys.has("up")) my -= 1;
    if (keys.has("down")) my += 1;

    if (mx !== 0 && my !== 0) {
      const inv = 1 / Math.SQRT2;
      mx *= inv;
      my *= inv;
    }

    let nx = player.x + mx * PLAYER_MOVE * dt;
    let ny = player.y + my * PLAYER_MOVE * dt;
    nx = Math.min(PLAYER_X_MAX, Math.max(PLAYER_X_MIN, nx));
    ny = Math.min(PLAYER_Y_MAX, Math.max(PLAYER_Y_MIN, ny));
    player.x = nx;
    player.y = ny;
  }

  function updateTraffic(dt, scrollVel, pedalMul, turboMul, kmhNow, kmhTierMul) {
    const flowMul = pedalMul * turboMul;
    const trafficVelMul =
      flowMul * TRAFFIC_SPEED_PULL * kmhTierMul;
    const roadLean =
      0.38 + Math.min(0.26, (kmhNow / SPEED_LIMIT_KMH) * 0.26);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTrafficCar();
      if (Math.random() < SPAWN_EXTRA_CAR_CHANCE) {
        spawnTrafficCar();
      }
      spawnTimer = spawnEvery * (0.48 + Math.random() * 0.62);
    }

    const roadBoostOn = scrollVel * roadLean;
    const roadBoostSd = scrollVel * roadLean * SAME_DIR_SCROLL_MIX;

    for (let i = traffic.length - 1; i >= 0; i--) {
      const c = traffic[i];
      const rb = c.sameDir ? roadBoostSd : roadBoostOn;
      const own = c.indivMul != null ? c.indivMul : 1;
      c.y += (c.vyRel * own * trafficVelMul + rb) * dt;

      const px = player.x;
      const py = player.y;
      const pw = PLAYER_W - 8;
      const ph = PLAYER_H - 12;

      if (
        rectsOverlap(
          { x: px, y: py, w: pw, h: ph },
          { x: c.x, y: c.y, w: c.w - 6, h: c.h - 8 }
        )
      ) {
        playing = false;
        showOverlay(
          "Вылет!",
          `Счёт: ${Math.floor(score)}. Ещё раз?`,
          "Заново"
        );
        return;
      }

      const passedBottom = !c.sameDir && c.y > H + c.h;
      const passedTop = c.sameDir && c.y < -c.h - 24;
      if (passedBottom || passedTop) {
        traffic.splice(i, 1);
        score += 12 * speedMul * flowMul;
      }
    }

    score += 28 * dt * speedMul * flowMul;
    scoreEl.textContent = Math.floor(score).toString();

    syncLocationHud();

    speedMul = 1 + Math.min(2.5, score / 3500);
    baseSpeed = 220 + Math.min(260, score / 25);
    spawnEvery = Math.max(0.22, 0.84 - score / 6200);
  }

  function tickNeedleSmooth(dt, scrollVelPx) {
    const kmhTarget = scrollVelocityToKmh(scrollVelPx);
    needleKmhSmooth +=
      (kmhTarget - needleKmhSmooth) * Math.min(1, dt * (playing ? 11 : 18));
  }

  function paintSpeedometerHud() {
    kmhEl.textContent = Math.round(needleKmhSmooth).toString();
    const ang = -118 + (needleKmhSmooth / SPEED_LIMIT_KMH) * 180;
    needleEl.style.transform = `rotate(${ang}deg)`;

    const turboOn = keys.has("turbo");
    turboBadgeEl.classList.toggle("turbo-badge--on", playing && turboOn);
    turboBadgeEl.classList.toggle(
      "turbo-badge--limit",
      playing && needleKmhSmooth >= SPEED_LIMIT_KMH - 4
    );
  }

  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const theme = playing
      ? getThemeAtScore(score)
      : LOCATIONS[0];

    const pedalMul = playing ? getPedalMultiplier() : 1;
    const turboMul = playing ? getTurboMultiplier() : 1;
    const rawScrollVel =
      playing ? baseSpeed * speedMul * pedalMul * turboMul : 0;
    const scrollVel = playing
      ? Math.min(rawScrollVel, maxScrollVelocityPx())
      : 0;

    tickNeedleSmooth(dt, scrollVel);
    const kmhNow = playing ? scrollVelocityToKmh(scrollVel) : 0;
    const kmhTierMul = playing
      ? trafficBoostFromKmh(needleKmhSmooth)
      : 1;

    ctx.save();
    if (playing && kmhNow > 135) {
      const amp =
        Math.min(2.9, ((kmhNow - 135) / (SPEED_LIMIT_KMH - 135)) * 2.9) *
        (0.35 + turboMul * 0.15);
      ctx.translate(
        Math.sin(now * 0.024) * amp * 0.42,
        Math.cos(now * 0.027) * amp * 0.38
      );
    }

    drawRoad(dt, scrollVel, kmhNow, theme);

    if (playing) {
      updatePlayer(dt);
      updateTraffic(
        dt,
        scrollVel,
        pedalMul,
        turboMul,
        kmhNow,
        kmhTierMul
      );
    }

    for (const c of traffic) {
      drawCar(c.x, c.y, c.w, c.h, c.color, false);
    }

    drawPlayer();

    ctx.restore();

    paintSpeedometerHud();

    requestAnimationFrame(frame);
  }

  function applyDirectionKey(e, down) {
    const k = e.key.toLowerCase();
    let dir = null;
    if (k === "arrowleft" || k === "a") dir = "left";
    else if (k === "arrowright" || k === "d") dir = "right";
    else if (k === "arrowup" || k === "w") dir = "up";
    else if (k === "arrowdown" || k === "s") dir = "down";

    if (!dir) return;

    if (down) keys.add(dir);
    else keys.delete(dir);

    if (playing) e.preventDefault();
  }

  function onKeyDown(e) {
    if (e.code === "Space") {
      keys.add("turbo");
      if (playing) e.preventDefault();
      return;
    }
    applyDirectionKey(e, true);
  }

  function onKeyUp(e) {
    if (e.code === "Space") {
      keys.delete("turbo");
      if (playing) e.preventDefault();
      return;
    }
    applyDirectionKey(e, false);
  }

  window.addEventListener("blur", () => keys.clear());

  let resizeScheduled = false;
  window.addEventListener("resize", () => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(() => {
      resizeScheduled = false;
      resizeCanvas();
    });
  });

  startBtn.addEventListener("click", () => {
    resizeCanvas();
    resetGame();
    playing = true;
    hideOverlay();
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  resizeCanvas();
  syncLocationHud(0);

  showOverlay(
    "Neon Sprint",
    "Полный экран подстраивается под окно. Каждые 1000 очков — новая локация (тоннель, Нью-Йорк и др.). Четыре полосы: слева встречка, справа попутный ход.",
    "Старт"
  );

  requestAnimationFrame(frame);
})();
