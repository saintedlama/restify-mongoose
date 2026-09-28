export type QueryOperatorPolicy =
  | 'default'
  | 'none'
  | 'all'
  | boolean
  | string[];

export type QueryValidationOptions = {
  queryOperators?: QueryOperatorPolicy;
  queryFields?: string[] | string;
};

export type ValidationResult = {
  valid: boolean;
  message?: string;
};

export const DEFAULT_ALLOWED_OPERATORS = new Set<string>([
  // Comparison
  '$eq',
  '$gt',
  '$gte',
  '$in',
  '$lt',
  '$lte',
  '$ne',
  '$nin',
  // Logical
  '$and',
  '$not',
  '$nor',
  '$or',
  // Element
  '$exists',
  '$type',
  // Array
  '$all',
  '$elemMatch',
  '$size',
  // Evaluation
  '$regex',
  '$options'
]);

const PROTOTYPE_POLLUTION_KEYS = new Set<string>([
  '__proto__',
  'constructor',
  'prototype'
]);

function parseAllowedFields(fields?: string[] | string): Set<string> | undefined {
  if (!fields) {
    return undefined;
  }
  if (Array.isArray(fields)) {
    return new Set(fields.flatMap((f) => f.split(',')).map((f) => f.trim()).filter(Boolean));
  }
  return new Set(fields.split(',').map((f) => f.trim()).filter(Boolean));
}

function parseAllowedOperators(policy?: QueryOperatorPolicy): {
  mode: 'whitelist' | 'none' | 'all';
  whitelist?: Set<string>;
} {
  if (policy === 'none' || policy === false) {
    return { mode: 'none' };
  }
  if (policy === 'all' || policy === true) {
    return { mode: 'all' };
  }
  if (Array.isArray(policy)) {
    const whitelist = new Set(
      policy.map((op) => (op.startsWith('$') ? op : `$${op}`))
    );
    return { mode: 'whitelist', whitelist };
  }
  return { mode: 'whitelist', whitelist: DEFAULT_ALLOWED_OPERATORS };
}

type NodeValidationContext = {
  mode: 'whitelist' | 'none' | 'all';
  whitelist?: Set<string>;
  allowedFields?: Set<string>;
  isFieldLevel: boolean;
};

function validateNode(node: unknown, ctx: NodeValidationContext): ValidationResult {
  if (Array.isArray(node)) {
    for (const item of node) {
      const res = validateNode(item, ctx);
      if (!res.valid) {
        return res;
      }
    }
    return { valid: true };
  }

  if (node && typeof node === 'object') {
    if (Object.prototype.hasOwnProperty.call(node, '__proto__')) {
      return {
        valid: false,
        message: 'Query must not contain prototype pollution key: __proto__'
      };
    }
    if (Object.prototype.hasOwnProperty.call(node, 'constructor')) {
      return {
        valid: false,
        message: 'Query must not contain prototype pollution key: constructor'
      };
    }
    if (Object.prototype.hasOwnProperty.call(node, 'prototype')) {
      return {
        valid: false,
        message: 'Query must not contain prototype pollution key: prototype'
      };
    }

    for (const key of Object.keys(node)) {
      if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
        return {
          valid: false,
          message: `Query must not contain prototype pollution key: ${key}`
        };
      }

      if (key.startsWith('$')) {
        // Operator check against whitelist
        if (ctx.mode === 'none') {
          return {
            valid: false,
            message: `Query operators are not allowed: ${key}`
          };
        }
        if (ctx.mode === 'whitelist') {
          if (!ctx.whitelist?.has(key)) {
            return {
              valid: false,
              message: `Query operator '${key}' is not allowed`
            };
          }
        }

        // Logical/structural operators contain child objects whose keys are fields
        const isChildFieldLevel =
          key === '$or' || key === '$and' || key === '$nor' || key === '$elemMatch';
        const res = validateNode((node as Record<string, unknown>)[key], {
          ...ctx,
          isFieldLevel: isChildFieldLevel
        });
        if (!res.valid) {
          return res;
        }
      } else {
        // Field name check
        if (ctx.isFieldLevel && ctx.allowedFields) {
          const topField = key.includes('.') ? key.split('.')[0] : key;
          if (!ctx.allowedFields.has(key) && !ctx.allowedFields.has(topField)) {
            return {
              valid: false,
              message: `Query field '${key}' is not allowed`
            };
          }
        }

        // Inside a field, the next level object defines operators (e.g. { $gte: 10 })
        const res = validateNode((node as Record<string, unknown>)[key], {
          ...ctx,
          isFieldLevel: false
        });
        if (!res.valid) {
          return res;
        }
      }
    }
  }

  return { valid: true };
}

export function validateQuery(
  q: unknown,
  options?: QueryValidationOptions
): ValidationResult {
  if (!q || typeof q !== 'object' || Array.isArray(q)) {
    return {
      valid: false,
      message: 'Query must be a valid JSON object'
    };
  }

  const { mode, whitelist } = parseAllowedOperators(options?.queryOperators);
  const allowedFields = parseAllowedFields(options?.queryFields);

  return validateNode(q, {
    mode,
    whitelist,
    allowedFields,
    isFieldLevel: true
  });
}
