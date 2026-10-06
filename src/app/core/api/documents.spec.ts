import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSchema, parse, validate } from 'graphql';
import * as documents from './documents';

const schema = buildSchema(readFileSync(resolve('schema/startgg.graphql'), 'utf8'));

describe('start.gg GraphQL documents', () => {
  const entries = Object.entries(documents).filter(([, v]) => typeof v === 'string');

  it('exports documents', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  for (const [name, source] of entries) {
    it(`${name} is valid against the start.gg schema`, () => {
      const errors = validate(schema, parse(source as string));
      expect(errors.map((e) => e.message)).toEqual([]);
    });
  }
});
