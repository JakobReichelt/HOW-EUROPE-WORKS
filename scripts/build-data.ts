/**
 * npm run data
 * Reads data/raw/eurostat_european_cities.csv + data/config/cities.json
 * and writes public/data/europe.json (committed). Prints a coverage table.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataset, coverageTable, type DataConfig } from './lib/buildDataset';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = resolve(root, 'data/raw/eurostat_european_cities.csv');
const configPath = resolve(root, 'data/config/cities.json');
const outPath = resolve(root, 'public/data/europe.json');

const csv = readFileSync(csvPath, 'utf8');
const config = JSON.parse(readFileSync(configPath, 'utf8')) as DataConfig;
const { dataset, warnings } = buildDataset(csv, config);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(dataset, null, 2) + '\n', 'utf8');

console.log(coverageTable(dataset));
console.log('');
for (const warning of warnings) console.warn(`warning: ${warning}`);
console.log(
  `wrote ${dataset.cities.length} cities / ${dataset.countries.length} countries -> public/data/europe.json`,
);
