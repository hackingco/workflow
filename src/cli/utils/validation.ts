import Joi from 'joi';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate swarm configuration
 */
export function validateSwarmConfig(config: any): ValidationResult {
  const schema = Joi.object({
    name: Joi.string().required().min(1).max(100),
    type: Joi.string().valid('distributed', 'local', 'hybrid').required(),
    maxAgents: Joi.number().integer().min(1).max(1000).required(),
    strategy: Joi.string().valid('parallel', 'sequential', 'adaptive').required(),
    enableMonitoring: Joi.boolean().optional(),
    metadata: Joi.object().optional()
  });

  const { error } = schema.validate(config);
  
  return {
    valid: !error,
    errors: error ? error.details.map(d => d.message) : []
  };
}

/**
 * Validate agent configuration
 */
export function validateAgentConfig(config: any): ValidationResult {
  const schema = Joi.object({
    name: Joi.string().required().min(1).max(100),
    type: Joi.string().valid('worker', 'coordinator', 'specialist').required(),
    capabilities: Joi.array().items(Joi.string()).optional(),
    swarmId: Joi.string().optional(),
    maxConcurrentTasks: Joi.number().integer().min(1).max(100).optional(),
    metadata: Joi.object().optional()
  });

  const { error } = schema.validate(config);
  
  return {
    valid: !error,
    errors: error ? error.details.map(d => d.message) : []
  };
}

/**
 * Validate task configuration
 */
export function validateTaskConfig(config: any): ValidationResult {
  const schema = Joi.object({
    name: Joi.string().required().min(1).max(200),
    type: Joi.string().required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
    data: Joi.object().optional(),
    dependencies: Joi.array().items(Joi.string()).optional(),
    timeout: Joi.number().integer().min(1000).optional(),
    retries: Joi.number().integer().min(0).max(10).optional(),
    schedule: Joi.string().optional(), // Cron expression
    swarmId: Joi.string().optional(),
    metadata: Joi.object().optional()
  });

  const { error } = schema.validate(config);
  
  return {
    valid: !error,
    errors: error ? error.details.map(d => d.message) : []
  };
}

/**
 * Validate API request configuration
 */
export function validateApiRequestConfig(config: any): ValidationResult {
  const schema = Joi.object({
    url: Joi.string().uri().required(),
    method: Joi.string().valid('GET', 'POST', 'PUT', 'DELETE', 'PATCH').required(),
    headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    body: Joi.any().optional(),
    timeout: Joi.number().integer().min(1000).optional(),
    retries: Joi.number().integer().min(0).max(5).optional()
  });

  const { error } = schema.validate(config);
  
  return {
    valid: !error,
    errors: error ? error.details.map(d => d.message) : []
  };
}

/**
 * Validate batch operation
 */
export function validateBatchOperation(operation: any): ValidationResult {
  const schema = Joi.object({
    operation: Joi.string().valid('create', 'update', 'delete', 'run').required(),
    items: Joi.array().min(1).max(1000).required(),
    options: Joi.object().optional()
  });

  const { error } = schema.validate(operation);
  
  return {
    valid: !error,
    errors: error ? error.details.map(d => d.message) : []
  };
}

/**
 * Validate environment variables
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];

  // Check for required environment variables
  const required = [
    // Add any required env vars here
  ];

  required.forEach(varName => {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  });

  // Validate specific environment variable formats
  if (process.env.SWARM_MAX_AGENTS) {
    const maxAgents = parseInt(process.env.SWARM_MAX_AGENTS);
    if (isNaN(maxAgents) || maxAgents < 1) {
      errors.push('SWARM_MAX_AGENTS must be a positive integer');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate file path
 */
export function validateFilePath(path: string): ValidationResult {
  const errors: string[] = [];

  if (!path) {
    errors.push('File path is required');
  } else if (path.includes('..')) {
    errors.push('File path cannot contain directory traversal');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate cron expression
 */
export function validateCronExpression(expression: string): ValidationResult {
  const cronRegex = /^(\*|([0-9]|[1-5][0-9])|(\*\/[0-9]+)) (\*|([0-9]|[1-5][0-9])|(\*\/[0-9]+)) (\*|([0-9]|1[0-9]|2[0-3])|(\*\/[0-9]+)) (\*|([1-9]|[1-2][0-9]|3[0-1])|(\*\/[0-9]+)) (\*|([1-9]|1[0-2])|(\*\/[0-9]+)) (\*|([0-6])|(\*\/[0-9]+))$/;
  
  const valid = cronRegex.test(expression);
  
  return {
    valid,
    errors: valid ? [] : ['Invalid cron expression']
  };
}

/**
 * Validate JSON string
 */
export function validateJSON(jsonString: string): ValidationResult {
  try {
    JSON.parse(jsonString);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${error.message}`]
    };
  }
}

/**
 * Validate port number
 */
export function validatePort(port: number): ValidationResult {
  const errors: string[] = [];

  if (!Number.isInteger(port)) {
    errors.push('Port must be an integer');
  } else if (port < 1 || port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate URL
 */
export function validateURL(url: string): ValidationResult {
  try {
    new URL(url);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: ['Invalid URL format']
    };
  }
}

/**
 * Validate email
 */
export function validateEmail(email: string): ValidationResult {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid = emailRegex.test(email);
  
  return {
    valid,
    errors: valid ? [] : ['Invalid email format']
  };
}

/**
 * Composite validator
 */
export class Validator {
  private errors: string[] = [];

  validate(value: any, validators: Array<(value: any) => ValidationResult>): this {
    validators.forEach(validator => {
      const result = validator(value);
      if (!result.valid) {
        this.errors.push(...result.errors);
      }
    });
    return this;
  }

  validateIf(condition: boolean, value: any, validators: Array<(value: any) => ValidationResult>): this {
    if (condition) {
      this.validate(value, validators);
    }
    return this;
  }

  addError(error: string): this {
    this.errors.push(error);
    return this;
  }

  getResult(): ValidationResult {
    return {
      valid: this.errors.length === 0,
      errors: [...this.errors]
    };
  }

  reset(): this {
    this.errors = [];
    return this;
  }
}