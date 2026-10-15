// Node module hook for the offline quality scripts (register() it before importing
// apps/web/app/api/_lib/semantic.ts):
// - "@/x" resolves to apps/web/x(.ts|/index.ts), like the Next.js path alias;
// - "@/lib/autopilot/fusion" becomes its fail-open behaviour when the runtime store is
//   not configured (no runtime rows), so the static index is measured on its own
//   without loading server-only modules or a database client.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../apps/web');
const FUSION_STUB = 'data:text/javascript,export async function searchRuntimeSegments() { return []; }';

export async function resolve(specifier, context, next) {
  if (specifier === '@/lib/autopilot/fusion') return { url: FUSION_STUB, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const base = path.join(web, specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}
