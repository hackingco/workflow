/**
 * Trace Decorators for Method-Level Observability
 * Provides decorators for automatic tracing of class methods
 * 
 * @module observability/trace-decorator
 * @author HackingCo Consulting LLC
 */

import { langfuseClient } from './langfuse-client';
import { LangfuseSpanClient, LangfuseTraceClient } from 'langfuse';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

/**
 * Trace metadata interface
 */
export interface TraceMetadata {
  name?: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  input?: any;
  output?: any;
  level?: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR';
  statusMessage?: string;
  version?: string;
  release?: string;
  public?: boolean;
}

/**
 * Span metadata interface
 */
export interface SpanMetadata {
  name?: string;
  startTime?: Date;
  endTime?: Date;
  input?: any;
  output?: any;
  level?: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR';
  statusMessage?: string;
  metadata?: Record<string, any>;
  version?: string;
}

/**
 * Context manager for trace context propagation
 */
class TraceContext {
  private static storage = new Map<string, LangfuseTraceClient>();
  private static currentTraceId: string | null = null;

  static setTrace(traceId: string, trace: LangfuseTraceClient): void {
    this.storage.set(traceId, trace);
    this.currentTraceId = traceId;
  }

  static getTrace(traceId?: string): LangfuseTraceClient | undefined {
    return this.storage.get(traceId || this.currentTraceId || '');
  }

  static getCurrentTraceId(): string | null {
    return this.currentTraceId;
  }

  static clearTrace(traceId: string): void {
    this.storage.delete(traceId);
    if (this.currentTraceId === traceId) {
      this.currentTraceId = null;
    }
  }
}

/**
 * Base trace decorator for methods
 */
export function Trace(metadata?: TraceMetadata) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const client = langfuseClient.getClient();
      
      if (!client || !langfuseClient.isEnabled()) {
        return originalMethod.apply(this, args);
      }

      const traceId = uuidv4();
      const className = target.constructor.name;
      const methodName = propertyKey;
      const traceName = metadata?.name || `${className}.${methodName}`;

      let trace: LangfuseTraceClient | null = null;
      let result: any;
      const startTime = Date.now();

      try {
        // Create trace
        trace = client.trace({
          id: traceId,
          name: traceName,
          userId: metadata?.userId || getCurrentUserId(),
          sessionId: metadata?.sessionId || getCurrentSessionId(),
          tags: metadata?.tags || [className, methodName],
          metadata: {
            ...metadata?.metadata,
            class: className,
            method: methodName,
            timestamp: new Date().toISOString()
          },
          input: metadata?.input !== undefined ? metadata.input : args,
          release: metadata?.release || process.env.LANGFUSE_RELEASE,
          version: metadata?.version || process.env.APP_VERSION,
          public: metadata?.public || false
        });

        // Store trace in context
        TraceContext.setTrace(traceId, trace);

        // Execute original method
        result = await originalMethod.apply(this, args);

        // Update trace with output
        trace.update({
          output: metadata?.output !== undefined ? metadata.output : result,
          level: 'DEFAULT',
          statusMessage: 'Success'
        });

        return result;
      } catch (error) {
        // Update trace with error
        if (trace) {
          trace.update({
            level: 'ERROR',
            statusMessage: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              ...metadata?.metadata,
              error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
              } : error
            }
          });
        }

        logger.error(`Error in traced method ${traceName}`, error);
        throw error;
      } finally {
        const duration = Date.now() - startTime;
        
        if (trace) {
          trace.update({
            metadata: {
              ...trace.metadata,
              duration
            }
          });
        }

        // Clear trace from context
        TraceContext.clearTrace(traceId);

        logger.debug(`Traced method ${traceName} completed`, {
          traceId,
          duration
        });
      }
    };

    return descriptor;
  };
}

/**
 * Span decorator for nested method tracing
 */
export function Span(metadata?: SpanMetadata) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const client = langfuseClient.getClient();
      
      if (!client || !langfuseClient.isEnabled()) {
        return originalMethod.apply(this, args);
      }

      const className = target.constructor.name;
      const methodName = propertyKey;
      const spanName = metadata?.name || `${className}.${methodName}`;

      // Get parent trace from context
      const parentTrace = TraceContext.getTrace();
      
      if (!parentTrace) {
        // No parent trace, execute without span
        logger.debug(`No parent trace found for span ${spanName}`);
        return originalMethod.apply(this, args);
      }

      let span: LangfuseSpanClient | null = null;
      let result: any;
      const startTime = new Date();

      try {
        // Create span
        span = parentTrace.span({
          name: spanName,
          startTime,
          input: metadata?.input !== undefined ? metadata.input : args,
          metadata: {
            ...metadata?.metadata,
            class: className,
            method: methodName
          },
          level: metadata?.level || 'DEFAULT',
          version: metadata?.version
        });

        // Execute original method
        result = await originalMethod.apply(this, args);

        // End span with output
        span.end({
          endTime: new Date(),
          output: metadata?.output !== undefined ? metadata.output : result,
          level: 'DEFAULT',
          statusMessage: 'Success'
        });

        return result;
      } catch (error) {
        // End span with error
        if (span) {
          span.end({
            endTime: new Date(),
            level: 'ERROR',
            statusMessage: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              ...metadata?.metadata,
              error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
              } : error
            }
          });
        }

        logger.error(`Error in span ${spanName}`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Observable decorator for simple method observation
 */
export function Observable(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const metadata: TraceMetadata = {
      name: name || `${target.constructor.name}.${propertyKey}`,
      tags: ['observable', target.constructor.name, propertyKey]
    };

    return Trace(metadata)(target, propertyKey, descriptor);
  };
}

/**
 * Performance decorator for method performance tracking
 */
export function Performance(thresholdMs: number = 1000) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = performance.now();
      const methodName = `${target.constructor.name}.${propertyKey}`;

      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - startTime;

        if (duration > thresholdMs) {
          logger.warn(`Performance warning: ${methodName} took ${duration.toFixed(2)}ms`, {
            threshold: thresholdMs,
            duration,
            method: methodName
          });
        }

        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        logger.error(`Error in ${methodName} after ${duration.toFixed(2)}ms`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Helper function to get current user ID
 */
function getCurrentUserId(): string | undefined {
  // This should be implemented based on your authentication system
  // For now, returning from environment or undefined
  return process.env.CURRENT_USER_ID;
}

/**
 * Helper function to get current session ID
 */
function getCurrentSessionId(): string | undefined {
  // This should be implemented based on your session management
  // For now, returning from environment or generating new
  return process.env.CURRENT_SESSION_ID || uuidv4();
}

/**
 * Manual trace creation helper
 */
export function createTrace(name: string, metadata?: TraceMetadata): LangfuseTraceClient | null {
  const client = langfuseClient.getClient();
  
  if (!client || !langfuseClient.isEnabled()) {
    return null;
  }

  const traceId = uuidv4();
  const trace = client.trace({
    id: traceId,
    name,
    userId: metadata?.userId || getCurrentUserId(),
    sessionId: metadata?.sessionId || getCurrentSessionId(),
    tags: metadata?.tags,
    metadata: metadata?.metadata,
    input: metadata?.input,
    release: metadata?.release || process.env.LANGFUSE_RELEASE,
    version: metadata?.version || process.env.APP_VERSION,
    public: metadata?.public || false
  });

  TraceContext.setTrace(traceId, trace);
  return trace;
}

/**
 * Export trace context for manual management
 */
export { TraceContext };