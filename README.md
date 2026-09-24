# The Next-Token Machine

**Live:** https://tokenloop.alirezaafshan.com/

An animated pixel-art walkthrough of how a large language model writes. Text is
cut into tokens, each token becomes a vector, the vectors climb through
attention and MLP layers, the last one is scored against the vocabulary,
softmax turns scores into odds, one token is sampled, and a conveyor belt
carries it back into the input so the machine can run again. That loop is what
"autoregressive" means.

Controls: play/pause, step one stage at a time (→), speed, temperature, and four
prompts, including one where a word splits into two tokens.

## Honest about being a toy

Every stage is a real step an LLM takes, in the right order, but everything is
shrunk: 6 numbers per vector, 2 drawn layers, one attention head, 12 tokens of
context. Next-token odds come from a small hand-written table in
`public/model.js` (~120 tokens); vectors and attention weights come from fixed
random matrices, so they move like the real thing without meaning anything.

## Run it

```bash
npm start          # http://localhost:8790
npm test           # static checks + server smoke test
```

No dependencies. `public/` is plain HTML, CSS and canvas JavaScript; the 3×5
pixel font is drawn by hand in `public/font.js`.

## Layout

| Path | What it is |
| --- | --- |
| `public/index.html` | page, styles, controls, guide text |
| `public/machine.js` | canvas renderer and stage state machine |
| `public/model.js` | toy next-token table and tiny random transformer |
| `public/font.js` | 3×5 bitmap font |
| `server.mjs` | static server with `/healthz` (reports the build SHA) |
| `scripts/check.mjs` | compiles scripts, samples 1,200 generations, checks every token fits a chip |
| `scripts/smoke.mjs` | starts the server and checks routes, 404/403/405 |

## Deploy

Pushes to `main` run the checks in GitHub Actions and then ask
[Deploy Manager](https://github.com/YesterdaysLemon/deploy-manager) on the VPS
to build the Docker image, health-check a candidate container, and swap it into
production on `127.0.0.1:3270`. Caddy serves it at `tokenloop.alirezaafshan.com`.
