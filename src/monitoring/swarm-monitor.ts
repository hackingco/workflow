/**
 * HackingCo Swarm Monitor
 * 
 * Real-time monitoring system for swarm operations with comprehensive
 * metrics collection, alerting, and performance tracking.
 */

import { EventEmitter } from 'events';
import { Langfuse } from 'langfuse';
import {
  MonitoringConfig,
  SwarmMetrics,
  AlertThreshold,
  AlertAction,
  ComparisonOperator,
  LogLevel,
  ResourceUsage
} from '../swarm/types';

interface MetricPoint {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

interface Alert {
  id: string;
  threshold: AlertThreshold;
  value: number;
  timestamp: Date;
  message: string;
  resolved?: boolean;
}

interface MonitorState {
  metrics: Map<string, MetricPoint[]>;
  alerts: Map<string, Alert>;
  lastCheck: Date;
  startTime: Date;
}

interface CustomMetrics {
  peakConcurrency: number;
  avgResponseTime: number;
  errorRate: number;
  throughput: number;
  queueDepth: number;
  [key: string]: number;
}

export class SwarmMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private swarmId: string;
  private langfuse?: Langfuse;
  private state: MonitorState;
  private metricsTimer?: NodeJS.Timer;
  private alertCooldowns: Map<string, number>;
  private metricAggregates: Map<string, number[]>;
  
  constructor(config: {
    swarmId: string;
    config: MonitoringConfig;
    langfuse?: Langfuse;
  }) {
    super();
    this.swarmId = config.swarmId;
    this.config = config.config;
    this.langfuse = config.langfuse;
    
    this.state = {
      metrics: new Map(),
      alerts: new Map(),
      lastCheck: new Date(),
      startTime: new Date()
    };
    
    this.alertCooldowns = new Map();
    this.metricAggregates = new Map();
  }
  
  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.metricsTimer) return;
    
    // Initialize metric collectors
    this.initializeCollectors();
    
    // Start metrics collection
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsInterval);
    
    // Initial collection
    await this.collectMetrics();
    
    this.log(LogLevel.INFO, 'Monitoring started', {
      swarmId: this.swarmId,
      interval: this.config.metricsInterval
    });
    
    this.emit('started');
  }
  
  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
    
    // Export final metrics
    await this.exportMetrics();
    
    this.log(LogLevel.INFO, 'Monitoring stopped', {
      swarmId: this.swarmId,
      duration: Date.now() - this.state.startTime.getTime()
    });
    
    this.emit('stopped');
  }
  
  /**
   * Record a metric
   */
  recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    const point: MetricPoint = {
      name,
      value,
      timestamp: new Date(),
      labels
    };
    
    if (!this.state.metrics.has(name)) {
      this.state.metrics.set(name, []);
    }
    
    const metrics = this.state.metrics.get(name)!;
    metrics.push(point);
    
    // Keep only recent metrics (last hour)
    const cutoff = Date.now() - 3600000;
    this.state.metrics.set(
      name,
      metrics.filter(m => m.timestamp.getTime() > cutoff)
    );
    
    // Update aggregates
    if (!this.metricAggregates.has(name)) {
      this.metricAggregates.set(name, []);
    }
    this.metricAggregates.get(name)!.push(value);
    
    // Check alert thresholds
    this.checkAlerts(name, value);
    
    // Trace metric if enabled
    if (this.config.tracing.enabled && this.langfuse) {
      this.traceMetric(point);
    }
  }
  
  /**
   * Record resource usage
   */
  recordResourceUsage(agentId: string, usage: ResourceUsage): void {
    this.recordMetric('agent_cpu_usage', usage.cpu, { agentId });
    this.recordMetric('agent_memory_usage', usage.memory, { agentId });
    
    if (usage.network) {
      this.recordMetric('agent_network_usage', usage.network, { agentId });
    }
  }
  
  /**
   * Record task metrics
   */
  recordTaskMetrics(taskId: string, metrics: {
    duration: number;
    status: 'completed' | 'failed' | 'timeout';
    retries: number;
  }): void {
    this.recordMetric('task_duration', metrics.duration, { 
      taskId,
      status: metrics.status 
    });
    
    this.recordMetric('task_retries', metrics.retries, { taskId });
    
    if (metrics.status === 'completed') {
      this.recordMetric('tasks_completed', 1);
    } else if (metrics.status === 'failed') {
      this.recordMetric('tasks_failed', 1);
    } else if (metrics.status === 'timeout') {
      this.recordMetric('tasks_timeout', 1);
    }
  }
  
  /**
   * Get current metrics
   */
  async getMetrics(): Promise<{
    peakConcurrency: number;
    custom: CustomMetrics;
  }> {
    const concurrency = this.getMetricValue('active_agents') || 0;
    const peakConcurrency = Math.max(
      this.getMetricMax('active_agents') || 0,
      concurrency
    );
    
    const custom: CustomMetrics = {
      peakConcurrency,
      avgResponseTime: this.getMetricAverage('task_duration') || 0,
      errorRate: this.calculateErrorRate(),
      throughput: this.calculateThroughput(),
      queueDepth: this.getMetricValue('task_queue_size') || 0
    };
    
    // Add all custom metrics
    for (const [name, values] of this.metricAggregates) {
      if (!custom[name]) {
        custom[name] = this.calculateAverage(values);
      }
    }
    
    return { peakConcurrency, custom };
  }
  
  /**
   * Get metric history
   */
  getMetricHistory(name: string, duration?: number): MetricPoint[] {
    const metrics = this.state.metrics.get(name) || [];
    
    if (duration) {
      const cutoff = Date.now() - duration;
      return metrics.filter(m => m.timestamp.getTime() > cutoff);
    }
    
    return metrics;
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.state.alerts.values())
      .filter(alert => !alert.resolved);
  }
  
  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.state.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alert:resolved', alert);
    }
  }
  
  // Private helper methods
  
  private initializeCollectors(): void {
    // System metrics
    this.collectSystemMetrics();
    
    // Custom metric collectors
    this.on('metric:record', (metric: MetricPoint) => {
      this.recordMetric(metric.name, metric.value, metric.labels);
    });
  }
  
  private async collectMetrics(): Promise<void> {
    const now = Date.now();
    
    // Collect system metrics
    this.collectSystemMetrics();
    
    // Process metric aggregations
    this.processAggregations();
    
    // Export metrics if configured
    if (now - this.state.lastCheck.getTime() > 60000) { // Every minute
      await this.exportMetrics();
      this.state.lastCheck = new Date();
    }
    
    this.emit('metrics:collected');
  }
  
  private collectSystemMetrics(): void {
    // Memory usage
    const memUsage = process.memoryUsage();
    this.recordMetric('system_memory_rss', memUsage.rss);
    this.recordMetric('system_memory_heap_used', memUsage.heapUsed);
    this.recordMetric('system_memory_heap_total', memUsage.heapTotal);
    
    // CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    this.recordMetric('system_cpu_user', cpuUsage.user);
    this.recordMetric('system_cpu_system', cpuUsage.system);
    
    // Event loop lag (simplified)
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      this.recordMetric('event_loop_lag', lag);
    });
  }
  
  private checkAlerts(metricName: string, value: number): void {
    for (const threshold of this.config.alertThresholds) {
      if (threshold.metric !== metricName) continue;
      
      // Check if in cooldown
      const cooldownKey = `${threshold.metric}-${threshold.operator}-${threshold.value}`;
      const lastAlert = this.alertCooldowns.get(cooldownKey) || 0;
      if (Date.now() - lastAlert < (threshold.cooldown || 60000)) {
        continue;
      }
      
      // Evaluate threshold
      if (this.evaluateThreshold(value, threshold)) {
        const alert: Alert = {
          id: `alert-${Date.now()}-${Math.random()}`,
          threshold,
          value,
          timestamp: new Date(),
          message: `Metric ${metricName} (${value}) ${threshold.operator} threshold (${threshold.value})`
        };
        
        this.state.alerts.set(alert.id, alert);
        this.alertCooldowns.set(cooldownKey, Date.now());
        
        // Execute alert action
        this.executeAlertAction(alert);
        
        this.emit('alert', alert);
      }
    }
  }
  
  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.operator) {
      case ComparisonOperator.GREATER_THAN:
        return value > threshold.value;
      case ComparisonOperator.LESS_THAN:
        return value < threshold.value;
      case ComparisonOperator.EQUAL:
        return value === threshold.value;
      case ComparisonOperator.NOT_EQUAL:
        return value !== threshold.value;
      case ComparisonOperator.GREATER_EQUAL:
        return value >= threshold.value;
      case ComparisonOperator.LESS_EQUAL:
        return value <= threshold.value;
      default:
        return false;
    }
  }
  
  private executeAlertAction(alert: Alert): void {
    switch (alert.threshold.action) {
      case AlertAction.LOG:
        this.log(LogLevel.WARN, 'Alert triggered', alert);
        break;
        
      case AlertAction.NOTIFY:
        this.emit('notify', alert);
        break;
        
      case AlertAction.SCALE:
        this.emit('scale:request', alert);
        break;
        
      case AlertAction.THROTTLE:
        this.emit('throttle:request', alert);
        break;
        
      case AlertAction.STOP:
        this.emit('stop:request', alert);
        break;
        
      case AlertAction.CUSTOM:
        this.emit('custom:action', alert);
        break;
    }
  }
  
  private processAggregations(): void {
    // Calculate rolling averages
    for (const [name, values] of this.metricAggregates) {
      if (values.length > 1000) {
        // Keep only recent values
        this.metricAggregates.set(name, values.slice(-500));
      }
    }
  }
  
  private async exportMetrics(): Promise<void> {
    const metrics = {
      swarmId: this.swarmId,
      timestamp: new Date(),
      metrics: Object.fromEntries(
        Array.from(this.state.metrics.entries()).map(([name, points]) => [
          name,
          {
            latest: points[points.length - 1]?.value || 0,
            average: this.calculateAverage(points.map(p => p.value)),
            max: Math.max(...points.map(p => p.value)),
            min: Math.min(...points.map(p => p.value)),
            count: points.length
          }
        ])
      ),
      alerts: this.getActiveAlerts()
    };
    
    this.emit('metrics:export', metrics);
    
    // Trace aggregated metrics
    if (this.config.tracing.enabled && this.langfuse) {
      this.langfuse.event({
        name: 'swarm_metrics_export',
        metadata: metrics,
        level: 'INFO'
      });
    }
  }
  
  private traceMetric(metric: MetricPoint): void {
    if (!this.langfuse) return;
    
    this.langfuse.event({
      name: `metric_${metric.name}`,
      metadata: {
        value: metric.value,
        labels: metric.labels
      },
      level: 'DEBUG'
    });
  }
  
  private log(level: LogLevel, message: string, data?: any): void {
    const logEntry = {
      timestamp: new Date(),
      level,
      message,
      swarmId: this.swarmId,
      data
    };
    
    if (this.config.logging.level <= this.getLevelValue(level)) {
      this.emit('log', logEntry);
      
      // Console output
      if (this.config.logging.destinations.some(d => d.type === 'console')) {
        console.log(JSON.stringify(logEntry));
      }
    }
  }
  
  private getLevelValue(level: LogLevel): number {
    const levels = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
      [LogLevel.CRITICAL]: 4
    };
    return levels[level] || 0;
  }
  
  private getMetricValue(name: string): number | null {
    const metrics = this.state.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;
    return metrics[metrics.length - 1].value;
  }
  
  private getMetricAverage(name: string): number | null {
    const metrics = this.state.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;
    return this.calculateAverage(metrics.map(m => m.value));
  }
  
  private getMetricMax(name: string): number | null {
    const metrics = this.state.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;
    return Math.max(...metrics.map(m => m.value));
  }
  
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  private calculateErrorRate(): number {
    const completed = this.getMetricValue('tasks_completed') || 0;
    const failed = this.getMetricValue('tasks_failed') || 0;
    const total = completed + failed;
    
    return total > 0 ? (failed / total) * 100 : 0;
  }
  
  private calculateThroughput(): number {
    const completed = this.state.metrics.get('tasks_completed') || [];
    const recentCompleted = completed.filter(
      m => m.timestamp.getTime() > Date.now() - 60000 // Last minute
    );
    
    return recentCompleted.reduce((sum, m) => sum + m.value, 0);
  }
}