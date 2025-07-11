/**
 * HackingCo Task Orchestrator
 * 
 * Advanced task orchestration engine that manages task lifecycle, dependencies,
 * retries, and intelligent distribution across the agent swarm.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  TaskStatus,
  TaskResult,
  TaskReport,
  IAgent,
  IStrategy,
  Priority,
  RetryPolicy,
  BackoffStrategy
} from '../swarm/types';

interface TaskOrchestratorConfig {
  strategy: IStrategy;
  retryPolicy?: RetryPolicy;
  timeout?: number;
  maxQueueSize?: number;
  priorityQueueEnabled?: boolean;
}

interface TaskInstance extends Task {
  status: TaskStatus;
  assignedAgent?: string;
  attempts: number;
  results: TaskResult[];
  dependencies: Set<string>;
  dependents: Set<string>;
  startTime?: Date;
  endTime?: Date;
  nextRetryTime?: Date;
}

interface TaskQueue {
  add(task: TaskInstance): void;
  remove(taskId: string): void;
  getNext(): TaskInstance | null;
  size(): number;
  clear(): void;
}

class PriorityTaskQueue implements TaskQueue {
  private queues: Map<Priority, TaskInstance[]>;
  private priorityOrder = [Priority.CRITICAL, Priority.HIGH, Priority.MEDIUM, Priority.LOW];
  
  constructor() {
    this.queues = new Map();
    for (const priority of this.priorityOrder) {
      this.queues.set(priority, []);
    }
  }
  
  add(task: TaskInstance): void {
    const queue = this.queues.get(task.priority);
    if (queue) {
      queue.push(task);
    }
  }
  
  remove(taskId: string): void {
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(t => t.id === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
        break;
      }
    }
  }
  
  getNext(): TaskInstance | null {
    for (const priority of this.priorityOrder) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }
  
  size(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }
  
  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
  }
}

export class TaskOrchestrator extends EventEmitter {
  private config: TaskOrchestratorConfig;
  private tasks: Map<string, TaskInstance>;
  private queue: TaskQueue;
  private agents: Map<string, IAgent>;
  private running: boolean;
  private processTimer?: NodeJS.Timer;
  private dependencyGraph: Map<string, Set<string>>;
  
  constructor(config: TaskOrchestratorConfig) {
    super();
    this.config = {
      maxQueueSize: 10000,
      priorityQueueEnabled: true,
      timeout: 300000, // 5 minutes default
      retryPolicy: {
        maxRetries: 3,
        backoffStrategy: BackoffStrategy.EXPONENTIAL,
        initialDelay: 1000,
        maxDelay: 60000
      },
      ...config
    };
    
    this.tasks = new Map();
    this.queue = this.config.priorityQueueEnabled ? 
      new PriorityTaskQueue() : 
      this.createSimpleQueue();
    this.agents = new Map();
    this.dependencyGraph = new Map();
    this.running = false;
  }
  
  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (this.running) return;
    
    this.running = true;
    
    // Start processing loop
    this.processTimer = setInterval(() => {
      this.processTasks();
    }, 100);
    
    this.emit('started');
  }
  
  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    
    this.running = false;
    
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = undefined;
    }
    
    this.emit('stopped');
  }
  
  /**
   * Pause task processing
   */
  async pause(): Promise<void> {
    this.running = false;
    this.emit('paused');
  }
  
  /**
   * Resume task processing
   */
  async resume(): Promise<void> {
    this.running = true;
    this.emit('resumed');
  }
  
  /**
   * Submit a task for execution
   */
  async submitTask(task: Task): Promise<void> {
    // Check queue size
    if (this.queue.size() >= this.config.maxQueueSize!) {
      throw new Error('Task queue is full');
    }
    
    // Create task instance
    const instance: TaskInstance = {
      ...task,
      id: task.id || `task-${uuidv4()}`,
      status: TaskStatus.PENDING,
      attempts: 0,
      results: [],
      dependencies: new Set(task.requirements?.dependencies || []),
      dependents: new Set()
    };
    
    // Add to task map
    this.tasks.set(instance.id, instance);
    
    // Update dependency graph
    this.updateDependencyGraph(instance);
    
    // Check if task can be queued
    if (this.canQueueTask(instance)) {
      this.queue.add(instance);
      this.emit('task:queued', instance.id);
    } else {
      this.emit('task:waiting', instance.id);
    }
  }
  
  /**
   * Register an agent
   */
  async registerAgent(agent: IAgent): Promise<void> {
    this.agents.set(agent.id, agent);
    this.emit('agent:registered', agent.id);
    
    // Trigger task processing
    if (this.running) {
      setImmediate(() => this.processTasks());
    }
  }
  
  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    this.agents.delete(agentId);
    
    // Reassign tasks from this agent
    const tasksToReassign = Array.from(this.tasks.values())
      .filter(t => t.assignedAgent === agentId && t.status === TaskStatus.RUNNING);
    
    for (const task of tasksToReassign) {
      task.assignedAgent = undefined;
      task.status = TaskStatus.PENDING;
      this.queue.add(task);
    }
    
    this.emit('agent:unregistered', agentId);
  }
  
  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const task = this.tasks.get(taskId);
    return task ? task.status : TaskStatus.CANCELLED;
  }
  
  /**
   * Get task result
   */
  async getTaskResult(taskId: string): Promise<TaskResult | null> {
    const task = this.tasks.get(taskId);
    if (!task || task.results.length === 0) {
      return null;
    }
    return task.results[task.results.length - 1];
  }
  
  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    if (task.status === TaskStatus.RUNNING) {
      // Notify agent to stop
      const agent = this.agents.get(task.assignedAgent!);
      if (agent) {
        // Agent should handle cancellation
        this.emit('task:cancel-requested', taskId, agent.id);
      }
    }
    
    task.status = TaskStatus.CANCELLED;
    this.queue.remove(taskId);
    
    // Cancel dependents
    for (const dependentId of task.dependents) {
      await this.cancelTask(dependentId);
    }
    
    this.emit('task:cancelled', taskId);
  }
  
  /**
   * Get metrics
   */
  async getMetrics(): Promise<any> {
    const statusCounts = new Map<TaskStatus, number>();
    let totalDuration = 0;
    let completedCount = 0;
    
    for (const task of this.tasks.values()) {
      statusCounts.set(task.status, (statusCounts.get(task.status) || 0) + 1);
      
      if (task.status === TaskStatus.COMPLETED && task.startTime && task.endTime) {
        totalDuration += task.endTime.getTime() - task.startTime.getTime();
        completedCount++;
      }
    }
    
    return {
      total: this.tasks.size,
      completed: statusCounts.get(TaskStatus.COMPLETED) || 0,
      failed: statusCounts.get(TaskStatus.FAILED) || 0,
      running: statusCounts.get(TaskStatus.RUNNING) || 0,
      pending: statusCounts.get(TaskStatus.PENDING) || 0,
      avgDuration: completedCount > 0 ? totalDuration / completedCount : 0,
      queueSize: this.queue.size(),
      custom: {
        retriedTasks: Array.from(this.tasks.values()).filter(t => t.attempts > 1).length,
        timedOutTasks: statusCounts.get(TaskStatus.TIMEOUT) || 0
      }
    };
  }
  
  /**
   * Get task reports
   */
  async getTaskReports(): Promise<TaskReport[]> {
    const reports: TaskReport[] = [];
    
    for (const task of this.tasks.values()) {
      if (task.status !== TaskStatus.PENDING) {
        const duration = task.startTime && task.endTime ? 
          task.endTime.getTime() - task.startTime.getTime() : 0;
        
        reports.push({
          taskId: task.id,
          name: task.name,
          status: task.status,
          agentId: task.assignedAgent || '',
          duration,
          retries: task.attempts - 1,
          error: task.results.find(r => r.error)?.error
        });
      }
    }
    
    return reports;
  }
  
  /**
   * Serialize orchestrator state
   */
  async serialize(): Promise<any> {
    const tasks = Array.from(this.tasks.entries()).map(([id, task]) => ({
      id,
      task: {
        ...task,
        dependencies: Array.from(task.dependencies),
        dependents: Array.from(task.dependents)
      }
    }));
    
    return {
      tasks,
      queueSize: this.queue.size(),
      timestamp: new Date()
    };
  }
  
  /**
   * Restore orchestrator state
   */
  async restore(data: any): Promise<void> {
    // Clear current state
    this.tasks.clear();
    this.queue.clear();
    this.dependencyGraph.clear();
    
    // Restore tasks
    for (const item of data.tasks) {
      const task: TaskInstance = {
        ...item.task,
        dependencies: new Set(item.task.dependencies),
        dependents: new Set(item.task.dependents)
      };
      
      this.tasks.set(item.id, task);
      
      // Re-queue pending tasks
      if (task.status === TaskStatus.PENDING) {
        this.queue.add(task);
      }
      
      // Rebuild dependency graph
      this.updateDependencyGraph(task);
    }
  }
  
  // Private helper methods
  
  private async processTasks(): Promise<void> {
    if (!this.running) return;
    
    // Process retries
    await this.processRetries();
    
    // Check for completed dependencies
    await this.checkDependencies();
    
    // Assign tasks to available agents
    await this.assignTasks();
    
    // Check for timeouts
    await this.checkTimeouts();
  }
  
  private async assignTasks(): Promise<void> {
    const availableAgents = Array.from(this.agents.values());
    
    while (this.queue.size() > 0 && availableAgents.length > 0) {
      const task = this.queue.getNext();
      if (!task) break;
      
      // Find suitable agent
      const agent = await this.config.strategy.assignTask(task, availableAgents);
      
      if (agent) {
        await this.assignTaskToAgent(task, agent);
        
        // Remove agent from available list
        const index = availableAgents.indexOf(agent);
        if (index !== -1) {
          availableAgents.splice(index, 1);
        }
      } else {
        // No suitable agent, put task back
        this.queue.add(task);
        break;
      }
    }
  }
  
  private async assignTaskToAgent(task: TaskInstance, agent: IAgent): Promise<void> {
    task.assignedAgent = agent.id;
    task.status = TaskStatus.ASSIGNED;
    task.startTime = new Date();
    task.attempts++;
    
    this.emit('task:assigned', task.id, agent.id);
    
    // Execute task
    this.executeTask(task, agent);
  }
  
  private async executeTask(task: TaskInstance, agent: IAgent): Promise<void> {
    task.status = TaskStatus.RUNNING;
    this.emit('task:started', task.id, agent.id);
    
    try {
      const result = await agent.execute(task);
      
      task.endTime = new Date();
      task.status = result.status;
      task.results.push(result);
      
      if (result.status === TaskStatus.COMPLETED) {
        this.emit('task:completed', result);
        await this.handleTaskCompletion(task);
      } else {
        await this.handleTaskFailure(task, result);
      }
      
    } catch (error) {
      task.endTime = new Date();
      task.status = TaskStatus.FAILED;
      
      const result: TaskResult = {
        taskId: task.id,
        agentId: agent.id,
        status: TaskStatus.FAILED,
        error: error as Error,
        metrics: {
          startTime: task.startTime!,
          endTime: task.endTime,
          duration: task.endTime.getTime() - task.startTime!.getTime(),
          retries: task.attempts - 1,
          resourceUsage: { cpu: 0, memory: 0 }
        },
        timestamp: new Date()
      };
      
      task.results.push(result);
      await this.handleTaskFailure(task, result);
    }
  }
  
  private async handleTaskCompletion(task: TaskInstance): Promise<void> {
    // Update dependents
    for (const dependentId of task.dependents) {
      const dependent = this.tasks.get(dependentId);
      if (dependent) {
        dependent.dependencies.delete(task.id);
        
        if (this.canQueueTask(dependent)) {
          this.queue.add(dependent);
          this.emit('task:unblocked', dependentId);
        }
      }
    }
    
    // Clean up if no longer needed
    if (task.dependents.size === 0) {
      this.tasks.delete(task.id);
    }
  }
  
  private async handleTaskFailure(task: TaskInstance, result: TaskResult): Promise<void> {
    this.emit('task:failed', task.id, result.error);
    
    // Check retry policy
    if (this.shouldRetry(task)) {
      task.status = TaskStatus.PENDING;
      task.assignedAgent = undefined;
      task.nextRetryTime = new Date(Date.now() + this.calculateRetryDelay(task));
      
      this.emit('task:scheduled-retry', task.id, task.nextRetryTime);
    } else {
      // Mark dependents as failed
      for (const dependentId of task.dependents) {
        const dependent = this.tasks.get(dependentId);
        if (dependent && dependent.status === TaskStatus.PENDING) {
          dependent.status = TaskStatus.FAILED;
          this.emit('task:cascade-failed', dependentId);
        }
      }
    }
  }
  
  private shouldRetry(task: TaskInstance): boolean {
    if (!this.config.retryPolicy) return false;
    
    return task.attempts <= this.config.retryPolicy.maxRetries;
  }
  
  private calculateRetryDelay(task: TaskInstance): number {
    const policy = this.config.retryPolicy!;
    const attempt = task.attempts - 1;
    
    let delay: number;
    
    switch (policy.backoffStrategy) {
      case BackoffStrategy.LINEAR:
        delay = policy.initialDelay * attempt;
        break;
        
      case BackoffStrategy.EXPONENTIAL:
        delay = policy.initialDelay * Math.pow(2, attempt - 1);
        break;
        
      case BackoffStrategy.CONSTANT:
      default:
        delay = policy.initialDelay;
    }
    
    return Math.min(delay, policy.maxDelay);
  }
  
  private async processRetries(): Promise<void> {
    const now = Date.now();
    
    for (const task of this.tasks.values()) {
      if (task.status === TaskStatus.PENDING && 
          task.nextRetryTime && 
          task.nextRetryTime.getTime() <= now) {
        
        this.queue.add(task);
        task.nextRetryTime = undefined;
        this.emit('task:retry', task.id);
      }
    }
  }
  
  private async checkDependencies(): Promise<void> {
    for (const task of this.tasks.values()) {
      if (task.status === TaskStatus.PENDING && 
          task.dependencies.size > 0 &&
          this.canQueueTask(task)) {
        
        this.queue.add(task);
        this.emit('task:dependencies-met', task.id);
      }
    }
  }
  
  private async checkTimeouts(): Promise<void> {
    const now = Date.now();
    
    for (const task of this.tasks.values()) {
      if (task.status === TaskStatus.RUNNING && task.startTime) {
        const elapsed = now - task.startTime.getTime();
        
        if (elapsed > this.config.timeout!) {
          task.status = TaskStatus.TIMEOUT;
          task.endTime = new Date();
          
          const result: TaskResult = {
            taskId: task.id,
            agentId: task.assignedAgent!,
            status: TaskStatus.TIMEOUT,
            error: new Error('Task execution timeout'),
            metrics: {
              startTime: task.startTime,
              endTime: task.endTime,
              duration: elapsed,
              retries: task.attempts - 1,
              resourceUsage: { cpu: 0, memory: 0 }
            },
            timestamp: new Date()
          };
          
          task.results.push(result);
          await this.handleTaskFailure(task, result);
          
          this.emit('task:timeout', task.id);
        }
      }
    }
  }
  
  private canQueueTask(task: TaskInstance): boolean {
    // Check if all dependencies are completed
    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId);
      if (!dep || dep.status !== TaskStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }
  
  private updateDependencyGraph(task: TaskInstance): void {
    // Add task to graph
    this.dependencyGraph.set(task.id, task.dependencies);
    
    // Update dependents
    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId);
      if (dep) {
        dep.dependents.add(task.id);
      }
    }
  }
  
  private createSimpleQueue(): TaskQueue {
    const queue: TaskInstance[] = [];
    
    return {
      add(task: TaskInstance): void {
        queue.push(task);
      },
      
      remove(taskId: string): void {
        const index = queue.findIndex(t => t.id === taskId);
        if (index !== -1) {
          queue.splice(index, 1);
        }
      },
      
      getNext(): TaskInstance | null {
        return queue.shift() || null;
      },
      
      size(): number {
        return queue.length;
      },
      
      clear(): void {
        queue.length = 0;
      }
    };
  }
}