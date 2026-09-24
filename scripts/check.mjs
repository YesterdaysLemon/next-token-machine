// Static checks: scripts compile, the page references real files, and the toy
// model only ever produces tokens the pixel font and 21px token chips can show.
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const pub = new URL('../public/', import.meta.url);
const read = f => readFile(new URL(f, pub), 'utf8');

const html = await read('index.html');
for (const ref of [...html.matchAll(/(?:src|href)="([^":]+)"/g)].map(m => m[1])) {
  await access(new URL(ref, pub));
}
assert.match(html, /<title>[^<]+<\/title>/, 'page needs a title');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ['font.js', 'model.js']) vm.runInContext(await read(f), sandbox, { filename: f });
new vm.Script(await read('machine.js'), { filename: 'machine.js' });

const { PixelFont: F, Model: M } = sandbox.window;
const fits = w => {
  assert.ok(F.width(w) <= 19, `token "${w}" is too wide for a chip`);
  for (const ch of w) assert.ok(F.has(ch), `no glyph for "${ch}" in "${w}"`);
};

for (const p of M.PROMPTS) {
  let pos = 0;
  for (const t of p.toks) {
    fits(t);
    const at = p.text.indexOf(t, pos);
    assert.ok(at >= 0, `prompt "${p.text}" does not contain token "${t}" in order`);
    pos = at + t.length;
  }
}

const seen = new Set();
let runs = 0;
for (const temp of [0.1, 0.8, 2]) {
  for (let r = 0; r < 400; r++, runs++) {
    const p = M.PROMPTS[r % M.PROMPTS.length];
    const toks = p.toks.map(w => ({ w }));
    const cache = M.forward(toks, []);
    while (toks.length < 12) {
      const c = M.candidates(toks);
      assert.equal(c.length, 5, 'every context needs five candidates');
      const pr = M.softmax(c, temp);
      assert.ok(Math.abs(pr.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'probabilities must sum to 1');
      let x = Math.random(), i = 0;
      for (; i < pr.length - 1; i++) { x -= pr[i]; if (x <= 0) break; }
      const w = c[i].w;
      fits(w);
      seen.add(w);
      toks.push({ w });
      M.forward(toks, cache);
      const last = cache[cache.length - 1];
      assert.equal(last.st.length, 5, 'five stored vectors per token');
      for (const aw of last.aw) assert.ok(Math.abs(aw.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'attention weights sum to 1');
      if (w === M.EOS) break;
    }
  }
}

console.log(`check ok: ${runs} sampled generations, ${seen.size} distinct generated tokens`);
