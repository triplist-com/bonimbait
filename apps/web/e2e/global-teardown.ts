/** Remove the leads and signup accounts this run created (local stack only). */
import { cleanE2eData } from './helpers/cleanup';
import { IS_LOCAL_STACK, serviceDb } from './helpers/env';

export default async function globalTeardown(): Promise<void> {
  if (!IS_LOCAL_STACK || process.env.E2E_KEEP_DATA === '1') return;
  await cleanE2eData(serviceDb());
}
