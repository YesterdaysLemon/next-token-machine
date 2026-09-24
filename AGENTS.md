<!-- al-stack:project:start -->
## Al-stack project

Project: Next-Token Machine. Profile: web. Status: experimental.

Animated pixel-art walkthrough of how an LLM writes: tokenize, embed, attention, MLP, softmax, sample, and the autoregressive loop. Served at tokenloop.alirezaafshan.com via Deploy Manager.

`al-stack.toml` records this project's setup and dependencies. Work from the checkout selected for the task; other branches/worktrees are optional history. Use `al-stack register .` once when starting work here. Local registration does not change the project's lifecycle.

Project commands:
- dev: `npm start`
- test: `npm test`

Edit project guidance outside this managed section. Use `al-stack configure` for its fields and `al-stack check .` for setup checks. Run the actual project checks for behavioral validation.
<!-- al-stack:project:end -->

## Project notes

- `public/` is the whole site: plain HTML/CSS plus canvas JavaScript, no build step and no dependencies. `server.mjs` serves it with a strict CSP (only Google Fonts is external) and `/healthz`, which reports the build SHA.
- The canvas is drawn at a 448×256 logical resolution, 3× internally. `public/machine.js` holds the stage state machine (`tokenize → embed → attn1 → mlp1 → attn2 → mlp2 → unembed → sample → loop`, later passes skip tokenize and only the new column climbs). Keep all canvas text inside the 3×5 font in `public/font.js`; tokens must be at most 5 glyphs to fit a chip.
- The page is honestly labelled a toy: next-token odds come from the table in `public/model.js`, vectors/attention from fixed random matrices. Keep that framing and the "toy vs. real" table accurate when changing sizes or copy.
- Keep non-ASCII out of the `.js` files (use `\u` escapes) so they render correctly regardless of how they are served.

## Acceptance

- `npm test` passes (static checks, 1,200 sampled generations, server smoke test).
- Visual/interaction changes follow `frontend-quality`: check desktop and ~375px width in a browser, no horizontal page scroll, no console errors, every stage renders.

## Deployment

- Deploy Manager app ID `next-token-machine`, branch `main`, VPS checkout `/opt/next-token-machine/app` owned by `deploy-manager`, loopback ports 3270 (production) / 3271 (candidate), container port 8080, health path `/healthz`.
- Public hostname `tokenloop.alirezaafshan.com` (Cloudflare-proxied DNS → Caddy on the VPS).
- `.github/workflows/deploy.yml` runs `npm test`, then sends the signed deploy request and polls the manager receipt until it is terminal. Use the `vps-operations` skill for anything on the server; a pushed commit is not deployed until the receipt says `succeeded` and public `/healthz` reports the new SHA.
