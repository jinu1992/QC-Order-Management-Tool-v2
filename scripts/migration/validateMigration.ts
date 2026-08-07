import dotenv from 'dotenv';
dotenv.config();

import { readSheetAsObjects } from './sheetsClient';
import { supabase } from '../../server/db/supabaseClient';

// Post-migration validation (Phase C / Phase F groundwork): row-count parity between
// source sheets and migrated Supabase tables, plus aggregate-sum spot-checks on
// PO qty/amount and quotation totals, and a specific check on the poDbStatus override
// behavior described in the migration plan -- the subtlest piece of logic being ported.
// Run with `npm run migrate:validate` after `npm run migrate:run`.
//
// This does not compare against the live GAS backend (that's Phase F, once the new
// endpoints exist) -- it only confirms the migration script faithfully carried
// everything from the sheet into Supabase.

function toNum(val: any): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function strOrNull(val: any): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

async function checkRowCount(label: string, sheetName: string, table: string, distinctKeyFromSheet?: string) {
  const sheetRows = await readSheetAsObjects(sheetName);
  const expectedCount = distinctKeyFromSheet
    ? new Set(sheetRows.map((r) => strOrNull(r[distinctKeyFromSheet])).filter(Boolean)).size
    : sheetRows.length;

  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`  [FAIL] ${label}: query error -- ${error.message}`);
    return false;
  }

  const match = count === expectedCount;
  console.log(
    `  [${match ? 'OK' : 'MISMATCH'}] ${label}: sheet=${expectedCount} vs supabase=${count}`
  );
  return match;
}

async function checkPoAggregates() {
  const sheetRows = await readSheetAsObjects('PO_Database');
  const byPo = new Map<string, { qty: number; amount: number }>();

  for (const row of sheetRows) {
    const poNumber = strOrNull(row['PO Number']);
    if (!poNumber) continue;
    const qty = toNum(row['Qty']);
    const unitCost = toNum(row['Unit Cost (Tax Exclusive)']);
    const entry = byPo.get(poNumber) || { qty: 0, amount: 0 };
    entry.qty += qty;
    entry.amount += qty * unitCost;
    byPo.set(poNumber, entry);
  }

  const sample = Array.from(byPo.entries()).slice(0, 25);
  let mismatches = 0;

  for (const [poNumber, expected] of sample) {
    const { data, error } = await supabase
      .from('purchase_orders_expanded')
      .select('qty, amount')
      .eq('po_number', poNumber)
      .maybeSingle();

    if (error || !data) {
      console.log(`  [FAIL] PO ${poNumber}: not found in purchase_orders_expanded (${error?.message || 'no row'})`);
      mismatches++;
      continue;
    }

    const qtyMatch = Math.abs(Number(data.qty) - expected.qty) < 0.01;
    const amountMatch = Math.abs(Number(data.amount) - expected.amount) < 0.5;

    if (!qtyMatch || !amountMatch) {
      console.log(
        `  [MISMATCH] PO ${poNumber}: expected qty=${expected.qty} amount=${expected.amount.toFixed(2)}, ` +
        `got qty=${data.qty} amount=${data.amount}`
      );
      mismatches++;
    }
  }

  console.log(`  Checked ${sample.length} POs (sampled from ${byPo.size} total): ${sample.length - mismatches} matched, ${mismatches} mismatched.`);
  return mismatches === 0;
}

const OVERRIDE_STATUSES = new Set([
  'rtd', 'ready to dispatch', 'dispatched', 'delivered', 'shipped', 'closed', 'cancelled', 'below threshold',
]);

async function checkStatusOverrideBehavior() {
  const sheetRows = await readSheetAsObjects('PO_Database');
  const overridePos: string[] = [];

  for (const row of sheetRows) {
    const poNumber = strOrNull(row['PO Number']);
    const status = strOrNull(row['Status']);
    if (!poNumber || !status) continue;
    if (OVERRIDE_STATUSES.has(status.toLowerCase()) && !overridePos.includes(poNumber)) {
      overridePos.push(poNumber);
    }
  }

  if (overridePos.length === 0) {
    console.log('  No POs with override-worthy statuses found in the sheet -- nothing to check.');
    return true;
  }

  const sample = overridePos.slice(0, 15);
  let mismatches = 0;

  for (const poNumber of sample) {
    const { data, error } = await supabase
      .from('purchase_orders_expanded')
      .select('po_db_status')
      .eq('po_number', poNumber)
      .maybeSingle();

    if (error || !data) {
      console.log(`  [FAIL] PO ${poNumber}: not found (${error?.message || 'no row'})`);
      mismatches++;
      continue;
    }

    const hasOverride = !!strOrNull(data.po_db_status);
    if (!hasOverride) {
      console.log(`  [MISMATCH] PO ${poNumber}: expected a po_db_status override, got empty.`);
      mismatches++;
    }
  }

  console.log(
    `  Checked ${sample.length} override-status POs (of ${overridePos.length} total): ` +
    `${sample.length - mismatches} correctly carried the override, ${mismatches} did not.`
  );
  return mismatches === 0;
}

async function main() {
  console.log('Validating migration...\n');

  console.log('Row-count parity:');
  const results: boolean[] = [];
  results.push(await checkRowCount('Users', 'Users', 'users'));
  results.push(await checkRowCount('Channel_Config', 'Channel_Config', 'channel_configs'));
  results.push(await checkRowCount('Master_SKU_Mapping', 'Master_SKU_Mapping', 'inventory'));
  results.push(await checkRowCount('Zoho_Customers', 'Zoho_Customers', 'customers'));
  results.push(await checkRowCount('PO_Database (distinct PO Number)', 'PO_Database', 'purchase_orders', 'PO Number'));
  results.push(await checkRowCount('Quotations (distinct Estimate ID)', 'Quotations', 'quotations', 'Estimate ID'));

  console.log('\nPO aggregate spot-check (qty/amount, sampled):');
  results.push(await checkPoAggregates());

  console.log('\nStatus-override behavior spot-check (poDbStatus, sampled):');
  results.push(await checkStatusOverrideBehavior());

  const allPassed = results.every(Boolean);
  console.log(`\n${allPassed ? 'All checks passed.' : 'Some checks failed -- review output above before proceeding to cutover.'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('\nValidation aborted:', err.message);
  process.exit(1);
});
