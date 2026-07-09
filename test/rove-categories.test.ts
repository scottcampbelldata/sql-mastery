import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rove from '../src/datasets/rove/generate';
import { CATEGORY_ORPHAN_COUNT } from '../src/datasets/rove/mess';

// Adjacency walk (children-of) used to reproduce a WITH RECURSIVE descendant walk in plain JS.
function descendantsOf(rows: any[], rootId: number): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const r of rows) {
    const p = r.parent_category_id as number | null;
    if (p === null) continue;
    if (!childrenByParent.has(p)) childrenByParent.set(p, []);
    childrenByParent.get(p)!.push(r.category_id as number);
  }
  const out: number[] = [];
  const stack: number[] = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as number;
    out.push(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  return out.sort((a, b) => a - b);
}

// Depth of a node by walking parent pointers in a clean (orphan-free) tree.
function depthOf(byId: Map<number, number | null>, id: number): number {
  let depth = 1;
  let cur: number | null = id;
  while (cur !== null) {
    const parent = byId.get(cur);
    if (parent === undefined || parent === null) break;
    depth += 1;
    cur = parent;
  }
  return depth;
}

const EXPECTED_RESTAURANTS_SUBTREE = [1, 7, 8, 9, 19, 20, 21, 22, 23, 24, 25, 26, 38, 39];

test('rove clean core builds a valid <= 3 level category tree with merchant leaf FKs', () => {
  const d = rove.generateClean(rove.SEED);
  const categories = d.categories as any[];

  assert.equal(categories.length, 40, `expected 40 categories, got ${categories.length}`);

  const ids = categories.map((c) => c.category_id as number);
  assert.equal(new Set(ids).size, ids.length, 'category_id values are not all distinct');

  const idSet = new Set(ids);
  const byId = new Map<number, number | null>();
  for (const c of categories) byId.set(c.category_id as number, c.parent_category_id as number | null);

  // Clean tree: every parent pointer is null (root) or a real category_id; depth never exceeds 3.
  for (const c of categories) {
    const parent = c.parent_category_id as number | null;
    if (parent !== null) {
      assert.ok(idSet.has(parent), `category ${c.category_id} points to missing parent ${parent}`);
    }
    assert.ok(depthOf(byId, c.category_id as number) <= 3, `category ${c.category_id} deeper than 3 levels`);
  }

  // A WITH RECURSIVE walk from the fixed Restaurants root (category_id 1) returns the bounded set.
  assert.deepEqual(descendantsOf(categories, 1), EXPECTED_RESTAURANTS_SUBTREE);

  // Every merchant carries a valid leaf category_id whose root matches its text category.
  const merchants = d.merchants as any[];
  const leavesByCategory: Record<string, number[]> = {
    restaurant: [19, 20, 21, 22, 23, 24, 25, 26, 38, 39],
    grocery: [27, 28, 29, 30, 40],
    pharmacy: [12, 31],
    convenience: [14, 32, 33],
    alcohol: [17, 34, 35],
    flowers: [36, 37],
  };
  for (const m of merchants) {
    const allowed = leavesByCategory[m.category as string];
    assert.ok(allowed !== undefined, `merchant ${m.merchant_id} has unknown category ${m.category}`);
    assert.ok(
      allowed.includes(m.category_id as number),
      `merchant ${m.merchant_id} (${m.category}) has category_id ${m.category_id} outside its leaf set`
    );
  }
});

test('rove mess injects bounded orphaned category parents that stay cleanable', () => {
  const d = rove.generate(rove.SEED);
  const categories = d.categories as any[];

  assert.equal(categories.length, 40, 'mess must not change the category row count');

  const idSet = new Set(categories.map((c) => c.category_id as number));

  // Exactly CATEGORY_ORPHAN_COUNT non-null parent pointers reference a missing (orphaned) parent.
  const orphans = categories.filter((c) => {
    const p = c.parent_category_id as number | null;
    return p !== null && !idSet.has(p);
  });
  assert.equal(orphans.length, CATEGORY_ORPHAN_COUNT, `expected ${CATEGORY_ORPHAN_COUNT} orphaned parents, got ${orphans.length}`);
  for (const orphan of orphans) {
    assert.ok((orphan.parent_category_id as number) <= 32767, 'orphan parent id must fit PostgreSQL smallint');
  }

  // The Restaurants subtree (root 1) is never orphaned, so the fixed-root walk still returns 14.
  assert.deepEqual(descendantsOf(categories, 1), EXPECTED_RESTAURANTS_SUBTREE);

  // Cleanable/traversable: treat any missing-parent pointer as a root, then a recursive walk from
  // all roots reaches every one of the 40 nodes (no orphan is ever stranded, no cycle exists).
  const roots = categories
    .filter((c) => {
      const p = c.parent_category_id as number | null;
      return p === null || !idSet.has(p);
    })
    .map((c) => c.category_id as number);

  const childrenByParent = new Map<number, number[]>();
  for (const c of categories) {
    const p = c.parent_category_id as number | null;
    if (p === null || !idSet.has(p)) continue; // orphan pointer treated as a new root
    if (!childrenByParent.has(p)) childrenByParent.set(p, []);
    childrenByParent.get(p)!.push(c.category_id as number);
  }
  const reached = new Set<number>();
  const stack = [...roots];
  while (stack.length > 0) {
    const id = stack.pop() as number;
    if (reached.has(id)) continue; // guards against any accidental cycle
    reached.add(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  assert.equal(reached.size, 40, `cleaned walk reached ${reached.size} of 40 categories`);

  // Money/text mess stays intact: orders still carry the legacy money-as-text column.
  const orders = d.orders as any[];
  assert.ok('order_total_legacy' in orders[0], 'order_total_legacy missing -> money mess was disturbed');
});
