#!/usr/bin/env node

/**
 * Read-only billing audit.
 *
 * AWS: invokes only `aws ce get-cost-and-usage`.
 * Brev: calls only the user-provided BRE​​V_USAGE_URL with GET.
 * No payment, provisioning, auto-recharge, mutation, or secret output.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DAY = 86_400_000;
const projectionPath = process.env.PROJECTION_FILE || 'docs/aws-cost-projection-2026-11-10.json';

function isoDate(date) { return date.toISOString().slice(0, 10); }
function parseArgs(argv) {
  const out = { days: 30, start: null, end: isoDate(new Date()), projection: projectionPath, live: false, freeOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--live') out.live = true;
    else if (arg === '--free-only') out.freeOnly = true;
    else if (arg === '--days') out.days = Number(argv[++i]);
    else if (arg === '--start') out.start = argv[++i];
    else if (arg === '--end') out.end = argv[++i];
    else if (arg === '--projection') out.projection = argv[++i];
    else if (arg === '--help' || arg === '-h') return { help: true };
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!out.start) out.start = isoDate(new Date(Date.now() - out.days * DAY));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.start) || !/^\d{4}-\d{2}-\d{2}$/.test(out.end)) {
    throw new Error('start/end must use YYYY-MM-DD');
  }
  return out;
}

function readProjection(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Number.isFinite(Number(value.total))) throw new Error(`projection has no numeric total: ${file}`);
  return value;
}

function awsReadOnly(start, end) {
  const payload = {
    TimePeriod: { Start: start, End: end },
    Granularity: 'DAILY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
  };
  const raw = execFileSync('aws', ['ce', 'get-cost-and-usage', '--cli-input-json', JSON.stringify(payload), '--output', 'json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const response = JSON.parse(raw);
  const rows = response.ResultsByTime || [];
  let total = 0;
  const services = {};
  for (const row of rows) {
    for (const group of row.Groups || []) {
      const service = group.Keys?.[0] || 'UNKNOWN';
      const amount = Number(group.Metrics?.UnblendedCost?.Amount || 0);
      if (!Number.isFinite(amount)) continue;
      services[service] = (services[service] || 0) + amount;
      total += amount;
    }
  }
  return { provider: 'aws', start, end, estimated: rows.some(row => row.Estimated === true), total: Number(total.toFixed(4)), services };
}

async function brevReadOnly(start, end) {
  const url = process.env.BREV_USAGE_URL;
  if (!url) return { provider: 'brev', status: 'not-configured', reason: 'BREV_USAGE_URL not set' };
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('BREV_USAGE_URL must be HTTP(S)');
  parsed.searchParams.set('start', start);
  parsed.searchParams.set('end', end);
  const headers = { accept: 'application/json' };
  if (process.env.BREV_API_KEY) headers.authorization = `Bearer ${process.env.BREV_API_KEY}`;
  const response = await fetch(parsed, { method: 'GET', headers });
  if (!response.ok) throw new Error(`Brev usage GET failed with HTTP ${response.status}`);
  const data = await response.json();
  const total = Number(data.total ?? data.totalCost ?? data.cost ?? NaN);
  return { provider: 'brev', status: 'ok', start, end, total: Number.isFinite(total) ? Number(total.toFixed(4)) : null, rawShape: Object.keys(data).slice(0, 20) };
}

function compare(projection, actuals) {
  const projected = Number(projection.total);
  return actuals.filter(x => Number.isFinite(Number(x.total))).map(x => ({
    provider: x.provider,
    projected,
    actual: Number(x.total),
    variance: Number((Number(x.total) - projected).toFixed(4)),
    variancePercent: projected ? Number((((Number(x.total) - projected) / projected) * 100).toFixed(2)) : null,
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Read-only billing audit\n\nFree-only (local, no network): node scripts/billing-audit-readonly.mjs --free-only\nLive (AWS Cost Explorer + configured Brev GET): node scripts/billing-audit-readonly.mjs --live --days 30\nLive requires explicit read-only confirmation and may expose provider charges; no mutation endpoints are called.');
    return;
  }
  const projection = readProjection(args.projection);
  if (args.freeOnly && args.live) throw new Error('--free-only cannot be combined with --live');
  if (args.freeOnly) {
    console.log(JSON.stringify({ mode: 'free-only-local', projection, actuals: [], comparisons: [], networkAccessed: false, credentialsRead: false, paidServicesUsed: false, liveBillingContacted: false }, null, 2));
    return;
  }
  if (!args.live) {
    console.log(JSON.stringify({ mode: 'dry-run', projection, actuals: [], comparisons: [], liveBillingContacted: false }, null, 2));
    return;
  }
  if (process.env.BILLING_AUDIT_CONFIRM_READ_ONLY !== 'true') throw new Error('set BILLING_AUDIT_CONFIRM_READ_ONLY=true to enable live read-only queries');
  const actuals = [];
  try { actuals.push(awsReadOnly(args.start, args.end)); }
  catch (error) { actuals.push({ provider: 'aws', status: 'error', reason: error.message }); }
  try { actuals.push(await brevReadOnly(args.start, args.end)); }
  catch (error) { actuals.push({ provider: 'brev', status: 'error', reason: error.message }); }
  console.log(JSON.stringify({ mode: 'live-read-only', window: { start: args.start, end: args.end }, projection, actuals, comparisons: compare(projection, actuals), writesPerformed: false }, null, 2));
}

main().catch(error => { console.error(`billing-audit error: ${error.message}`); process.exitCode = 2; });
