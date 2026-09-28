import { describe, it, expect } from 'vitest';
import {
  validateQuery,
  DEFAULT_ALLOWED_OPERATORS
} from '../src/query-validator';

describe('validateQuery (Unit Tests)', () => {
  describe('Input Shape & Primitive Validation', () => {
    it('rejects null and undefined', () => {
      const nullRes = validateQuery(null);
      expect(nullRes.valid).toBe(false);
      expect(nullRes.message).toBe('Query must be a valid JSON object');

      const undefRes = validateQuery(undefined);
      expect(undefRes.valid).toBe(false);
      expect(undefRes.message).toBe('Query must be a valid JSON object');
    });

    it('rejects primitive values', () => {
      expect(validateQuery('string').valid).toBe(false);
      expect(validateQuery('').valid).toBe(false);
      expect(validateQuery(123).valid).toBe(false);
      expect(validateQuery(0).valid).toBe(false);
      expect(validateQuery(true).valid).toBe(false);
      expect(validateQuery(false).valid).toBe(false);
    });

    it('rejects arrays as root query', () => {
      expect(validateQuery([]).valid).toBe(false);
      expect(validateQuery([{ title: 'first' }]).valid).toBe(false);
    });

    it('accepts an empty object', () => {
      expect(validateQuery({}).valid).toBe(true);
    });
  });

  describe('Prototype Pollution Protection', () => {
    it('rejects parsed JSON containing __proto__', () => {
      const q = JSON.parse('{"__proto__":{"polluted":true}}');
      const res = validateQuery(q);
      expect(res.valid).toBe(false);
      expect(res.message).toBe('Query must not contain prototype pollution key: __proto__');
    });

    it('rejects computed __proto__ property', () => {
      const q = { ['__proto__']: { polluted: true } };
      const res = validateQuery(q);
      expect(res.valid).toBe(false);
      expect(res.message).toBe('Query must not contain prototype pollution key: __proto__');
    });

    it('rejects constructor property', () => {
      const q = { constructor: { polluted: true } };
      const res = validateQuery(q);
      expect(res.valid).toBe(false);
      expect(res.message).toBe('Query must not contain prototype pollution key: constructor');
    });

    it('rejects prototype property', () => {
      const q = { prototype: { polluted: true } };
      const res = validateQuery(q);
      expect(res.valid).toBe(false);
      expect(res.message).toBe('Query must not contain prototype pollution key: prototype');
    });

    it('rejects nested prototype pollution keys', () => {
      const nested = { user: { ['__proto__']: { admin: true } } };
      expect(validateQuery(nested).valid).toBe(false);

      const inArray = { $or: [{ ['__proto__']: { admin: true } }] };
      expect(validateQuery(inArray).valid).toBe(false);

      const inFieldOp = { title: { $eq: { ['constructor']: { admin: true } } } };
      expect(validateQuery(inFieldOp).valid).toBe(false);
    });
  });

  describe('Default Operator Allowlist', () => {
    it('contains standard safe operators', () => {
      expect(DEFAULT_ALLOWED_OPERATORS.has('$eq')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$ne')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$gt')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$gte')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$lt')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$lte')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$in')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$nin')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$and')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$or')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$not')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$nor')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$exists')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$type')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$all')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$elemMatch')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$size')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$regex')).toBe(true);
      expect(DEFAULT_ALLOWED_OPERATORS.has('$options')).toBe(true);
    });

    it('allows comparison and range queries by default', () => {
      expect(validateQuery({ age: { $gte: 18, $lte: 65 } }).valid).toBe(true);
      expect(validateQuery({ status: { $ne: 'deleted' } }).valid).toBe(true);
      expect(validateQuery({ role: { $in: ['admin', 'editor'] } }).valid).toBe(true);
      expect(validateQuery({ tags: { $nin: ['archived'] } }).valid).toBe(true);
    });

    it('allows logical operators and nested structures', () => {
      const q = {
        $or: [
          { status: 'active', score: { $gt: 50 } },
          { $and: [{ featured: true }, { priority: { $lte: 3 } }] }
        ]
      };
      expect(validateQuery(q).valid).toBe(true);
    });

    it('allows array operators and regex matching', () => {
      expect(validateQuery({ items: { $size: 2 } }).valid).toBe(true);
      expect(validateQuery({ tags: { $all: ['node', 'typescript'] } }).valid).toBe(true);
      expect(
        validateQuery({
          comments: { $elemMatch: { author: 'Alice', score: { $gte: 5 } } }
        }).valid
      ).toBe(true);
      expect(validateQuery({ title: { $regex: '^test', $options: 'i' } }).valid).toBe(true);
    });

    it('rejects unwhitelisted operators by default (Default Deny)', () => {
      const unwhitelisted = [
        '$where',
        '$expr',
        '$function',
        '$accumulator',
        '$lookup',
        '$graphLookup',
        '$merge',
        '$out',
        '$query',
        '$rand'
      ];

      for (const op of unwhitelisted) {
        const topRes = validateQuery({ [op]: 'value' });
        expect(topRes.valid).toBe(false);
        expect(topRes.message).toBe(`Query operator '${op}' is not allowed`);

        const nestedRes = validateQuery({ title: { [op]: 'value' } });
        expect(nestedRes.valid).toBe(false);
        expect(nestedRes.message).toBe(`Query operator '${op}' is not allowed`);

        const arrayRes = validateQuery({ $or: [{ [op]: 'value' }] });
        expect(arrayRes.valid).toBe(false);
        expect(arrayRes.message).toBe(`Query operator '${op}' is not allowed`);
      }
    });
  });

  describe('Strict Mode (queryOperators: "none" | false)', () => {
    it('allows direct equality queries', () => {
      expect(validateQuery({ title: 'hello', count: 5 }, { queryOperators: 'none' }).valid).toBe(true);
      expect(validateQuery({ title: 'hello' }, { queryOperators: false }).valid).toBe(true);
    });

    it('rejects any operator under queryOperators: "none"', () => {
      const res = validateQuery({ tags: { $in: ['a'] } }, { queryOperators: 'none' });
      expect(res.valid).toBe(false);
      expect(res.message).toBe('Query operators are not allowed: $in');
    });

    it('rejects logical operators under queryOperators: false', () => {
      const res = validateQuery({ $or: [{ a: 1 }, { b: 2 }] }, { queryOperators: false });
      expect(res.valid).toBe(false);
      expect(res.message).toBe('Query operators are not allowed: $or');
    });
  });

  describe('Unrestricted Mode (queryOperators: "all" | true)', () => {
    it('allows arbitrary operators when explicitly enabled', () => {
      expect(validateQuery({ $expr: { $gt: ['$a', '$b'] } }, { queryOperators: 'all' }).valid).toBe(true);
      expect(validateQuery({ $where: 'this.a == 1' }, { queryOperators: true }).valid).toBe(true);
    });

    it('still rejects prototype pollution even in unrestricted mode', () => {
      const q = { ['__proto__']: { admin: true } };
      expect(validateQuery(q, { queryOperators: 'all' }).valid).toBe(false);
      expect(validateQuery(q, { queryOperators: true }).valid).toBe(false);
    });
  });

  describe('Custom Operator Whitelist (queryOperators: string[])', () => {
    it('accepts operators specified with or without leading $', () => {
      const options = { queryOperators: ['in', '$gt'] };

      expect(validateQuery({ score: { $gt: 10 } }, options).valid).toBe(true);
      expect(validateQuery({ tags: { $in: ['a'] } }, options).valid).toBe(true);
    });

    it('blocks operators not present in the custom whitelist', () => {
      const options = { queryOperators: ['$in'] };

      const allowed = validateQuery({ tags: { $in: ['a'] } }, options);
      expect(allowed.valid).toBe(true);

      // $gt is normally allowed by default, but blocked when custom whitelist does not include it
      const blocked = validateQuery({ score: { $gt: 10 } }, options);
      expect(blocked.valid).toBe(false);
      expect(blocked.message).toBe("Query operator '$gt' is not allowed");
    });

    it('supports extending DEFAULT_ALLOWED_OPERATORS', () => {
      const extended = [...DEFAULT_ALLOWED_OPERATORS, '$text', '$search'];
      const options = { queryOperators: extended };

      expect(validateQuery({ tags: { $in: ['a'] } }, options).valid).toBe(true);
      expect(validateQuery({ $text: { $search: 'coffee' } }, options).valid).toBe(true);
      expect(validateQuery({ $where: '1' }, options).valid).toBe(false);
    });
  });

  describe('Field Whitelisting (queryFields)', () => {
    it('allows queries restricted to whitelisted fields via array', () => {
      const options = { queryFields: ['title', 'date'] };

      expect(validateQuery({ title: 'Note' }, options).valid).toBe(true);
      expect(validateQuery({ date: { $gte: '2026-01-01' } }, options).valid).toBe(true);
      expect(validateQuery({ title: 'Note', date: { $lte: '2026-12-31' } }, options).valid).toBe(true);
    });

    it('allows queries restricted to whitelisted fields via comma-separated string', () => {
      const options = { queryFields: 'title, date' };

      expect(validateQuery({ title: 'Note' }, options).valid).toBe(true);
      expect(validateQuery({ date: { $gte: '2026-01-01' } }, options).valid).toBe(true);
    });

    it('rejects fields not present in queryFields whitelist', () => {
      const options = { queryFields: ['title', 'date'] };

      const res = validateQuery({ passwordHash: 'secret' }, options);
      expect(res.valid).toBe(false);
      expect(res.message).toBe("Query field 'passwordHash' is not allowed");
    });

    it('rejects unwhitelisted fields inside logical operators', () => {
      const options = { queryFields: ['title'] };

      const res = validateQuery(
        { $or: [{ title: 'First' }, { internalField: 'secret' }] },
        options
      );
      expect(res.valid).toBe(false);
      expect(res.message).toBe("Query field 'internalField' is not allowed");
    });

    it('supports nested dotted paths when top-level field is allowed', () => {
      const options = { queryFields: ['author'] };

      expect(validateQuery({ 'author.name': 'Alice' }, options).valid).toBe(true);
      expect(validateQuery({ 'author.address.city': 'Paris' }, options).valid).toBe(true);
    });

    it('supports exact dotted path whitelist', () => {
      const options = { queryFields: ['author.name'] };

      expect(validateQuery({ 'author.name': 'Alice' }, options).valid).toBe(true);

      const rejected = validateQuery({ 'author.secret': 'xyz' }, options);
      expect(rejected.valid).toBe(false);
      expect(rejected.message).toBe("Query field 'author.secret' is not allowed");
    });
  });
});
