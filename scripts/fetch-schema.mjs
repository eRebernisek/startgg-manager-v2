// Downloads the start.gg GraphQL schema (SDL) into schema/startgg.graphql.
// Usage: STARTGG_TOKEN=xxxx node scripts/fetch-schema.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildClientSchema, getIntrospectionQuery, printSchema } from 'graphql';

const token = process.env.STARTGG_TOKEN;
if (!token) {
  console.error('Set STARTGG_TOKEN to a start.gg personal API token.');
  process.exit(1);
}

const res = await fetch('https://api.start.gg/gql/alpha', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ query: getIntrospectionQuery() }),
});
const json = await res.json();
if (!json.data) {
  console.error(JSON.stringify(json).slice(0, 500));
  process.exit(1);
}
mkdirSync('schema', { recursive: true });
writeFileSync('schema/startgg.graphql', printSchema(buildClientSchema(json.data)) + '\n');
console.log('Wrote schema/startgg.graphql');
