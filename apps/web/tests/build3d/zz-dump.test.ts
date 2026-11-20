import { it } from 'vitest';
import { house } from '@/lib/build3d/house';
import { getContext } from '@/lib/build3d/steps';
import { structureFrame } from '@/lib/build3d/steps/structure-kit';

it('dump', () => {
  const ctx = getContext(house);
  const r = (p: number[]) => p.map((v) => +v.toFixed(2));
  console.log('lower', JSON.stringify(ctx.footprint.lower.map(r)));
  console.log('entrance', JSON.stringify(ctx.footprint.entrance.map(r)));
  console.log('house', JSON.stringify(ctx.footprint.house.map(r)));
  console.log('grade', JSON.stringify(ctx.footprint.grade.map(r)));
  console.log('y', JSON.stringify(ctx.y), 'baseY', ctx.terrain.baseY, 'bounds', JSON.stringify(ctx.terrain.bounds));
  console.log('gate', ctx.lot.gate, 'inward', ctx.lot.street.inward);
  const fr = structureFrame(ctx);
  const g = ctx.terrain.finished;
  // finished heights along x = 5 from z=-10 to 28
  const row: string[] = [];
  for (let z = -10; z <= 28; z += 1) row.push(`${z}:${ctx.heightAt(5, z, g).toFixed(2)}/${ctx.heightAt(5, z, fr.backfill).toFixed(2)}/${ctx.heightAt(5, z, ctx.terrain.natural).toFixed(2)}`);
  console.log('x=5 fin/backfill/nat', row.join(' '));
  const row2: string[] = [];
  for (let x = -9; x <= 21; x += 1) row2.push(`${x}:${ctx.heightAt(x, 6, g).toFixed(2)}/${ctx.heightAt(x, 6, fr.backfill).toFixed(2)}`);
  console.log('z=6 fin/backfill', row2.join(' '));
  for (const w of house.walls.filter((w) => w.level !== 'site')) console.log(w.id, w.level, w.role, w.material, r(w.a as number[]), r(w.b as number[]), w.thickness, w.baseY, w.height);
});
