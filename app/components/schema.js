/**
 * Lightweight Schema Validation
 *
 * A native JSON Schema validator supporting common validation patterns.
 * No external dependencies - covers typical component data validation needs.
 *
 * Supported JSON Schema keywords:
 * - type: string, number, integer, boolean, array, object, null
 * - required: array of required property names
 * - properties: object property schemas
 * - items: array item schema
 * - enum: allowed values
 * - minimum, maximum: number bounds
 * - minLength, maxLength: string length
 * - minItems, maxItems: array length
 * - pattern: regex pattern for strings
 * - format: common formats (email, uri, date, date-time)
 * - default: default value
 *
 * @example
 * import { createValidator, validate } from './schema.js';
 *
 * const schema = {
 *   type: 'object',
 *   required: ['title'],
 *   properties: {
 *     title: { type: 'string', minLength: 1 },
 *     count: { type: 'integer', minimum: 0 }
 *   }
 * };
 *
 * const validator = createValidator(schema);
 * const result = validator({ title: 'Test', count: 5 });
 * // { valid: true, errors: [], data: { title: 'Test', count: 5 } }
 */

/**
 * Validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether data is valid
 * @property {ValidationError[]} errors - Array of validation errors
 * @property {*} data - The validated data (with defaults applied)
 */

/**
 * Validation error
 * @typedef {Object} ValidationError
 * @property {string} path - JSON path to the error (e.g., ".items[0].name")
 * @property {string} message - Human-readable error message
 * @property {string} keyword - Schema keyword that failed
 */

// Common format validators
const FORMATS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uri: /^https?:\/\/.+/,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}:\d{2}(\.\d+)?$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
};

/**
 * Get the type of a value
 * @param {*} value
 * @returns {string}
 */
function getType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Check if value matches expected type
 * @param {*} value
 * @param {string|string[]} type
 * @returns {boolean}
 */
function checkType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  const actualType = getType(value);

  return types.some(t => {
    if (t === 'integer') {
      return actualType === 'number' && Number.isInteger(value);
    }
    return actualType === t;
  });
}

/**
 * Validate a value against a schema
 * @param {*} value - Value to validate
 * @param {Object} schema - JSON Schema
 * @param {string} [path=''] - Current path for error messages
 * @returns {ValidationResult}
 */
export function validate(value, schema, path = '') {
  const errors = [];
  let data = value;

  // Handle default value
  if (value === undefined && schema.default !== undefined) {
    data = structuredClone(schema.default);
    value = data;
  }

  // Null check
  if (value === undefined || value === null) {
    if (schema.type && !checkType(value, schema.type)) {
      errors.push({
        path,
        message: `Expected ${schema.type}, got ${getType(value)}`,
        keyword: 'type'
      });
    }
    return { valid: errors.length === 0, errors, data };
  }

  // Type validation
  if (schema.type && !checkType(value, schema.type)) {
    errors.push({
      path,
      message: `Expected ${Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type}, got ${getType(value)}`,
      keyword: 'type'
    });
    return { valid: false, errors, data };
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      path,
      message: `Value must be one of: ${schema.enum.join(', ')}`,
      keyword: 'enum'
    });
  }

  // String validations
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path,
        message: `String must be at least ${schema.minLength} characters`,
        keyword: 'minLength'
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path,
        message: `String must be at most ${schema.maxLength} characters`,
        keyword: 'maxLength'
      });
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({
          path,
          message: `String must match pattern: ${schema.pattern}`,
          keyword: 'pattern'
        });
      }
    }
    if (schema.format && FORMATS[schema.format]) {
      if (!FORMATS[schema.format].test(value)) {
        errors.push({
          path,
          message: `Invalid ${schema.format} format`,
          keyword: 'format'
        });
      }
    }
  }

  // Number validations
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path,
        message: `Value must be >= ${schema.minimum}`,
        keyword: 'minimum'
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path,
        message: `Value must be <= ${schema.maximum}`,
        keyword: 'maximum'
      });
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      errors.push({
        path,
        message: `Value must be > ${schema.exclusiveMinimum}`,
        keyword: 'exclusiveMinimum'
      });
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      errors.push({
        path,
        message: `Value must be < ${schema.exclusiveMaximum}`,
        keyword: 'exclusiveMaximum'
      });
    }
  }

  // Array validations
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        path,
        message: `Array must have at least ${schema.minItems} items`,
        keyword: 'minItems'
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array must have at most ${schema.maxItems} items`,
        keyword: 'maxItems'
      });
    }
    if (schema.uniqueItems && new Set(value.map(JSON.stringify)).size !== value.length) {
      errors.push({
        path,
        message: 'Array items must be unique',
        keyword: 'uniqueItems'
      });
    }
    if (schema.items) {
      data = value.map((item, index) => {
        const result = validate(item, schema.items, `${path}[${index}]`);
        errors.push(...result.errors);
        return result.data;
      });
    }
  }

  // Object validations
  if (getType(value) === 'object') {
    // Clone to apply defaults
    data = { ...value };

    // Required properties
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Missing required property: ${key}`,
            keyword: 'required'
          });
        }
      }
    }

    // Property validation
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const propPath = path ? `${path}.${key}` : key;
        const result = validate(value[key], propSchema, propPath);
        errors.push(...result.errors);
        if (result.data !== undefined) {
          data[key] = result.data;
        }
      }
    }

    // Additional properties check
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Unknown property: ${key}`,
            keyword: 'additionalProperties'
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, data };
}

/**
 * Create a reusable validator function from a schema
 * @param {Object} schema - JSON Schema
 * @returns {(value: *) => ValidationResult}
 *
 * @example
 * const validateUser = createValidator({
 *   type: 'object',
 *   required: ['name', 'email'],
 *   properties: {
 *     name: { type: 'string', minLength: 1 },
 *     email: { type: 'string', format: 'email' }
 *   }
 * });
 *
 * const result = validateUser({ name: 'Alice', email: 'alice@example.com' });
 */
export function createValidator(schema) {
  return (value) => validate(value, schema);
}

/**
 * Assert that data is valid, throwing if not
 * @param {*} value - Value to validate
 * @param {Object} schema - JSON Schema
 * @throws {ValidationError} If validation fails
 *
 * @example
 * assertValid({ name: '' }, { type: 'object', properties: { name: { minLength: 1 } } });
 * // Throws: ValidationError: name: String must be at least 1 characters
 */
export function assertValid(value, schema) {
  const result = validate(value, schema);
  if (!result.valid) {
    const error = new Error(
      result.errors.map(e => `${e.path || 'root'}: ${e.message}`).join('; ')
    );
    error.name = 'ValidationError';
    error.errors = result.errors;
    throw error;
  }
  return result.data;
}

/**
 * Check if value is valid (boolean result only)
 * @param {*} value
 * @param {Object} schema
 * @returns {boolean}
 */
export function isValid(value, schema) {
  return validate(value, schema).valid;
}

/**
 * Apply defaults from schema to value
 * @param {*} value
 * @param {Object} schema
 * @returns {*} Value with defaults applied
 */
export function applyDefaults(value, schema) {
  return validate(value, schema).data;
}

/**
 * Common schema builders for convenience
 */
export const Schema = {
  string(options = {}) {
    return { type: 'string', ...options };
  },

  number(options = {}) {
    return { type: 'number', ...options };
  },

  integer(options = {}) {
    return { type: 'integer', ...options };
  },

  boolean(options = {}) {
    return { type: 'boolean', ...options };
  },

  array(items, options = {}) {
    return { type: 'array', items, ...options };
  },

  object(properties, options = {}) {
    return { type: 'object', properties, ...options };
  },

  enum(values, options = {}) {
    return { enum: values, ...options };
  },

  nullable(schema) {
    return { ...schema, type: [schema.type, 'null'] };
  }
};

export default { validate, createValidator, assertValid, isValid, applyDefaults, Schema };
