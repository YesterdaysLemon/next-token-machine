(function () {
  const F = window.PixelFont;
  const M = window.Model;

  // ---- geometry (logical pixels; the canvas is drawn at 3x) ---------------
  const W = 448, H = 256, SCALE = 3;
  const C = {
    bg: '#1a1c2c', deep: '#0f101c', panel: '#212438', line: '#333c57', slate: '#566c86',
    mist: '#94b0c2', ink: '#f4f4f4', orange: '#ef7d57', yellow: '#ffcd75', lime: '#a7f070',
    green: '#38b764', teal: '#257179', cyan: '#73eff7', sky: '#41a6f6', blue: '#3b5dc9',
    navy: '#29366f', red: '#b13e53', plum: '#5d275d', lilac: '#b58fd6',
  };
  const RAMP = [C.blue, C.sky, C.cyan, C.yellow, C.orange, C.red];
  const MAXTOK = 12, COL0 = 48, PITCH = 22, CHIP_W = 21, CHIP_H = 11;
  const FRAME_X = 45, FRAME_W = 270;
  const CHIP_Y = 178, TEXT_Y = 207, TX = 436, TRACK_Y = 199;
  const BANDS = [
    { key: 'embed', y: 158, h: 14, label: 'EMBED' },
    { key: 'attn', y: 126, h: 28, label: 'ATTN', layer: 'L1' },
    { key: 'mlp', y: 102, h: 20, label: 'MLP', layer: 'L1' },
    { key: 'attn', y: 58, h: 28, label: 'ATTN', layer: 'L32' },
    { key: 'mlp', y: 34, h: 20, label: 'MLP', layer: 'L32' },
  ];
  const OUT = { y: 8, h: 20 };
  const OUT_ROW = OUT.y + OUT.h - 6;
  const PANEL = { x: 323, y: 8, w: 122, h: 88 };
  const PICK = { x: 352, y: 102, w: 52, h: 22 };
  const BAR_X = PANEL.x + 32, BAR_MAX = 58;
  const colX = p => COL0 + p * PITCH;
  const rowY = b => (b < 0 ? CHIP_Y : BANDS[b].y + BANDS[b].h - 6);

  // ---- stages shown in the guide -------------------------------------------
  const STAGES = [
    { name: 'TOKENIZE', c: C.orange, title: 'Chop text into tokens',
      body: 'The text is cut into tokens: whole words, pieces of words, or punctuation. Each token is really just an ID number from a fixed vocabulary. Watch \u201cPIXELS\u201d become two tokens in the third prompt.' },
    { name: 'EMBED', c: C.sky, title: 'Look up a vector for each token',
      body: 'Each token ID looks up its own list of numbers, called a vector. Here it has 6 numbers; in a big model it has thousands. The token\u2019s position gets mixed in too, so the model knows word order.' },
    { name: 'ATTENTION', c: C.yellow, title: 'Tokens look back at each other',
      body: 'Each token checks the tokens before it (never after it), decides which ones matter, and pulls in a weighted blend of their information. Brighter, thicker arcs mean more attention. Real models run dozens of these \u201cheads\u201d side by side.' },
    { name: 'MLP', c: C.lime, title: 'Each token thinks on its own',
      body: 'Every token\u2019s vector goes through the same small neural network: spread out into a wider layer of neurons, switch some on and some off, squeeze back down. Much of what the model has memorised lives here. Attention + MLP is one layer; big models stack dozens.' },
    { name: 'SCORE + SOFTMAX', c: C.cyan, title: 'Turn the last vector into odds',
      body: 'Only the last token\u2019s final vector is used to predict what comes next. It gets a score (a \u201clogit\u201d) against every token in the vocabulary, and softmax turns those scores into probabilities that add up to 100%.' },
    { name: 'SAMPLE', c: '#e46f84', title: 'Roll the dice',
      body: 'One token is picked at random, weighted by its probability. Temperature reshapes the odds first: low values make the top guess almost certain, high values flatten the odds so surprises win more often.' },
    { name: 'FEED IT BACK', c: C.lilac, title: 'Append it and go again',
      body: 'The picked token is added to the end of the input and the whole machine runs again, one token at a time. That loop is what \u201cautoregressive\u201d means. Earlier tokens don\u2019t need recomputing: their attention data is cached, so only the new token climbs the layers.' },
  ];
  const DONE_TEXT = {
    eos: { title: 'Stop: end-of-text', body: 'The model picked a special end-of-text token, so generation stops. Models learn to emit it when a reply is finished.' },
    full: { title: 'Stop: context window full', body: 'Every slot in the context window is used, so this machine can\u2019t read any more. This one holds 12 tokens; large models hold hundreds of thousands.' },
  };

  // ---- canvas + drawing primitives -----------------------------------------
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const R = Math.round;
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(R(x), R(y), R(w), R(h)); }
  function text(s, x, y, c) { F.draw(ctx, s, x, y, c); }
  function textC(s, cx, y, c) { F.draw(ctx, s, R(cx - F.width(String(s)) / 2), y, c); }
  function frame(x, y, w, h, c) {
    rect(x + 1, y, w - 2, 1, c); rect(x + 1, y + h - 1, w - 2, 1, c);
    rect(x, y + 1, 1, h - 2, c); rect(x + w - 1, y + 1, 1, h - 2, c);
  }
  function box(x, y, w, h, fill, edge) { rect(x + 1, y + 1, w - 2, h - 2, fill); frame(x, y, w, h, edge); }
  const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const cellColor = v => RAMP[v < -0.5 ? 0 : v < -0.15 ? 1 : v < 0 ? 2 : v < 0.15 ? 3 : v < 0.5 ? 4 : 5];

  function chip(x, y, tok) {
    const eos = tok.w === M.EOS;
    const fill = eos ? C.red : tok.gen ? C.cyan : C.orange;
    rect(x + 1, y, CHIP_W - 2, CHIP_H, fill);
    rect(x, y + 1, CHIP_W, CHIP_H - 2, fill);
    rect(x + 1, y + CHIP_H - 2, CHIP_W - 2, 1, 'rgba(15,16,28,.28)');
    rect(x + 1, y + 1, CHIP_W - 2, 1, 'rgba(255,255,255,.28)');
    textC(tok.w, x + CHIP_W / 2, y + 3, eos ? C.ink : C.deep);
  }

  function packet(x, y, vec, opts) {
    rect(x, y, 20, 5, C.deep);
    for (let i = 0; i < 6; i++) {
      const c = vec ? cellColor(vec[i]) : (opts && opts.raw ? RAMP[opts.raw[i]] : C.mist);
      rect(x + 1 + i * 3, y + 1, 3, 3, c);
    }
    if (opts && opts.dim) rect(x, y, 20, 5, 'rgba(26,28,44,.62)');
  }

  // Parabolic pixel arc from the key column (x2) to the query column (x1).
  function arc(x1, x2, yb, hgt, color, thick, frac) {
    const n = Math.abs(x1 - x2);
    const dir = x1 > x2 ? 1 : -1;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      if (s > frac) break;
      const x = x2 + dir * i;
      const y = yb - R(hgt * 4 * s * (1 - s));
      if (prev !== null && Math.abs(y - prev) > 1) rect(x, Math.min(y, prev), 1, Math.abs(y - prev), color);
      rect(x, y, 1, thick, color);
      prev = y;
    }
  }
  function arcPoint(x1, x2, yb, hgt, s) {
    return { x: lerp(x2, x1, s), y: yb - hgt * 4 * s * (1 - s) };
  }

  // ---- state ---------------------------------------------------------------
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = {
    prompt: 0, tokens: [], cache: [], filled: [], shown: 0, active: [], step: 0,
    queue: [], phase: 'tokenize', t: 0, dur: 1, playing: !reduceMotion, stopAfter: false,
    speed: 1, temp: 0.8, cands: null, picked: -1, hops: 10, reason: '', clock: 0,
  };
  const probs = () => (st.cands ? M.softmax(st.cands, st.temp) : null);
  const lastIdx = () => st.tokens.length - 1;

  // ---- static scene --------------------------------------------------------
  function drawStatic(activeBand, bandColor) {
    rect(0, 0, W, H, C.bg);

    // bands
    BANDS.forEach((b, i) => {
      const on = i === activeBand;
      box(FRAME_X, b.y, FRAME_W, b.h, C.panel, on ? bandColor : C.line);
      const ly = b.y + (b.h >> 1) - (b.layer ? 5 : 2);
      text(b.label, 4, ly, on ? bandColor : C.mist);
      if (b.layer) text(b.layer, 4, ly + 7, C.slate);
    });
    const outOn = st.phase === 'unembed' || st.phase === 'sample' || st.phase === 'loop';
    box(FRAME_X, OUT.y, FRAME_W, OUT.h, C.panel, outOn ? C.cyan : C.line);
    text('OUT', 4, OUT.y + 7, outOn ? C.cyan : C.mist);

    // the "more layers" gap between the two drawn layers
    const gapOn = st.phase === 'attn2' && st.t / st.dur < 0.4;
    const gc = gapOn ? C.yellow : C.slate;
    const gx = FRAME_X + FRAME_W / 2;
    textC('30 MORE LAYERS', gx, 92, gc);
    for (let x = FRAME_X + 4; x < gx - 34; x += 3) rect(x, 94, 1, 1, C.line);
    for (let x = gx + 34; x < FRAME_X + FRAME_W - 4; x += 3) rect(x, 94, 1, 1, C.line);

    // token row
    text('TOKENS', 4, CHIP_Y + 3, st.phase === 'tokenize' ? C.orange : C.mist);
    for (let p = st.shown; p < MAXTOK; p++) {
      const x = colX(p);
      for (let i = 1; i < CHIP_W - 1; i += 2) { rect(x + i, CHIP_Y, 1, 1, C.line); rect(x + i, CHIP_Y + CHIP_H - 1, 1, 1, C.line); }
      for (let j = 1; j < CHIP_H - 1; j += 2) { rect(x, CHIP_Y + j, 1, 1, C.line); rect(x + CHIP_W - 1, CHIP_Y + j, 1, 1, C.line); }
    }

    // residual-stream pipes and settled packets
    for (let p = 0; p < st.shown; p++) {
      const top = st.filled[p] > 0 ? rowY(st.filled[p] - 1) + 5 : CHIP_Y;
      for (let y = top + 1; y < CHIP_Y; y += 2) rect(colX(p) + 10, y, 1, 1, C.line);
      for (let b = 0; b < st.filled[p]; b++) packet(colX(p), rowY(b), st.cache[p].st[b]);
      chip(colX(p), CHIP_Y, st.tokens[p]);
    }

    // text / id box
    box(FRAME_X, TEXT_Y, FRAME_W, 15, C.deep, C.line);
    text(st.phase === 'tokenize' ? 'TEXT' : 'IDS', 4, TEXT_Y + 5, C.mist);
    if (st.phase !== 'tokenize') {
      for (let p = 0; p < st.shown; p++) textC(String(M.tokenId(st.tokens[p].w)), colX(p) + 10, TEXT_Y + 5, C.slate);
    }

    // loop tracks
    const moving = st.phase === 'loop';
    const rc = moving ? C.lilac : C.line;
    const off = moving ? Math.floor(st.clock / 60) : 0;
    for (let x = PICK.x + PICK.w; x <= TX + 11; x++) if ((x + off) % 3 === 0) { rect(x, 105, 1, 1, rc); rect(x, 119, 1, 1, rc); }
    for (let y = 105; y <= TRACK_Y + 6; y++) if ((y + off) % 3 === 0) { rect(TX - 11, y, 1, 1, rc); rect(TX + 11, y, 1, 1, rc); }
    for (let x = FRAME_X; x <= TX + 11; x++) if ((x - off) % 3 === 0) { rect(x, TRACK_Y - 6, 1, 1, rc); rect(x, TRACK_Y + 6, 1, 1, rc); }
    text('APPEND', PANEL.x, TEXT_Y + 2, moving ? C.lilac : C.slate);
    text('+ REPEAT', PANEL.x, TEXT_Y + 9, moving ? C.lilac : C.slate);

    // context meter + pass counter
    text('CONTEXT', FRAME_X + 1, 234, C.mist);
    for (let i = 0; i < MAXTOK; i++) {
      const c = i < st.shown ? (st.tokens[i].w === M.EOS ? C.red : st.tokens[i].gen ? C.cyan : C.orange) : C.line;
      rect(FRAME_X + 32 + i * 5, 234, 4, 5, c);
    }
    text(st.shown + '/' + MAXTOK, FRAME_X + 32 + MAXTOK * 5 + 4, 234, C.mist);
    text('PASS ' + (st.phase === 'done' ? st.step : st.step + 1), PANEL.x + 6, 136, C.mist);
    const bandPhase = /^(embed|attn|mlp)/.test(st.phase);
    if (st.step > 0 && bandPhase) {
      text('ONLY THE NEW', PANEL.x + 6, 146, C.slate);
      text('TOKEN CLIMBS', PANEL.x + 6, 153, C.slate);
      text('OLD ONES ARE', PANEL.x + 6, 163, C.slate);
      text('CACHED', PANEL.x + 6, 170, C.slate);
    }
  }

  // ---- phase drawing ---------------------------------------------------------
  const PASS = ['embed', 'attn1', 'mlp1', 'attn2', 'mlp2', 'unembed', 'sample', 'loop'];
  const PHASE_BAND = { embed: 0, attn1: 1, mlp1: 2, attn2: 3, mlp2: 4 };
  const PHASE_STAGE = { tokenize: 0, embed: 1, attn1: 2, mlp1: 3, attn2: 2, mlp2: 3, unembed: 4, sample: 5, loop: 6, done: 6 };
  const PINK = STAGES[5].c;
  const riseFrac = b => Math.min(0.4, (b === 3 ? 900 : 450) / st.dur);

  function drawTokenize(u) {
    const pr = M.PROMPTS[st.prompt];
    const x0 = FRAME_X + 5, ty = TEXT_Y + 5, scanEnd = 0.42;
    const spans = [];
    let pos = 0;
    st.tokens.forEach(t => { const s = pr.text.indexOf(t.w, pos); spans.push([s, s + t.w.length]); pos = s + t.w.length; });
    const sx = R(x0 + clamp01(u / scanEnd) * F.width(pr.text)) + 1;
    text(pr.text, x0, ty, u < scanEnd ? C.ink : C.slate);
    spans.forEach(([a, b], k) => {
      const ex = x0 + b * 4 - 1;
      if (sx < ex) return;
      rect(x0 + a * 4, ty + 7, (b - a) * 4 - 1, 1, k % 2 ? C.yellow : C.orange);
      if (k < spans.length - 1) rect(ex, TEXT_Y + 2, 1, 11, PINK);
    });
    if (u < scanEnd) rect(sx, TEXT_Y + 2, 1, 11, C.yellow);
    st.tokens.forEach((t, k) => {
      const t0 = scanEnd + 0.04 + k * (0.3 / st.tokens.length);
      const f = clamp01((u - t0) / 0.2);
      if (f <= 0) return;
      const [a, b] = spans[k];
      const e = ease(f);
      const fx = x0 + ((a + b) / 2) * 4 - CHIP_W / 2;
      chip(lerp(fx, colX(k), e), lerp(TEXT_Y + 2, CHIP_Y, e) - Math.sin(Math.PI * e) * 10, t);
    });
  }

  function drawBandPhase(b) {
    const u = st.t / st.dur;
    const kind = BANDS[b].key;
    const layer = b >= 3 ? 1 : 0;
    const rf = riseFrac(b);
    const n = st.active.length;
    const rising = u < rf;
    const riseY = lerp(rowY(b - 1), rowY(b), ease(u / rf));

    if (kind === 'embed') {
      st.active.forEach(p => {
        textC(String(M.tokenId(st.tokens[p].w)), colX(p) + 10, TEXT_Y + 5, C.sky);
        if (rising) { packet(colX(p), riseY, null); return; }
        if (u < 0.62) {
          const k = Math.floor(st.clock / 90);
          packet(colX(p), rowY(0), null, reduceMotion ? null : { raw: [0, 1, 2, 3, 4, 5].map(i => (p * 7 + i * 13 + k * 5 + i * k) % 6) });
        } else {
          packet(colX(p), rowY(0), st.cache[p].st[0]);
          if (u < 0.7) frame(colX(p) - 1, rowY(0) - 1, 22, 7, C.ink);
        }
      });
      return;
    }

    if (kind === 'attn') {
      const span = 0.94 - rf, seg = span / n;
      const qi = rising ? -1 : Math.floor((u - rf) / seg);
      const lu = rising ? 0 : ((u - rf) - qi * seg) / seg;
      st.active.forEach((p, i) => {
        const c = st.cache[p];
        if (rising) { packet(colX(p), riseY, c.st[b - 1]); return; }
        const done = i < qi || (i === qi && lu > 0.8);
        packet(colX(p), rowY(b), done ? c.st[b] : c.st[b - 1]);
      });
      if (qi < 0 || qi >= n) return;
      const p = st.active[qi];
      const w = st.cache[p].aw[layer];
      const yb = rowY(b) - 2, qx = colX(p) + 10;
      for (let k = 0; k <= p; k++) {
        const wk = w[k];
        const color = wk >= 0.3 ? C.yellow : wk >= 0.12 ? C.orange : wk >= 0.04 ? C.slate : C.line;
        const thick = wk >= 0.3 ? 2 : 1;
        if (k === p) { if (lu > 0.15) frame(qx - 2, yb - 4, 5, 4, color); continue; }
        const hgt = Math.min(19, 5 + (p - k) * 3);
        const kx = colX(k) + 10;
        arc(qx, kx, yb, hgt, color, thick, clamp01(lu * 1.6));
        if (wk >= 0.12 && lu > 0.3) {
          const pt = arcPoint(qx, kx, yb, hgt, ((lu - 0.3) * 2.4) % 1);
          rect(pt.x - 1, pt.y - 1, 2, 2, C.ink);
        }
      }
      frame(colX(p) - 1, rowY(b) - 1, 22, 7, C.yellow);
      return;
    }

    // MLP: widen into 12 neurons, fire some, squeeze back into 6 numbers
    st.active.forEach(p => {
      const c = st.cache[p];
      const h = c.hid[layer];
      const x0 = colX(p) + 1, y0 = BANDS[b].y + 2;
      if (u < 0.93) {
        for (let i = 0; i < 12; i++) {
          const on = u > lerp(rf, 0.72, ((i * 5) % 12) / 12);
          const col = !on ? C.deep : h[i] <= 0 ? C.line : h[i] < 0.6 ? C.green : h[i] < 1.2 ? C.lime : C.ink;
          rect(x0 + (i % 4) * 5, y0 + ((i / 4) | 0) * 4, 3, 3, col);
        }
      }
      if (rising) packet(colX(p), riseY, c.st[b - 1]);
      else packet(colX(p), rowY(b), u > 0.8 ? c.st[b] : c.st[b - 1]);
    });
  }

  function drawOut(a) {
    const u = st.phase === 'unembed' ? st.t / st.dur : 1;
    const p = lastIdx(), x = colX(p);
    packet(x, u < 0.22 ? lerp(rowY(4), OUT_ROW, ease(u / 0.22)) : OUT_ROW, st.cache[p].st[4]);
    if (u < 0.22) return;
    text('LAST TOKEN ONLY', x > 130 ? FRAME_X + 5 : x + 26, OUT.y + 4, C.mist);
    const x0 = x + 21, x1 = PANEL.x - 1, y = OUT_ROW + 2;
    const reveal = st.phase === 'unembed' ? clamp01((u - 0.22) / 0.25) : 1;
    const xr = lerp(x0, x1, reveal);
    const m = Math.floor(st.clock / 70);
    for (let xx = x0; xx <= xr; xx++) if (((xx - m) % 4 + 4) % 4 < 2) rect(xx, y, 1, 1, C.cyan);
    if (reveal >= 1) { rect(x1 - 3, y - 2, 1, 5, C.cyan); rect(x1 - 2, y - 1, 1, 3, C.cyan); rect(x1 - 1, y, 1, 1, C.cyan); }
  }

  function hopIndex(u) {
    const count = st.cands.length, n = st.hops;
    const k = Math.min(n, Math.floor(n * Math.pow(clamp01(u / 0.72), 1 / 1.8)));
    const s = (((st.picked - n) % count) + count) % count;
    return (s + k) % count;
  }
  const pct = x => (x < 0.01 ? '<1%' : Math.round(x * 100) + '%');

  function drawPanel() {
    const ph = st.phase, u = st.t / st.dur;
    const hot = ph === 'unembed' ? C.cyan : ph === 'sample' ? PINK : C.line;
    box(PANEL.x, PANEL.y, PANEL.w, PANEL.h, C.panel, hot);
    text('TEMP ' + st.temp.toFixed(1), PANEL.x + 5, PANEL.y + PANEL.h - 10, C.mist);

    if (ph === 'done') {
      text('STOPPED', PANEL.x + 5, PANEL.y + 5, PINK);
      const lines = st.reason === 'eos' ? ['THE MODEL', 'PICKED <EOS>', '= END OF TEXT'] : ['CONTEXT', 'WINDOW FULL', MAXTOK + ' OF ' + MAXTOK + ' USED'];
      lines.forEach((l, i) => text(l, PANEL.x + 9, PANEL.y + 20 + i * 9, C.ink));
      const left = Math.max(1, Math.ceil((st.dur - st.t) / st.speed / 1000));
      text(st.playing ? 'NEXT PROMPT IN ' + left : 'PRESS STEP', PANEL.x + 5, PANEL.y + 58, C.mist);
      return;
    }

    const have = st.cands && (ph === 'unembed' ? u > 0.47 : ph === 'sample' || ph === 'loop');
    let header = 'NEXT TOKEN?';
    if (have) header = ph === 'unembed' && u < 0.75 ? 'SCORES (LOGITS)' : 'PROBABILITIES';
    text(header, PANEL.x + 5, PANEL.y + 5, have ? C.cyan : C.mist);

    const pr = probs();
    const lg = st.cands ? st.cands.map(c => c.logit) : [];
    const lo = Math.min(...lg) - 0.6, hi = Math.max(...lg);
    const blink = reduceMotion || Math.floor(st.clock / 130) % 2 === 0;
    for (let i = 0; i < 5; i++) {
      const y = PANEL.y + 17 + i * 12;
      rect(BAR_X, y + 2, BAR_MAX, 1, C.line);
      if (!have || !st.cands[i]) { text('-----', PANEL.x + 9, y, C.line); continue; }
      const c = st.cands[i];
      const logitLen = ((c.logit - lo) / (hi - lo)) * BAR_MAX;
      const probLen = pr[i] * BAR_MAX;
      let len = probLen, label = pct(pr[i]);
      if (ph === 'unembed') {
        len = u < 0.75 ? lerp(0, logitLen, ease((u - 0.47) / 0.2)) : lerp(logitLen, probLen, ease((u - 0.75) / 0.18));
        if (u < 0.75) label = c.logit.toFixed(1);
      }
      const isPick = st.picked === i && (ph === 'loop' || (ph === 'sample' && u > 0.72));
      const hop = ph === 'sample' && u <= 0.72 && hopIndex(u) === i;
      const pickColor = ph === 'sample' && !blink ? C.ink : C.yellow;
      text(c.w, PANEL.x + 9, y, isPick ? pickColor : hop ? C.ink : C.mist);
      rect(BAR_X, y, Math.max(1, R(len)), 5, isPick ? pickColor : hop ? C.ink : C.cyan);
      text(label, BAR_X + BAR_MAX + 3, y, C.mist);
      if (hop) text('>', PANEL.x + 4, y, PINK);
      if (isPick) text('>', PANEL.x + 4, y, C.yellow);
    }
  }

  function drawPick() {
    const ph = st.phase, u = st.t / st.dur;
    const on = ph === 'sample';
    text('PICK', PANEL.x + 6, PICK.y + 9, on ? PINK : C.mist);
    box(PICK.x, PICK.y, PICK.w, PICK.h, C.deep, on ? PINK : C.line);
    if (on && u > 0.72) chip(PICK.x + 15, PICK.y + 5 - (u < 0.78 ? 2 : 0), { w: st.cands[st.picked].w, gen: true });
  }

  function drawFlyer(u) {
    const n = st.tokens.length;
    const pts = [[PICK.x + 15, PICK.y + 5], [TX - 10, PICK.y + 5], [TX - 10, TRACK_Y - 5], [colX(n), TRACK_Y - 5], [colX(n), CHIP_Y]];
    const seg = [];
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      seg.push(l); L += l;
    }
    let d = ease(clamp01(u / 0.94)) * L, i = 0;
    while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const f = seg[i] ? Math.min(1, d / seg[i]) : 1;
    if (reduceMotion || Math.floor(st.clock / 200) % 2 === 0) frame(colX(n) - 1, CHIP_Y - 1, CHIP_W + 2, CHIP_H + 2, C.lilac);
    chip(lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f), { w: st.cands[st.picked].w, gen: true });
  }

  function draw() {
    const ph = st.phase;
    const band = PHASE_BAND[ph];
    drawStatic(band === undefined ? -1 : band, STAGES[PHASE_STAGE[ph]].c);
    if (ph === 'tokenize') drawTokenize(st.t / st.dur);
    if (band !== undefined) drawBandPhase(band);
    if (ph === 'unembed' || ph === 'sample' || ph === 'loop') drawOut();
    drawPanel();
    drawPick();
    if (ph === 'loop') drawFlyer(st.t / st.dur);
  }

  // ---- state machine -----------------------------------------------------------
  function durFor(name) {
    const n = st.active.length;
    switch (name) {
      case 'tokenize': return 2600 + 200 * st.tokens.length;
      case 'embed': return 1500;
      case 'attn1': return 1500 + 650 * n;
      case 'attn2': return 1900 + 650 * n;
      case 'mlp1': case 'mlp2': return 1800;
      case 'unembed': return 2800;
      case 'sample': return 2600;
      case 'loop': return 2600;
      default: return 4000;
    }
  }

  function enter(name) {
    st.phase = name;
    st.t = 0;
    if (name === 'embed' && st.step > 0) { st.cands = null; st.picked = -1; }
    if (name === 'unembed') { st.cands = M.candidates(st.tokens); st.picked = -1; }
    if (name === 'sample') {
      const pr = probs();
      let r = Math.random(), i = 0;
      for (; i < pr.length - 1; i++) { r -= pr[i]; if (r <= 0) break; }
      st.picked = i;
      st.hops = 9 + Math.floor(Math.random() * 5);
    }
    st.dur = durFor(name);
    updateGuide();
  }

  function start(i) {
    st.prompt = i;
    st.tokens = M.PROMPTS[i].toks.map(w => ({ w, gen: false }));
    st.cache = M.forward(st.tokens, []);
    st.filled = st.tokens.map(() => 0);
    st.active = st.tokens.map((_, p) => p);
    st.shown = 0; st.step = 0; st.cands = null; st.picked = -1; st.reason = '';
    st.queue = PASS.slice();
    promptSel.value = String(i);
    enter('tokenize');
  }

  function finish() {
    const ph = st.phase;
    const band = PHASE_BAND[ph];
    if (ph === 'done') { start((st.prompt + 1) % M.PROMPTS.length); return; }
    if (ph === 'tokenize') st.shown = st.tokens.length;
    if (band !== undefined) st.active.forEach(p => { st.filled[p] = band + 1; });
    if (ph === 'loop') {
      const w = st.cands[st.picked].w;
      st.tokens.push({ w, gen: true });
      M.forward(st.tokens, st.cache);
      st.filled.push(0);
      st.shown = st.tokens.length;
      st.step++;
      if (w === M.EOS) { st.reason = 'eos'; st.queue = ['done']; }
      else if (st.tokens.length >= MAXTOK) { st.reason = 'full'; st.queue = ['done']; }
      else { st.active = [lastIdx()]; st.queue = PASS.slice(); }
    }
    enter(st.queue.shift());
  }

  // ---- page UI -------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const stagesEl = $('stages'), exEl = $('explain'), exTitle = $('ex-title'), exBody = $('ex-body'), exLive = $('ex-live');
  const textOut = $('text-out'), playBtn = $('play'), promptSel = $('prompt'), tempIn = $('temp'), tempOut = $('temp-out');

  stagesEl.innerHTML = STAGES.map(s => `<li style="--c:${s.c}"><span class="sw"></span><span>${s.name}</span></li>`).join('');
  promptSel.innerHTML = M.PROMPTS.map((p, i) => `<option value="${i}">${p.label}</option>`).join('');

  function updateGuide() {
    const si = PHASE_STAGE[st.phase];
    [...stagesEl.children].forEach((li, i) => {
      li.classList.toggle('on', i === si);
      li.classList.toggle('done', i < si);
      if (i === si) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    const s = STAGES[si];
    const d = st.phase === 'done' ? DONE_TEXT[st.reason] : s;
    exEl.style.setProperty('--c', s.c);
    exTitle.textContent = d.title;
    exBody.textContent = d.body;
  }

  const q = w => '\u201c' + w.toLowerCase() + '\u201d';
  function liveLine() {
    const ph = st.phase, u = st.t / st.dur;
    const tok = p => st.tokens[p].w;
    const lastActive = st.active[st.active.length - 1];
    switch (ph) {
      case 'tokenize': return q(M.PROMPTS[st.prompt].text) + ' \u2192 ' + st.tokens.length + ' tokens';
      case 'embed': {
        const v = st.cache[lastActive].st[0].map(x => x.toFixed(1)).join(' ');
        return q(tok(lastActive)) + ' = ID ' + M.tokenId(tok(lastActive)) + ' \u2192 [' + v + ']';
      }
      case 'attn1': case 'attn2': {
        const rf = riseFrac(PHASE_BAND[ph]);
        const n = st.active.length;
        const qi = Math.min(n - 1, Math.max(0, Math.floor((u - rf) / ((0.94 - rf) / n))));
        const p = st.active[qi];
        const w = st.cache[p].aw[ph === 'attn1' ? 0 : 1];
        const k = w.indexOf(Math.max(...w));
        return k === p ? q(tok(p)) + ' mostly attends to itself (' + pct(w[k]) + ')'
          : q(tok(p)) + ' looks hardest at ' + q(tok(k)) + ' (' + pct(w[k]) + ')';
      }
      case 'mlp1': case 'mlp2': {
        const h = st.cache[lastActive].hid[ph === 'mlp1' ? 0 : 1];
        return h.filter(x => x > 0).length + ' of 12 neurons fired for ' + q(tok(lastActive));
      }
      case 'unembed': {
        if (u < 0.47) return 'Scoring every token in the vocabulary\u2026';
        const pr = probs();
        return 'Top guess: ' + q(st.cands[0].w) + ' at ' + pct(pr[0]);
      }
      case 'sample': {
        if (u <= 0.72) return 'Rolling the dice\u2026';
        return 'Picked ' + q(st.cands[st.picked].w) + ', which had a ' + pct(probs()[st.picked]) + ' chance';
      }
      case 'loop': {
        const w = st.cands[st.picked].w;
        return w === M.EOS ? 'End-of-text goes in last.' : q(w) + ' joins the input. Pass ' + (st.step + 2) + ' is next.';
      }
      default: return st.playing ? 'Next prompt coming up\u2026' : 'Press STEP for the next prompt.';
    }
  }

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let lastText = '', lastLive = '';
  function renderText() {
    let html;
    if (st.shown === 0) {
      html = '<span class="tok-p">' + esc(M.PROMPTS[st.prompt].text.toLowerCase()) + '</span>';
    } else {
      html = st.tokens.slice(0, st.shown).map((t, i) => {
        if (t.w === M.EOS) return ' <span class="tok-e">[end]</span>';
        const sp = i > 0 && !M.CONT.has(t.w) ? ' ' : '';
        return sp + '<span class="' + (t.gen ? 'tok-g' : 'tok-p') + '">' + esc(t.w.toLowerCase()) + '</span>';
      }).join('');
    }
    if (html !== lastText) { textOut.innerHTML = html; lastText = html; }
    const live = liveLine();
    if (live !== lastLive) { exLive.textContent = live; lastLive = live; }
  }

  function syncPlay() { playBtn.textContent = st.playing && !st.stopAfter ? 'PAUSE' : 'PLAY'; }
  function togglePlay() { st.playing = !(st.playing && !st.stopAfter); st.stopAfter = false; syncPlay(); }
  function stepOnce() { st.playing = true; st.stopAfter = true; syncPlay(); }

  playBtn.addEventListener('click', togglePlay);
  $('step').addEventListener('click', stepOnce);
  $('restart').addEventListener('click', () => start(st.prompt));
  promptSel.addEventListener('change', () => start(+promptSel.value));
  tempIn.addEventListener('input', () => { st.temp = parseFloat(tempIn.value); tempOut.value = st.temp.toFixed(1); });
  document.querySelectorAll('[data-speed]').forEach(btn => btn.addEventListener('click', () => {
    st.speed = parseFloat(btn.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  }));
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, select, textarea, button')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); stepOnce(); }
  });

  // ---- main loop -----------------------------------------------------------------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(1000, now - last);
    last = now;
    if (!reduceMotion) st.clock += dt;
    if (st.playing) {
      st.t += dt * st.speed;
      if (st.t >= st.dur) {
        finish();
        if (st.stopAfter) { st.playing = false; st.stopAfter = false; syncPlay(); }
      }
    }
    draw();
    renderText();
    requestAnimationFrame(tick);
  }

  tempOut.value = st.temp.toFixed(1);
  start(0);
  syncPlay();
  requestAnimationFrame(tick);
})();
