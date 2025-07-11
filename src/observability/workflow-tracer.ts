/**
 * Workflow Tracer for End-to-End Workflow Observability
 * Provides comprehensive tracing for workflow execution
 * 
 * @module observability/workflow-tracer
 * @author HackingCo Consulting LLC
 */

import { langfuseClient } from './langfuse-client';
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  workflowId: string;
  workflowName: string;
  version: string;
  userId?: string;
  sessionId?: string;
  tenantId?: string;
  environment?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Task execution context
 */
export interface TaskContext {
  taskId: string;
  taskName: string;
  taskType: string;
  input?: any;
  output?: any;
  error?: Error;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Workflow execution event types
 */
export enum WorkflowEvent {
  WORKFLOW_STARTED = 'workflow.started',
  WORKFLOW_COMPLETED = 'workflow.completed',
  WORKFLOW_FAILED = 'workflow.failed',
  TASK_STARTED = 'task.started',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  TASK_RETRIED = 'task.retried',
  DECISION_MADE = 'decision.made',
  ERROR_OCCURRED = 'error.occurred',
  PERFORMANCE_WARNING = 'performance.warning'
}

/**
 * Workflow execution metrics
 */
export interface WorkflowMetrics {
  totalDuration: number;
  taskCount: number;
  successfulTasks: number;
  failedTasks: number;
  retryCount: number;
  averageTaskDuration: number;
  peakMemoryUsage?: number;
  cpuUsage?: number;
}

/**
 * Main workflow tracer class
 */
export class WorkflowTracer extends EventEmitter {
  private trace: LangfuseTraceClient | null = null;
  private spans: Map<string, LangfuseSpanClient> = new Map();
  private context: WorkflowContext;
  private metrics: WorkflowMetrics;
  private startTime: number;
  private performanceObserver?: PerformanceObserver;

  constructor(context: WorkflowContext) {
    super();
    this.context = context;
    this.startTime = Date.now();
    this.metrics = {
      totalDuration: 0,
      taskCount: 0,
      successfulTasks: 0,
      failedTasks: 0,
      retryCount: 0,
      averageTaskDuration: 0
    };
    this.setupPerformanceMonitoring();
  }

  /**
   * Start workflow tracing
   */
  public async startWorkflow(input?: any): Promise<void> {
    const client = langfuseClient.getClient();
    
    if (!client || !langfuseClient.isEnabled()) {
      logger.info('Workflow tracing disabled', { workflowId: this.context.workflowId });
      return;
    }

    try {
      this.trace = client.trace({
        id: this.context.workflowId,
        name: this.context.workflowName,
        userId: this.context.userId,
        sessionId: this.context.sessionId || uuidv4(),
        tags: [
          'workflow',
          this.context.workflowName,
          this.context.environment || 'production',
          ...(this.context.tags || [])
        ],
        metadata: {
          version: this.context.version,
          tenantId: this.context.tenantId,
          environment: this.context.environment,
          startTime: new Date().toISOString(),
          ...this.context.metadata
        },
        input,
        release: process.env.LANGFUSE_RELEASE,
        version: this.context.version
      });

      this.emit(WorkflowEvent.WORKFLOW_STARTED, {
        workflowId: this.context.workflowId,
        timestamp: new Date()
      });

      logger.info('Workflow tracing started', {
        workflowId: this.context.workflowId,
        workflowName: this.context.workflowName
      });
    } catch (error) {
      logger.error('Failed to start workflow tracing', error);
      this.emit(WorkflowEvent.ERROR_OCCURRED, error);
    }
  }

  /**
   * Complete workflow tracing
   */
  public async completeWorkflow(output?: any, status: 'success' | 'failed' = 'success'): Promise<void> {
    if (!this.trace) {
      return;
    }

    try {
      this.metrics.totalDuration = Date.now() - this.startTime;
      
      if (this.metrics.taskCount > 0) {
        this.metrics.averageTaskDuration = 
          this.metrics.totalDuration / this.metrics.taskCount;
      }

      this.trace.update({
        output,
        level: status === 'success' ? 'DEFAULT' : 'ERROR',
        statusMessage: status === 'success' ? 'Workflow completed successfully' : 'Workflow failed',
        metadata: {
          ...this.trace.metadata,
          endTime: new Date().toISOString(),
          metrics: this.metrics,
          status
        }
      });

      await langfuseClient.flush();

      this.emit(
        status === 'success' ? WorkflowEvent.WORKFLOW_COMPLETED : WorkflowEvent.WORKFLOW_FAILED,
        {
          workflowId: this.context.workflowId,
          timestamp: new Date(),
          metrics: this.metrics
        }
      );

      logger.info(`Workflow tracing completed`, {
        workflowId: this.context.workflowId,
        status,
        metrics: this.metrics
      });
    } catch (error) {
      logger.error('Failed to complete workflow tracing', error);
      this.emit(WorkflowEvent.ERROR_OCCURRED, error);
    } finally {
      this.cleanup();
    }
  }

  /**
   * Start task execution tracing
   */
  public async startTask(taskContext: TaskContext): Promise<LangfuseSpanClient | null> {
    if (!this.trace) {
      return null;
    }

    try {
      const span = this.trace.span({
        name: taskContext.taskName,
        startTime: taskContext.startTime || new Date(),
        input: taskContext.input,
        metadata: {
          taskId: taskContext.taskId,
          taskType: taskContext.taskType,
          ...taskContext.metadata
        },
        level: 'DEFAULT'
      });

      this.spans.set(taskContext.taskId, span);
      this.metrics.taskCount++;

      this.emit(WorkflowEvent.TASK_STARTED, {
        workflowId: this.context.workflowId,
        taskId: taskContext.taskId,
        taskName: taskContext.taskName,
        timestamp: new Date()
      });

      logger.debug('Task tracing started', {
        workflowId: this.context.workflowId,
        taskId: taskContext.taskId,
        taskName: taskContext.taskName
      });

      return span;
    } catch (error) {
      logger.error('Failed to start task tracing', error);
      this.emit(WorkflowEvent.ERROR_OCCURRED, error);
      return null;
    }
  }

  /**
   * Complete task execution tracing
   */
  public async completeTask(taskContext: TaskContext): Promise<void> {
    const span = this.spans.get(taskContext.taskId);
    
    if (!span) {
      logger.warn('Task span not found', { taskId: taskContext.taskId });
      return;
    }

    try {
      const endTime = taskContext.endTime || new Date();
      const duration = taskContext.duration || 
        (endTime.getTime() - (taskContext.startTime?.getTime() || Date.now()));

      span.end({
        endTime,
        output: taskContext.output,
        level: taskContext.error ? 'ERROR' : 'DEFAULT',
        statusMessage: taskContext.error ? taskContext.error.message : 'Task completed successfully',
        metadata: {
          ...taskContext.metadata,
          duration,
          error: taskContext.error ? {
            name: taskContext.error.name,
            message: taskContext.error.message,
            stack: taskContext.error.stack
          } : undefined
        }
      });

      if (taskContext.error) {
        this.metrics.failedTasks++;
        this.emit(WorkflowEvent.TASK_FAILED, {
          workflowId: this.context.workflowId,
          taskId: taskContext.taskId,
          error: taskContext.error,
          timestamp: new Date()
        });
      } else {
        this.metrics.successfulTasks++;
        this.emit(WorkflowEvent.TASK_COMPLETED, {
          workflowId: this.context.workflowId,
          taskId: taskContext.taskId,
          timestamp: new Date()
        });
      }

      this.spans.delete(taskContext.taskId);

      logger.debug('Task tracing completed', {
        workflowId: this.context.workflowId,
        taskId: taskContext.taskId,
        taskName: taskContext.taskName,
        duration
      });
    } catch (error) {
      logger.error('Failed to complete task tracing', error);
      this.emit(WorkflowEvent.ERROR_OCCURRED, error);
    }
  }

  /**
   * Track task retry
   */
  public async trackRetry(taskId: string, attempt: number, reason: string): Promise<void> {
    if (!this.trace) {
      return;
    }

    try {
      this.metrics.retryCount++;

      this.trace.event({
        name: 'task_retry',
        metadata: {
          taskId,
          attempt,
          reason,
          timestamp: new Date().toISOString()
        },
        level: 'WARNING'
      });

      this.emit(WorkflowEvent.TASK_RETRIED, {
        workflowId: this.context.workflowId,
        taskId,
        attempt,
        reason,
        timestamp: new Date()
      });

      logger.warn('Task retry tracked', {
        workflowId: this.context.workflowId,
        taskId,
        attempt,
        reason
      });
    } catch (error) {
      logger.error('Failed to track retry', error);
    }
  }

  /**
   * Track workflow decision
   */
  public async trackDecision(
    decisionPoint: string,
    decision: string,
    criteria: Record<string, any>
  ): Promise<void> {
    if (!this.trace) {
      return;
    }

    try {
      this.trace.event({
        name: 'workflow_decision',
        metadata: {
          decisionPoint,
          decision,
          criteria,
          timestamp: new Date().toISOString()
        }
      });

      this.emit(WorkflowEvent.DECISION_MADE, {
        workflowId: this.context.workflowId,
        decisionPoint,
        decision,
        criteria,
        timestamp: new Date()
      });

      logger.debug('Decision tracked', {
        workflowId: this.context.workflowId,
        decisionPoint,
        decision
      });
    } catch (error) {
      logger.error('Failed to track decision', error);
    }
  }

  /**
   * Track generation (for LLM-based tasks)
   */
  public async trackGeneration(
    name: string,
    input: any,
    model?: string,
    modelParameters?: Record<string, any>
  ): Promise<LangfuseGenerationClient | null> {
    if (!this.trace) {
      return null;
    }

    try {
      const generation = this.trace.generation({
        name,
        input,
        model,
        modelParameters,
        metadata: {
          workflowId: this.context.workflowId,
          timestamp: new Date().toISOString()
        }
      });

      logger.debug('Generation tracked', {
        workflowId: this.context.workflowId,
        name,
        model
      });

      return generation;
    } catch (error) {
      logger.error('Failed to track generation', error);
      return null;
    }
  }

  /**
   * Track custom event
   */
  public async trackEvent(name: string, metadata: Record<string, any>): Promise<void> {
    if (!this.trace) {
      return;
    }

    try {
      this.trace.event({
        name,
        metadata: {
          ...metadata,
          workflowId: this.context.workflowId,
          timestamp: new Date().toISOString()
        }
      });

      logger.debug('Custom event tracked', {
        workflowId: this.context.workflowId,
        name
      });
    } catch (error) {
      logger.error('Failed to track event', error);
    }
  }

  /**
   * Update workflow context
   */
  public updateContext(updates: Partial<WorkflowContext>): void {
    this.context = {
      ...this.context,
      ...updates
    };

    if (this.trace) {
      this.trace.update({
        metadata: {
          ...this.trace.metadata,
          context: this.context
        }
      });
    }
  }

  /**
   * Get current metrics
   */
  public getMetrics(): WorkflowMetrics {
    return {
      ...this.metrics,
      totalDuration: Date.now() - this.startTime
    };
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 1000) {
              this.emit(WorkflowEvent.PERFORMANCE_WARNING, {
                workflowId: this.context.workflowId,
                name: entry.name,
                duration: entry.duration,
                timestamp: new Date()
              });
            }
          }
        });

        this.performanceObserver.observe({ entryTypes: ['measure'] });
      } catch (error) {
        logger.warn('Performance monitoring setup failed', error);
      }
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.spans.clear();
    this.removeAllListeners();
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
  }
}

/**
 * Factory function to create workflow tracer
 */
export function createWorkflowTracer(context: WorkflowContext): WorkflowTracer {
  return new WorkflowTracer(context);
}