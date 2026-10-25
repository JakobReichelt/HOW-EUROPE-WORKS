import { SCHEMA_VERSION, type Dataset } from './types';

export async function loadDataset(url = `${import.meta.env.BASE_URL}data/europe.json`) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  const dataset = (await response.json()) as Dataset;
  if (dataset.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `europe.json has schema ${dataset.schemaVersion}, app expects ${SCHEMA_VERSION}. Run npm run data.`,
    );
  }
  return dataset;
}
