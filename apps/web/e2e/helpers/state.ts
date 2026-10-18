/**
 * What global-setup made for this run (users, businesses, the managed project),
 * shared with the specs through e2e/.auth/run.json (gitignored).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const AUTH_DIR = join(__dirname, '..', '.auth');
export const RUN_FILE = join(AUTH_DIR, 'run.json');

/** Fixture roles signed in once by global-setup (storage state per role). */
export type Role = 'admin' | 'pro' | 'partner' | 'manager' | 'client';
export const ROLES: readonly Role[] = ['admin', 'pro', 'partner', 'manager', 'client'];

export interface RunState {
  runId: string;
  startedAt: string;
  users: Record<Role, { id: string; email: string }>;
  proBusiness: { id: string; slug: string; name: string };
  partnerBusiness: { id: string; slug: string; name: string };
  managedProjectId: string;
}

export function storageStatePath(role: Role): string {
  return join(AUTH_DIR, `${role}.json`);
}

export function runState(): RunState {
  if (!existsSync(RUN_FILE)) throw new Error('e2e/.auth/run.json is missing: global-setup did not run.');
  return JSON.parse(readFileSync(RUN_FILE, 'utf8')) as RunState;
}

/** Every lead the suite creates carries this e-mail domain and name prefix (teardown removes them). */
export const E2E_EMAIL_DOMAIN = 'bonimbait.test';
export const E2E_NAME = 'בדיקת מערכת';

export function e2eEmail(tag: string): string {
  return `e2e-${tag}@${E2E_EMAIL_DOMAIN}`;
}
