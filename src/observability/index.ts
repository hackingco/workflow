/**
 * Observability Module Exports
 * Central export point for all observability components
 * 
 * @module observability
 * @author HackingCo Consulting LLC
 */

// Client exports
export { 
  LangfuseClient, 
  langfuseClient,
  type LangfuseConfig 
} from './langfuse-client';

// Decorator exports
export { 
  Trace,
  Span,
  Observable,
  Performance,
  createTrace,
  TraceContext,
  type TraceMetadata,
  type SpanMetadata
} from './trace-decorator';

// Workflow tracer exports
export {
  WorkflowTracer,
  createWorkflowTracer,
  WorkflowEvent,
  type WorkflowContext,
  type TaskContext,
  type WorkflowMetrics
} from './workflow-tracer';

// Re-export Langfuse types for convenience
export type {
  LangfuseTraceClient,
  LangfuseSpanClient,
  LangfuseGenerationClient,
  LangfuseEventClient
} from 'langfuse';

/**
 * Initialize observability for the application
 */
export async function initializeObservability(): Promise<void> {
  const client = langfuseClient.initialize();
  
  if (client) {
    console.log('Observability initialized successfully');
  } else {
    console.warn('Observability disabled or initialization failed');
  }
}

/**
 * Shutdown observability gracefully
 */
export async function shutdownObservability(): Promise<void> {
  await langfuseClient.shutdown();
}

/**
 * Check if observability is enabled
 */
export function isObservabilityEnabled(): boolean {
  return langfuseClient.isEnabled();
}

/**
 * Flush all pending traces
 */
export async function flushTraces(): Promise<void> {
  await langfuseClient.flush();
}