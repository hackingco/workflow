/**
 * Traced Workflow Engine
 * Extends the base workflow engine with comprehensive observability
 * 
 * @module core/traced-workflow-engine
 * @author HackingCo Consulting LLC
 */

import { WorkflowTracer, WorkflowContext, TaskContext, WorkflowEvent } from '../observability/workflow-tracer';
import { Trace, Span, Observable } from '../observability/trace-decorator';
import { langfuseClient } from '../observability/langfuse-client';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

/**
 * Workflow definition interface
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  tasks: TaskDefinition[];
  metadata?: Record<string, any>;
}

/**
 * Task definition interface
 */
export interface TaskDefinition {
  id: string;
  name: string;
  type: string;
  handler: string | Function;
  config?: Record<string, any>;
  retryPolicy?: RetryPolicy;
  timeout?: number;
  dependencies?: string[];
}

/**
 * Retry policy interface
 */
export interface RetryPolicy {
  maxAttempts: number;
  backoffMultiplier?: number;
  initialInterval?: number;
  maxInterval?: number;
}

/**
 * Workflow execution options
 */
export interface WorkflowExecutionOptions {
  userId?: string;
  sessionId?: string;
  tenantId?: string;
  environment?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  traceEnabled?: boolean;
}

/**
 * Task execution result
 */
export interface TaskResult {
  taskId: string;
  status: 'success' | 'failed' | 'skipped';
  output?: any;
  error?: Error;
  duration: number;
  retryCount?: number;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  workflowId: string;
  status: 'completed' | 'failed' | 'cancelled';
  output?: any;
  error?: Error;
  duration: number;
  tasks: TaskResult[];
  metrics?: Record<string, any>;
}

/**
 * Base workflow engine class (simulated)
 */
class BaseWorkflowEngine extends EventEmitter {
  protected definition: WorkflowDefinition;

  constructor(definition: WorkflowDefinition) {
    super();
    this.definition = definition;
  }

  protected async executeTask(task: TaskDefinition, input: any): Promise<any> {
    // Simulated task execution
    logger.info(`Executing task: ${task.name}`);
    
    if (typeof task.handler === 'function') {
      return await task.handler(input);
    }
    
    // In real implementation, this would resolve and execute the handler
    return { success: true, taskId: task.id };
  }
}

/**
 * Traced workflow engine with full observability
 */
export class TracedWorkflowEngine extends BaseWorkflowEngine {
  private tracer: WorkflowTracer | null = null;
  private executionId: string;
  private options: WorkflowExecutionOptions;
  private taskResults: Map<string, TaskResult> = new Map();
  private startTime: number = 0;

  constructor(definition: WorkflowDefinition) {
    super(definition);
    this.executionId = uuidv4();
    this.options = {};
    this.setupEventHandlers();
  }

  /**
   * Initialize the Langfuse client
   */
  @Observable('WorkflowEngine.initialize')
  public async initialize(): Promise<void> {
    const client = langfuseClient.initialize();
    
    if (client) {
      logger.info('Traced workflow engine initialized with Langfuse observability');
    } else {
      logger.warn('Traced workflow engine initialized without observability (Langfuse disabled)');
    }
  }

  /**
   * Execute the workflow with full tracing
   */
  @Trace({
    name: 'WorkflowEngine.execute',
    tags: ['workflow', 'execution']
  })
  public async execute(input: any, options?: WorkflowExecutionOptions): Promise<WorkflowResult> {
    this.options = options || {};
    this.executionId = uuidv4();
    this.startTime = Date.now();

    // Create workflow context
    const context: WorkflowContext = {
      workflowId: this.executionId,
      workflowName: this.definition.name,
      version: this.definition.version,
      userId: options?.userId,
      sessionId: options?.sessionId,
      tenantId: options?.tenantId,
      environment: options?.environment || process.env.NODE_ENV || 'production',
      tags: options?.tags,
      metadata: {
        ...this.definition.metadata,
        ...options?.metadata
      }
    };

    // Initialize tracer if enabled
    if (options?.traceEnabled !== false && langfuseClient.isEnabled()) {
      this.tracer = new WorkflowTracer(context);
      this.setupTracerEventHandlers();
      await this.tracer.startWorkflow(input);
    }

    try {
      // Execute workflow tasks
      const output = await this.executeWorkflowTasks(input);
      
      // Complete workflow successfully
      const result = this.createWorkflowResult('completed', output);
      
      if (this.tracer) {
        await this.tracer.completeWorkflow(output, 'success');
      }

      this.emit('workflow:completed', result);
      return result;

    } catch (error) {
      // Handle workflow failure
      const result = this.createWorkflowResult('failed', undefined, error as Error);
      
      if (this.tracer) {
        await this.tracer.completeWorkflow(undefined, 'failed');
      }

      this.emit('workflow:failed', result);
      throw error;
    }
  }

  /**
   * Execute all workflow tasks
   */
  @Span({
    name: 'WorkflowEngine.executeWorkflowTasks'
  })
  private async executeWorkflowTasks(input: any): Promise<any> {
    let currentInput = input;
    const executedTasks = new Set<string>();

    for (const task of this.definition.tasks) {
      // Check dependencies
      if (task.dependencies) {
        const unmetDependencies = task.dependencies.filter(
          dep => !executedTasks.has(dep)
        );
        
        if (unmetDependencies.length > 0) {
          throw new Error(
            `Task ${task.id} has unmet dependencies: ${unmetDependencies.join(', ')}`
          );
        }
      }

      // Execute task with tracing
      const taskResult = await this.executeTrackedTask(task, currentInput);
      this.taskResults.set(task.id, taskResult);
      executedTasks.add(task.id);

      if (taskResult.status === 'success') {
        currentInput = taskResult.output || currentInput;
      } else if (taskResult.status === 'failed') {
        throw taskResult.error || new Error(`Task ${task.id} failed`);
      }
    }

    return currentInput;
  }

  /**
   * Execute a single task with tracking
   */
  private async executeTrackedTask(
    task: TaskDefinition,
    input: any
  ): Promise<TaskResult> {
    const startTime = Date.now();
    const taskContext: TaskContext = {
      taskId: task.id,
      taskName: task.name,
      taskType: task.type,
      input,
      startTime: new Date()
    };

    // Start task tracing
    if (this.tracer) {
      await this.tracer.startTask(taskContext);
    }

    let retryCount = 0;
    let lastError: Error | undefined;

    try {
      // Execute with retry logic
      const output = await this.executeWithRetry(
        task,
        input,
        (attempt, error) => {
          retryCount = attempt;
          lastError = error;
          
          if (this.tracer) {
            this.tracer.trackRetry(task.id, attempt, error.message);
          }
        }
      );

      // Complete task successfully
      const result: TaskResult = {
        taskId: task.id,
        status: 'success',
        output,
        duration: Date.now() - startTime,
        retryCount
      };

      if (this.tracer) {
        await this.tracer.completeTask({
          ...taskContext,
          output,
          endTime: new Date(),
          duration: result.duration
        });
      }

      this.emit('task:completed', result);
      return result;

    } catch (error) {
      // Handle task failure
      const result: TaskResult = {
        taskId: task.id,
        status: 'failed',
        error: error as Error,
        duration: Date.now() - startTime,
        retryCount
      };

      if (this.tracer) {
        await this.tracer.completeTask({
          ...taskContext,
          error: error as Error,
          endTime: new Date(),
          duration: result.duration
        });
      }

      this.emit('task:failed', result);
      return result;
    }
  }

  /**
   * Execute task with retry logic
   */
  private async executeWithRetry(
    task: TaskDefinition,
    input: any,
    onRetry: (attempt: number, error: Error) => void
  ): Promise<any> {
    const retryPolicy = task.retryPolicy || {
      maxAttempts: 1,
      backoffMultiplier: 2,
      initialInterval: 1000,
      maxInterval: 30000
    };

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
      try {
        // Set timeout if specified
        if (task.timeout) {
          return await this.executeWithTimeout(task, input, task.timeout);
        } else {
          return await this.executeTask(task, input);
        }
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retryPolicy.maxAttempts) {
          onRetry(attempt, lastError);
          
          // Calculate backoff delay
          const delay = Math.min(
            (retryPolicy.initialInterval || 1000) * 
            Math.pow(retryPolicy.backoffMultiplier || 2, attempt - 1),
            retryPolicy.maxInterval || 30000
          );
          
          await this.delay(delay);
        }
      }
    }

    throw lastError || new Error(`Task ${task.id} failed after ${retryPolicy.maxAttempts} attempts`);
  }

  /**
   * Execute task with timeout
   */
  private async executeWithTimeout(
    task: TaskDefinition,
    input: any,
    timeout: number
  ): Promise<any> {
    return Promise.race([
      this.executeTask(task, input),
      new Promise((_, reject) => 
        setTimeout(
          () => reject(new Error(`Task ${task.id} timed out after ${timeout}ms`)),
          timeout
        )
      )
    ]);
  }

  /**
   * Track workflow decision point
   */
  @Observable('WorkflowEngine.makeDecision')
  public async makeDecision(
    decisionPoint: string,
    criteria: Record<string, any>
  ): Promise<string> {
    // Implement decision logic
    const decision = this.evaluateDecision(criteria);
    
    if (this.tracer) {
      await this.tracer.trackDecision(decisionPoint, decision, criteria);
    }

    return decision;
  }

  /**
   * Evaluate decision criteria
   */
  private evaluateDecision(criteria: Record<string, any>): string {
    // Implement actual decision logic based on criteria
    // This is a simplified example
    if (criteria.condition === true) {
      return 'approve';
    } else {
      return 'reject';
    }
  }

  /**
   * Create workflow result
   */
  private createWorkflowResult(
    status: 'completed' | 'failed' | 'cancelled',
    output?: any,
    error?: Error
  ): WorkflowResult {
    const duration = Date.now() - this.startTime;
    const tasks = Array.from(this.taskResults.values());
    
    const metrics = {
      totalDuration: duration,
      taskCount: tasks.length,
      successfulTasks: tasks.filter(t => t.status === 'success').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      averageTaskDuration: tasks.reduce((sum, t) => sum + t.duration, 0) / tasks.length || 0
    };

    return {
      workflowId: this.executionId,
      status,
      output,
      error,
      duration,
      tasks,
      metrics
    };
  }

  /**
   * Setup internal event handlers
   */
  private setupEventHandlers(): void {
    this.on('error', (error) => {
      logger.error('Workflow engine error', error);
    });
  }

  /**
   * Setup tracer event handlers
   */
  private setupTracerEventHandlers(): void {
    if (!this.tracer) return;

    this.tracer.on(WorkflowEvent.PERFORMANCE_WARNING, (data) => {
      logger.warn('Performance warning', data);
    });

    this.tracer.on(WorkflowEvent.ERROR_OCCURRED, (error) => {
      logger.error('Tracer error', error);
    });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get workflow metrics
   */
  @Observable('WorkflowEngine.getMetrics')
  public getMetrics(): Record<string, any> {
    if (this.tracer) {
      return this.tracer.getMetrics();
    }

    return {
      workflowId: this.executionId,
      duration: Date.now() - this.startTime,
      taskCount: this.taskResults.size
    };
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    this.taskResults.clear();
    this.removeAllListeners();
    
    if (this.tracer) {
      this.tracer.removeAllListeners();
    }

    await langfuseClient.flush();
  }
}

/**
 * Factory function to create traced workflow engine
 */
export function createTracedWorkflowEngine(
  definition: WorkflowDefinition
): TracedWorkflowEngine {
  return new TracedWorkflowEngine(definition);
}