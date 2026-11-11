#!/usr/bin/env node

/**
 * Offline AWS/Brev cost estimator.
 *
 * This script intentionally never calls AWS, Brev, Stripe, or a billing API.
 * It estimates spend from explicit input parameters only.
 */

import fs from 'node:fs';

const DEFAULTS = {
  instances: 1,
  hourlyRate: 0.09,
  redisInstances: 0,
  redisHourlyRate: 0,
  hoursPerDay: 24,
  days: 30,
  storageGb: 0,
  storageRatePerGbMonth: 0,
  egressGb: 0,
  egressRatePerGb: 0,
  fixedMonthly: 0,
  budget: null,
};

function number(value, name, { integer = false, min = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} must be a ${integer ? 'non-negative integer' : 'non-negative number'}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  let inputFile;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') inputFile = argv[++i];
    else if (arg === '--help' || arg === '-h') return { help: true };
    else if (arg.startsWith('--')) {
      const key = arg.slice(2).replaceAll('-', '');
      const value = argv[++i];
      const aliases = {
        replicas: 'instances',
        hourlyrate: 'hourlyRate', hoursperday: 'hoursPerDay',
        redisreplicas: 'redisInstances', redisinstances: 'redisInstances', redishourlyrate: 'redisHourlyRate',
        storageratepergbmonth: 'storageRatePerGbMonth',
        egressratepergb: 'egressRatePerGb', fixedmonthly: 'fixedMonthly',
      };
      const target = aliases[key] || key;
      if (!(target in options)) throw new Error(`unknown option: ${arg}`);
      options[target] = value;
    } else throw new Error(`unexpected argument: ${arg}`);
  }

  if (inputFile) Object.assign(options, JSON.parse(fs.readFileSync(inputFile, 'utf8')));
  options.instances = number(options.instances, 'instances', { integer: true, min: 1 });
  options.hourlyRate = number(options.hourlyRate, 'hourlyRate');
  options.redisInstances = number(options.redisInstances, 'redisInstances', { integer: true, min: 0 });
  options.redisHourlyRate = number(options.redisHourlyRate, 'redisHourlyRate');
  options.hoursPerDay = number(options.hoursPerDay, 'hoursPerDay', { min: 0, });
  options.days = number(options.days, 'days', { min: 0 });
  options.storageGb = number(options.storageGb, 'storageGb');
  options.storageRatePerGbMonth = number(options.storageRatePerGbMonth, 'storageRatePerGbMonth');
  options.egressGb = number(options.egressGb, 'egressGb');
  options.egressRatePerGb = number(options.egressRatePerGb, 'egressRatePerGb');
  options.fixedMonthly = number(options.fixedMonthly, 'fixedMonthly');
  if (options.budget !== null) options.budget = number(options.budget, 'budget');
  return options;
}

function estimate(input) {
  const appCompute = input.instances * input.hourlyRate * input.hoursPerDay * input.days;
  const redisCompute = input.redisInstances * input.redisHourlyRate * input.hoursPerDay * input.days;
  const compute = appCompute + redisCompute;
  const storage = input.storageGb * input.storageRatePerGbMonth * (input.days / 30);
  const egress = input.egressGb * input.egressRatePerGb;
  const total = compute + storage + egress + input.fixedMonthly * (input.days / 30);
  return {
    currency: 'USD',
    assumptions: input,
    lineItems: {
      appCompute: Number(appCompute.toFixed(4)),
      redisCompute: Number(redisCompute.toFixed(4)),
      compute: Number(compute.toFixed(4)),
      storage: Number(storage.toFixed(4)),
      egress: Number(egress.toFixed(4)),
      fixedMonthlyProrated: Number((input.fixedMonthly * (input.days / 30)).toFixed(4)),
    },
    total: Number(total.toFixed(4)),
    budget: input.budget,
    budgetStatus: input.budget === null ? 'not-configured' : total <= input.budget ? 'within-budget' : 'over-budget',
    liveBillingContacted: false,
  };
}

function main() {
  try {
    const input = parseArgs(process.argv.slice(2));
    if (input.help) {
      console.log(`Offline AWS cost dry-run\n\nExample:\n  node scripts/aws-cost-dry-run.mjs --replicas 2 --hourly-rate 0.09 --redis-instances 1 --redis-hourly-rate 0.09 --days 30 --budget 150\n  node scripts/aws-cost-dry-run.mjs --input docs/aws-cost-scenario.json\n\nNo AWS/Brev/billing APIs are contacted.`);
      return;
    }
    console.log(JSON.stringify(estimate(input), null, 2));
  } catch (error) {
    console.error(`dry-run error: ${error.message}`);
    process.exitCode = 2;
  }
}

main();
