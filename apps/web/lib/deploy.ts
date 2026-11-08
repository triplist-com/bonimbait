/**
 * Where this server runs. The site has been hosted on Vercel and on Render;
 * code that must behave differently on a hosted deployment (no mock payments,
 * no mock-paid badges on the live site, trusted client-IP headers) asks here
 * instead of reading one host's variables.
 *
 * - Vercel sets VERCEL=1 and VERCEL_ENV=production | preview | development.
 * - Render sets RENDER=true on every service, and IS_PULL_REQUEST=true on
 *   pull-request previews.
 *
 * Client-safe (no secrets), but only meaningful on the server.
 */
type Env = Record<string, string | undefined>;

export function isVercel(env: Env = process.env): boolean {
  return Boolean(env.VERCEL) || Boolean(env.VERCEL_ENV);
}

export function isRender(env: Env = process.env): boolean {
  return env.RENDER === 'true';
}

/** Any hosted deployment (production or preview), as opposed to a local machine or a test run. */
export function isHostedDeploy(env: Env = process.env): boolean {
  return isVercel(env) || isRender(env);
}

/** The live site: Vercel production, or a Render service that isn't a pull-request preview. */
export function isProductionDeploy(env: Env = process.env): boolean {
  if (env.VERCEL_ENV === 'production') return true;
  return isRender(env) && env.IS_PULL_REQUEST !== 'true';
}
