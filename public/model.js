// The toy "model": a hand-written next-token table plus a tiny random transformer
// whose vectors and attention weights drive the picture.
(function () {
  const D = 6;   // numbers per token vector
  const H = 12;  // MLP hidden neurons
  const EOS = '<EOS>';

  const PROMPTS = [
    { label: 'The cat sat on the\u2026', text: 'THE CAT SAT ON THE', toks: ['THE', 'CAT', 'SAT', 'ON', 'THE'] },
    { label: 'Once upon a\u2026', text: 'ONCE UPON A', toks: ['ONCE', 'UPON', 'A'] },
    { label: 'Pixels are\u2026 (a word split in two)', text: 'PIXELS ARE', toks: ['PIX', 'ELS', 'ARE'] },
    { label: 'To be or not to\u2026', text: 'TO BE OR NOT TO', toks: ['TO', 'BE', 'OR', 'NOT', 'TO'] },
  ];

  // Tokens that glue onto the previous one without a space.
  const CONT = new Set(['ELS', 'ION', '.', ',', '!', '?']);

  // ---- next-token table: context -> logits -------------------------------
  const T = {};
  const def = (keys, obj) => keys.split('|').forEach(k => { T[k] = obj; });

  const END = { '.': 3.0, '!': 1.3, AND: 1.2, NOW: 0.6, AGAIN: 0.5 };
  const VERBS = { SAT: 2.2, RAN: 1.7, SLEPT: 1.6, IS: 1.1, ATE: 1.0 };
  const NOUN = { '.': 2.4, WHO: 1.6, AND: 1.3, THAT: 0.9, '!': 0.8 };
  const ADJ = { '.': 2.8, AND: 1.4, '!': 1.2, TOO: 0.8, NOW: 0.6 };

  def('THE CAT|THE DOG|A CAT|A DOG|A KING|A ROBOT|A FROG|THE KING|AN OWL|AN ANT', VERBS);
  def('MAT|SOFA|ROOF|MOON|HILL|STAR|BOAT|BED|HAT|DESK|HEAD|DAY|NIGHT|WOODS|SEA|SKY|TREE|CAVE|BOX|HOUSE|DOWN|STILL|AWAY|HOME|FAST|HERE|SPACE|SLEEP|PEACE|SONGS|ALONE|TOP', END);
  def('SAT THERE|AGAIN|TOO|NOW|ALL', { '.': 3.0, '!': 1.4, AND: 1.0, THEN: 0.7, SO: 0.5 });
  def('CAT|DOG|KING|ROBOT|FROG|SUN|OWL|APPLE|EGG|ANT|IDEA|POINT|WAY', NOUN);
  def('HAPPY|WARM|SOFT|GOOD|SMALL|BLUE|TINY|CUTE|FUN|COOL|TWO', ADJ);

  def('SAT', { ON: 3.0, DOWN: 1.8, STILL: 1.1, THERE: 1.0, '.': 0.8 });
  def('RAN', { AWAY: 2.4, HOME: 1.9, FAST: 1.3, TO: 1.2, '.': 1.0 });
  def('SLEPT|ATE', { '.': 2.6, AND: 1.4, ALL: 1.1, AGAIN: 0.9, TOO: 0.8 });
  def('ALL', { DAY: 2.8, NIGHT: 1.8, ALONE: 0.9, OF: 0.6, '.': 0.5 });
  def('IS', { HAPPY: 2.0, HERE: 1.6, A: 1.4, SMALL: 1.2, BLUE: 0.8 });
  def('TO', { THE: 2.6, A: 1.5, BED: 1.2, SLEEP: 1.1, SPACE: 1.0 });
  def('ON', { THE: 3.2, A: 1.8, TOP: 1.0, MY: 0.9, IT: 0.6 });
  def('ON THE', { MAT: 3.2, SOFA: 2.2, ROOF: 1.8, MOON: 1.0, HILL: 0.8 });
  def('ON A', { MAT: 2.0, HILL: 1.8, ROOF: 1.5, BOAT: 1.4, STAR: 1.2 });
  def('MY', { BED: 2.4, HAT: 1.8, MAT: 1.5, DESK: 1.3, HEAD: 1.0 });
  def('OF', { THE: 2.8, A: 1.6, MY: 1.2, IT: 0.8, ALL: 0.5 });
  def('.', { [EOS]: 2.6, THE: 1.5, IT: 1.3, THEN: 1.0, SO: 0.6 });
  def('!', { [EOS]: 2.8, IT: 1.0, THE: 1.0, WOW: 0.6, SO: 0.5 });
  def('?', { [EOS]: 2.4, THE: 1.2, IT: 1.0, NO: 0.8, YES: 0.8 });
  def('WOW|YES|NO', { '!': 2.6, '.': 1.6, ',': 1.0, IT: 0.6, SO: 0.4 });
  def('AND', { THE: 2.0, IT: 1.4, THEN: 1.2, SLEPT: 1.2, SO: 1.0 });
  def('THERE IS', { A: 2.6, NO: 1.4, ONE: 1.2, AN: 1.0, THE: 0.8 });
  def('THEN', { IT: 2.0, THE: 1.8, SLEPT: 1.4, RAN: 1.1, ATE: 0.9 });
  def('IT', { WAS: 2.6, IS: 2.0, SLEPT: 1.2, RAN: 0.9, SAT: 0.8 });
  def('WAS', { HAPPY: 2.2, WARM: 1.8, SOFT: 1.5, GOOD: 1.4, A: 1.0 });
  def('THERE WAS', { A: 3.2, AN: 1.2, THE: 1.0, ONE: 1.0, NO: 0.6 });
  def('ONE', { DAY: 2.6, CAT: 1.4, KING: 1.2, FROG: 1.0, NIGHT: 1.4 });
  def('AN', { OWL: 2.6, APPLE: 1.8, EGG: 1.2, ANT: 1.0, IDEA: 0.8 });
  def('WHO', { LIVED: 2.2, LOVED: 1.8, SLEPT: 1.6, SANG: 1.2, RAN: 1.0 });
  def('LIVED', { IN: 2.8, ON: 1.5, ALONE: 1.2, THERE: 0.9, '.': 0.8 });
  def('LOVED|SANG', { '.': 2.0, ALL: 1.0, AND: 1.1, SONGS: 0.9, TO: 1.2 });
  def('THAT', { WAS: 2.0, SANG: 1.4, LOVED: 1.2, ATE: 1.0, RAN: 0.8 });
  def('IN', { THE: 2.2, A: 2.0, SPACE: 1.2, PEACE: 1.0, MY: 0.6 });
  def('IN THE', { WOODS: 2.4, SEA: 1.8, SKY: 1.6, SUN: 1.0, END: 1.0 });
  def('IN A', { TREE: 2.2, CAVE: 1.8, HOUSE: 1.6, BOX: 1.4, BOAT: 0.6 });
  def('THE', { CAT: 2.2, DOG: 1.9, SUN: 1.5, MOON: 1.2, END: 1.0 });
  def('A', { CAT: 2.0, DOG: 1.8, KING: 1.6, ROBOT: 1.3, FROG: 1.1 });
  def('THE END|END', { '.': 3.2, '!': 1.6, [EOS]: 1.2, OF: 0.8, AND: 0.4 });
  def('UPON', { A: 3.6, THE: 1.4, HIS: 0.8, IT: 0.5, TOP: 0.4 });
  def('UPON A', { TIME: 4.2, HILL: 1.2, STAR: 1.0, DAY: 0.8, CAT: 0.5 });
  def('TIME', { ',': 2.8, THERE: 1.8, '.': 1.0, WHEN: 0.9, A: 0.4 });
  def(',', { THERE: 2.4, THE: 1.8, A: 1.4, IN: 1.0, ONCE: 0.3 });
  def('THERE', { WAS: 3.0, LIVED: 2.0, IS: 1.0, WERE: 0.9, SAT: 0.6 });
  def('WHEN', { THE: 2.0, A: 1.4, IT: 1.2, THEY: 0.9, ALL: 0.6 });
  def('THEY', { WERE: 2.0, SANG: 1.4, RAN: 1.2, SLEPT: 1.1, ATE: 1.0 });
  def('WERE', { HAPPY: 2.0, SMALL: 1.4, ALL: 1.2, THERE: 1.0, TWO: 0.8 });
  def('ARE', { TINY: 2.2, SO: 2.0, FUN: 1.8, CUTE: 1.6, SMALL: 1.2 });
  def('SO', { CUTE: 2.2, TINY: 1.8, COOL: 1.7, FUN: 1.4, SMALL: 1.0 });
  def('NOT TO', { BE: 4.5, GO: 1.0, DO: 0.8, SEE: 0.6, EAT: 0.5 });
  def('GO|DO|SEE|EAT', { '.': 2.2, HOME: 1.4, IT: 1.0, AWAY: 1.2, '?': 0.8 });
  def('BE', { ',': 2.5, THAT: 1.8, '.': 1.6, '?': 1.2, OR: 0.6 });
  def('BE ,', { THAT: 3.0, AND: 1.0, SO: 0.8, OR: 0.7, THE: 0.6 });
  def(', THAT', { IS: 3.2, WAS: 1.4, SANG: 0.3, ATE: 0.3, RAN: 0.2 });
  def('THAT IS', { THE: 3.0, A: 1.2, ALL: 1.0, HOW: 0.8, WHY: 0.7 });
  def('HOW|WHY', { '?': 2.4, IT: 1.6, THE: 1.2, SO: 0.8, NOT: 0.6 });
  def('IS THE', { QUEST: 3.4, POINT: 1.4, WAY: 1.0, END: 1.0, CAT: 0.4 });
  def('QUEST', { ION: 4.0, FOR: 0.8, '.': 0.6, IS: 0.4, OF: 0.3 });
  def('ION', { '.': 2.6, '!': 1.0, '?': 0.6, AND: 0.6, ',': 0.5 });
  def('OR', { NOT: 3.0, THE: 1.0, A: 0.8, SO: 0.6, IS: 0.4 });
  def('NOT', { TO: 3.0, THE: 1.0, A: 0.8, SO: 1.2, NOW: 0.6 });

  const FALLBACK = { '.': 2.0, [EOS]: 1.5, AND: 1.0, THE: 0.8, '!': 0.6 };

  function candidates(tokens) {
    const ws = tokens.map(t => t.w);
    const n = ws.length;
    const table = (n >= 2 && T[ws[n - 2] + ' ' + ws[n - 1]]) || T[ws[n - 1]] || FALLBACK;
    return Object.entries(table)
      .map(([w, logit]) => ({ w, logit }))
      .sort((a, b) => b.logit - a.logit)
      .slice(0, 5);
  }

  function softmax(cands, temp) {
    const t = Math.max(0.05, temp);
    const m = Math.max(...cands.map(c => c.logit / t));
    const e = cands.map(c => Math.exp(c.logit / t - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map(x => x / s);
  }

  // ---- tiny random transformer -------------------------------------------
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mat(r, rows, cols, scale) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (r() * 2 - 1) * scale));
  }
  const mul = (M, v) => M.map(row => row.reduce((s, w, i) => s + w * v[i], 0));
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

  const R = rng(7331);
  const LAYERS = [0, 1].map(() => ({
    Wq: mat(R, D, D, 1.1), Wk: mat(R, D, D, 1.1), Wv: mat(R, D, D, 0.8),
    W1: mat(R, H, D, 1.0), b1: Array.from({ length: H }, () => (R() - 0.55) * 0.6),
    W2: mat(R, D, H, 0.6),
  }));

  function tokenId(w) {
    if (w === EOS) return 2;
    return 1000 + (hash(w) % 8999);
  }

  function embed(w, pos) {
    const r = rng(hash(w) ^ 0x9e3779b9);
    return Array.from({ length: D }, (_, i) => Math.tanh((r() * 2 - 1) * 1.3 + 0.35 * Math.sin((pos + 1) * (i + 1) * 0.7)));
  }

  // Attention for position p at a layer, given each position's input vector.
  function attend(L, xs, p) {
    const q = mul(L.Wq, xs[p]);
    const scores = [];
    for (let j = 0; j <= p; j++) scores.push(dot(q, mul(L.Wk, xs[j])) * 1.6 / Math.sqrt(D) - (j === p && p > 0 ? 0.4 : 0));
    const m = Math.max(...scores);
    const e = scores.map(s => Math.exp(s - m));
    const s = e.reduce((a, b) => a + b, 0);
    const w = e.map(x => x / s);
    const mix = new Array(D).fill(0);
    for (let j = 0; j <= p; j++) {
      const v = mul(L.Wv, xs[j]);
      for (let i = 0; i < D; i++) mix[i] += w[j] * v[i];
    }
    return { w, out: xs[p].map((x, i) => Math.tanh(1.15 * (x + 0.9 * mix[i]))) };
  }

  function mlp(L, x) {
    const h = mul(L.W1, x).map((z, i) => Math.max(0, z + L.b1[i]));
    const o = mul(L.W2, h);
    return { h, out: x.map((xi, i) => Math.tanh(1.1 * (xi + 0.6 * o[i]))) };
  }

  // Fill in states for every position not computed yet.
  // pos.st[b]: b = 0 embed, 1 attn L1, 2 mlp L1, 3 attn L2, 4 mlp L2
  function forward(tokens, cache) {
    for (let p = cache.length; p < tokens.length; p++) {
      const st = [embed(tokens[p].w, p)];
      const aw = [], hid = [];
      LAYERS.forEach((L, l) => {
        const xs = cache.map(c => c.st[2 * l]).concat([st[2 * l]]);
        const a = attend(L, xs, p);
        st.push(a.out); aw.push(a.w);
        const m = mlp(L, a.out);
        st.push(m.out); hid.push(m.h);
      });
      cache.push({ st, aw, hid });
    }
    return cache;
  }

  window.Model = { D, H, EOS, PROMPTS, CONT, candidates, softmax, tokenId, forward };
})();
