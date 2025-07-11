/**
 * HackingCo Swarm System Type Definitions
 * 
 * Comprehensive type definitions for the swarm coordination system,
 * providing type safety and clear contracts for all swarm operations.
 */

import { EventEmitter } from 'events';

/**
 * Core swarm configuration
 */
export interface SwarmConfig {
  id?: string;
  name: string;
  description?: string;
  agents: AgentConfig[];
  strategy: SwarmStrategy;
  objectives: SwarmObjectives;
  resources: ResourceConfig;
  monitoring: MonitoringConfig;
  persistence: PersistenceConfig;
  scaling: ScalingConfig;
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  id: string;
  type: AgentType;
  name: string;
  capabilities: string[];
  resources: ResourceAllocation;
  priority: Priority;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

/**
 * Agent types
 */
export enum AgentType {
  RESEARCH = 'research',
  ANALYSIS = 'analysis',
  EXECUTION = 'execution',
  VALIDATION = 'validation',
  COORDINATION = 'coordination',
  MONITORING = 'monitoring',
  SPECIALIST = 'specialist'
}

/**
 * Swarm execution strategies
 */
export enum SwarmStrategy {
  PARALLEL = 'parallel',
  SEQUENTIAL = 'sequential',
  PIPELINE = 'pipeline',
  HIERARCHICAL = 'hierarchical',
  CONSENSUS = 'consensus',
  ADAPTIVE = 'adaptive',
  AUTO = 'auto'
}

/**
 * Swarm objectives
 */
export interface SwarmObjectives {
  primary: Objective;
  secondary?: Objective[];
  constraints?: Constraint[];
  successCriteria: SuccessCriteria;
}

/**
 * Individual objective
 */
export interface Objective {
  id: string;
  description: string;
  type: ObjectiveType;
  priority: Priority;
  metrics?: MetricDefinition[];
  deadline?: Date;
}

/**
 * Objective types
 */
export enum ObjectiveType {
  PERFORMANCE = 'performance',
  QUALITY = 'quality',
  COST = 'cost',
  TIME = 'time',
  CUSTOM = 'custom'
}

/**
 * Priority levels
 */
export enum Priority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

/**
 * Resource configuration
 */
export interface ResourceConfig {
  maxConcurrency: number;
  memoryLimit: number;
  cpuLimit: number;
  networkBandwidth?: number;
  customLimits?: Record<string, number>;
}

/**
 * Resource allocation for individual agents
 */
export interface ResourceAllocation {
  memory: number;
  cpu: number;
  priority: number;
  customResources?: Record<string, number>;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  enabled: boolean;
  metricsInterval: number;
  alertThresholds: AlertThreshold[];
  tracing: TracingConfig;
  logging: LoggingConfig;
}

/**
 * Alert threshold definition
 */
export interface AlertThreshold {
  metric: string;
  operator: ComparisonOperator;
  value: number;
  action: AlertAction;
  cooldown?: number;
}

/**
 * Comparison operators
 */
export enum ComparisonOperator {
  GREATER_THAN = '>',
  LESS_THAN = '<',
  EQUAL = '=',
  NOT_EQUAL = '!=',
  GREATER_EQUAL = '>=',
  LESS_EQUAL = '<='
}

/**
 * Alert actions
 */
export enum AlertAction {
  LOG = 'log',
  NOTIFY = 'notify',
  SCALE = 'scale',
  THROTTLE = 'throttle',
  STOP = 'stop',
  CUSTOM = 'custom'
}

/**
 * Tracing configuration
 */
export interface TracingConfig {
  enabled: boolean;
  provider: TracingProvider;
  samplingRate: number;
  exportEndpoint?: string;
}

/**
 * Tracing providers
 */
export enum TracingProvider {
  LANGFUSE = 'langfuse',
  OPENTELEMETRY = 'opentelemetry',
  JAEGER = 'jaeger',
  CUSTOM = 'custom'
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: LogLevel;
  format: LogFormat;
  destinations: LogDestination[];
}

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Log formats
 */
export enum LogFormat {
  JSON = 'json',
  TEXT = 'text',
  STRUCTURED = 'structured'
}

/**
 * Log destinations
 */
export interface LogDestination {
  type: 'console' | 'file' | 'remote';
  config: Record<string, any>;
}

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  enabled: boolean;
  provider: PersistenceProvider;
  checkpointInterval: number;
  retentionDays: number;
  encryptionKey?: string;
}

/**
 * Persistence providers
 */
export enum PersistenceProvider {
  MEMORY = 'memory',
  FILE = 'file',
  REDIS = 'redis',
  DATABASE = 'database',
  S3 = 's3'
}

/**
 * Scaling configuration
 */
export interface ScalingConfig {
  enabled: boolean;
  minAgents: number;
  maxAgents: number;
  scalingMetric: string;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownPeriod: number;
}

/**
 * Retry policy
 */
export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: BackoffStrategy;
  initialDelay: number;
  maxDelay: number;
  retryableErrors?: string[];
}

/**
 * Backoff strategies
 */
export enum BackoffStrategy {
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
  CONSTANT = 'constant',
  CUSTOM = 'custom'
}

/**
 * Swarm lifecycle state
 */
export enum SwarmState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  RUNNING = 'running',
  PAUSED = 'paused',
  SCALING = 'scaling',
  COMPLETING = 'completing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated'
}

/**
 * Agent lifecycle state
 */
export enum AgentState {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  READY = 'ready',
  BUSY = 'busy',
  IDLE = 'idle',
  ERROR = 'error',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated'
}

/**
 * Task definition
 */
export interface Task {
  id: string;
  name: string;
  type: TaskType;
  input: any;
  requirements?: TaskRequirements;
  priority: Priority;
  deadline?: Date;
  retryCount?: number;
  metadata?: Record<string, any>;
}

/**
 * Task types
 */
export enum TaskType {
  PROCESS = 'process',
  ANALYZE = 'analyze',
  TRANSFORM = 'transform',
  VALIDATE = 'validate',
  AGGREGATE = 'aggregate',
  CUSTOM = 'custom'
}

/**
 * Task requirements
 */
export interface TaskRequirements {
  capabilities?: string[];
  resources?: ResourceAllocation;
  dependencies?: string[];
  constraints?: Constraint[];
}

/**
 * Constraint definition
 */
export interface Constraint {
  type: ConstraintType;
  value: any;
  description?: string;
}

/**
 * Constraint types
 */
export enum ConstraintType {
  TIME = 'time',
  RESOURCE = 'resource',
  DEPENDENCY = 'dependency',
  CUSTOM = 'custom'
}

/**
 * Task result
 */
export interface TaskResult {
  taskId: string;
  agentId: string;
  status: TaskStatus;
  output?: any;
  error?: Error;
  metrics: TaskMetrics;
  timestamp: Date;
}

/**
 * Task status
 */
export enum TaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled'
}

/**
 * Task metrics
 */
export interface TaskMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  retries: number;
  resourceUsage: ResourceUsage;
  customMetrics?: Record<string, number>;
}

/**
 * Resource usage metrics
 */
export interface ResourceUsage {
  cpu: number;
  memory: number;
  network?: number;
  custom?: Record<string, number>;
}

/**
 * Success criteria
 */
export interface SuccessCriteria {
  minSuccessRate: number;
  maxFailures: number;
  requiredCapabilities?: string[];
  customCriteria?: CustomCriterion[];
}

/**
 * Custom success criterion
 */
export interface CustomCriterion {
  name: string;
  evaluate: (results: TaskResult[]) => boolean;
  weight?: number;
}

/**
 * Metric definition
 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  unit?: string;
  aggregation?: AggregationType;
}

/**
 * Metric types
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

/**
 * Aggregation types
 */
export enum AggregationType {
  SUM = 'sum',
  AVERAGE = 'average',
  MIN = 'min',
  MAX = 'max',
  COUNT = 'count',
  PERCENTILE = 'percentile'
}

/**
 * Swarm event
 */
export interface SwarmEvent {
  type: SwarmEventType;
  timestamp: Date;
  source: string;
  data: any;
  metadata?: Record<string, any>;
}

/**
 * Swarm event types
 */
export enum SwarmEventType {
  SWARM_STARTED = 'swarm.started',
  SWARM_COMPLETED = 'swarm.completed',
  SWARM_FAILED = 'swarm.failed',
  AGENT_SPAWNED = 'agent.spawned',
  AGENT_READY = 'agent.ready',
  AGENT_FAILED = 'agent.failed',
  AGENT_TERMINATED = 'agent.terminated',
  TASK_ASSIGNED = 'task.assigned',
  TASK_STARTED = 'task.started',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  SCALE_UP = 'scale.up',
  SCALE_DOWN = 'scale.down',
  CHECKPOINT_SAVED = 'checkpoint.saved',
  ALERT_TRIGGERED = 'alert.triggered',
  CUSTOM = 'custom'
}

/**
 * Swarm report
 */
export interface SwarmReport {
  swarmId: string;
  name: string;
  state: SwarmState;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  agents: AgentReport[];
  tasks: TaskReport[];
  metrics: SwarmMetrics;
  events: SwarmEvent[];
  errors?: Error[];
}

/**
 * Agent report
 */
export interface AgentReport {
  agentId: string;
  type: AgentType;
  state: AgentState;
  tasksCompleted: number;
  tasksFailed: number;
  avgTaskDuration: number;
  resourceUsage: ResourceUsage;
  errors?: Error[];
}

/**
 * Task report
 */
export interface TaskReport {
  taskId: string;
  name: string;
  status: TaskStatus;
  agentId: string;
  duration: number;
  retries: number;
  error?: Error;
}

/**
 * Swarm metrics
 */
export interface SwarmMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  successRate: number;
  avgTaskDuration: number;
  totalDuration: number;
  peakConcurrency: number;
  totalResourceUsage: ResourceUsage;
  customMetrics?: Record<string, any>;
}

/**
 * Memory store interface
 */
export interface MemoryStore {
  set(key: string, value: any, ttl?: number): Promise<void>;
  get(key: string): Promise<any>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  size(): Promise<number>;
}

/**
 * Swarm coordinator interface
 */
export interface ISwarmCoordinator extends EventEmitter {
  readonly id: string;
  readonly state: SwarmState;
  
  initialize(config: SwarmConfig): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  
  submitTask(task: Task): Promise<string>;
  getTaskStatus(taskId: string): Promise<TaskStatus>;
  getTaskResult(taskId: string): Promise<TaskResult | null>;
  
  scaleUp(count: number): Promise<void>;
  scaleDown(count: number): Promise<void>;
  
  getReport(): Promise<SwarmReport>;
  getMetrics(): Promise<SwarmMetrics>;
  
  checkpoint(): Promise<void>;
  restore(checkpointId: string): Promise<void>;
}

/**
 * Agent interface
 */
export interface IAgent extends EventEmitter {
  readonly id: string;
  readonly type: AgentType;
  readonly state: AgentState;
  readonly capabilities: string[];
  
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  
  canExecute(task: Task): boolean;
  execute(task: Task): Promise<TaskResult>;
  
  getMetrics(): Promise<AgentReport>;
  healthCheck(): Promise<boolean>;
}

/**
 * Strategy interface
 */
export interface IStrategy {
  readonly name: string;
  
  assignTask(task: Task, agents: IAgent[]): Promise<IAgent | null>;
  rebalance(agents: IAgent[], tasks: Task[]): Promise<Map<string, string>>;
  shouldScale(metrics: SwarmMetrics): ScaleDecision;
}

/**
 * Scale decision
 */
export interface ScaleDecision {
  action: ScaleAction;
  count: number;
  reason: string;
}

/**
 * Scale actions
 */
export enum ScaleAction {
  NONE = 'none',
  UP = 'up',
  DOWN = 'down'
}