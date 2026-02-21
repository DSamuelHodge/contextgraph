# Deployment

ContextGraph deploys a Neon database, Hyperdrive binding, and a Cloudflare Worker. CI enforces the branch isomorphism:

- Git branch == Neon branch == Cloudflare preview Worker

## Preview Deployments

Pull requests create a Neon preview branch and a preview Worker. The workflow injects `NEON_BRANCH_URL` into the existing preview env block in `apps/worker/wrangler.jsonc` and deploys with `wrangler deploy --env preview`.

On PR close, the preview Worker and Neon branch are torn down.

## Production Deployments

Production deploys run on pushes to `main` and execute:

1. Vitest suite
2. Drizzle migrations
3. Cloudflare Worker deploy
4. `/health` smoke test

If any step fails, the notifications webhook is called.
