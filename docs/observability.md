# HackingCo Workflow Observability Guide

## Overview

The HackingCo Flow Framework includes enterprise-grade observability powered by Langfuse, providing comprehensive tracing, monitoring, and analytics for workflow executions. This guide covers setup, configuration, and best practices for implementing observability in your workflows.

## Table of Contents

1. [Architecture](#architecture)
2. [Setup and Configuration](#setup-and-configuration)
3. [Core Components](#core-components)
4. [Implementation Guide](#implementation-guide)
5. [Tracing Features](#tracing-features)
6. [Best Practices](#best-practices)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting](#troubleshooting)

## Architecture

### Observability Stack

```
┌─────────────────────────────────────────────────────┐
│                 Workflow Application                 │
├─────────────────────────────────────────────────────┤
│              Traced Workflow Engine                  │
├─────────────────────────────────────────────────────┤
│   Trace Decorators  │  Workflow Tracer  │  Metrics  │
├─────────────────────────────────────────────────────┤
│              Langfuse Client Layer                   │
├─────────────────────────────────────────────────────┤
│                 Langfuse Cloud/Self-Hosted           │
└─────────────────────────────────────────────────────┘
```

### Key Components

1. **Langfuse Client**: Singleton client managing connection and data transmission
2. **Trace Decorators**: Method-level automatic tracing via TypeScript decorators
3. **Workflow Tracer**: Comprehensive workflow execution tracking
4. **Traced Workflow Engine**: Extended engine with built-in observability

## Setup and Configuration

### 1. Installation

```bash
npm install langfuse uuid winston
```

### 2. Environment Configuration

Create a `.env` file based on `.env.example`:

```env
# Langfuse Configuration
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_ENABLED=true
LANGFUSE_RELEASE=1.0.0

# Performance Settings
LANGFUSE_FLUSH_AT=15
LANGFUSE_FLUSH_INTERVAL=10000
LANGFUSE_REQUEST_TIMEOUT=10000
LANGFUSE_MAX_RETRIES=3
```

### 3. Initialize in Your Application

```typescript
import { langfuseClient } from './observability/langfuse-client';
import { TracedWorkflowEngine } from './core/traced-workflow-engine';

// Initialize Langfuse client
await langfuseClient.initialize();

// Create traced workflow engine
const engine = new TracedWorkflowEngine(workflowDefinition);
await engine.initialize();
```

## Core Components

### Langfuse Client

The `LangfuseClient` provides a singleton interface to Langfuse:

```typescript
import { langfuseClient } from './observability/langfuse-client';

// Check if observability is enabled
if (langfuseClient.isEnabled()) {
  const client = langfuseClient.getClient();
  // Use client for manual tracing
}

// Flush traces before shutdown
await langfuseClient.flush();
```

### Trace Decorators

Decorators provide automatic method-level tracing:

```typescript
import { Trace, Span, Observable, Performance } from './observability/trace-decorator';

class WorkflowService {
  @Trace({
    name: 'WorkflowService.processOrder',
    tags: ['order', 'processing'],
    metadata: { service: 'order-service' }
  })
  async processOrder(orderId: string): Promise<Order> {
    // Method automatically traced
    return await this.orderRepository.findById(orderId);
  }

  @Span({ name: 'Database Query' })
  async queryDatabase(query: string): Promise<any> {
    // Nested span within parent trace
    return await this.db.query(query);
  }

  @Performance(1000) // Warn if method takes > 1 second
  async slowOperation(): Promise<void> {
    // Performance tracking
  }

  @Observable('QuickCheck')
  async healthCheck(): Promise<boolean> {
    // Simple observation
    return true;
  }
}
```

### Workflow Tracer

The `WorkflowTracer` provides comprehensive workflow tracking:

```typescript
import { createWorkflowTracer, WorkflowContext } from './observability/workflow-tracer';

const context: WorkflowContext = {
  workflowId: 'wf-123',
  workflowName: 'customer-onboarding',
  version: '1.0.0',
  userId: 'user-456',
  tenantId: 'tenant-789',
  tags: ['production', 'enterprise']
};

const tracer = createWorkflowTracer(context);

// Start workflow
await tracer.startWorkflow({ customerId: 'cust-123' });

// Track tasks
await tracer.startTask({
  taskId: 'task-1',
  taskName: 'Validate Data',
  taskType: 'validation',
  input: data
});

// Track decisions
await tracer.trackDecision('approval-required', 'approved', {
  score: 95,
  threshold: 80
});

// Complete workflow
await tracer.completeWorkflow(result, 'success');
```

### Traced Workflow Engine

The `TracedWorkflowEngine` integrates observability seamlessly:

```typescript
import { createTracedWorkflowEngine } from './core/traced-workflow-engine';

const engine = createTracedWorkflowEngine({
  id: 'order-processing',
  name: 'Order Processing Workflow',
  version: '2.0.0',
  tasks: [
    {
      id: 'validate',
      name: 'Validate Order',
      type: 'validation',
      handler: validateOrder,
      retryPolicy: {
        maxAttempts: 3,
        backoffMultiplier: 2
      }
    }
  ]
});

// Execute with tracing
const result = await engine.execute(orderData, {
  userId: 'user-123',
  tenantId: 'tenant-456',
  environment: 'production',
  tags: ['high-priority'],
  traceEnabled: true
});
```

## Tracing Features

### 1. Workflow Execution Spans

Every workflow execution creates a trace with:
- Start/end timestamps
- Input/output data
- User and session context
- Execution metadata

### 2. Task Performance Metrics

Each task tracks:
- Execution duration
- Success/failure status
- Retry attempts
- Resource usage

### 3. Error Tracking

Comprehensive error capture including:
- Error type and message
- Stack traces
- Context at failure point
- Retry information

### 4. Decision Tracking

Track workflow decisions with:
- Decision points
- Criteria evaluated
- Outcomes
- Business rules applied

### 5. Custom Events

Track business-specific events:

```typescript
await tracer.trackEvent('high-value-order', {
  orderId: 'order-123',
  value: 10000,
  currency: 'USD'
});
```

### 6. Real-time Observability

- Live workflow monitoring
- Performance dashboards
- Alert configuration
- Trace searching and filtering

## Best Practices

### 1. Trace Naming Conventions

```typescript
// Use hierarchical naming
@Trace({ name: 'Service.Module.Method' })

// Include context in names
@Trace({ name: 'OrderService.Validation.ValidatePayment' })
```

### 2. Metadata Standards

```typescript
const metadata = {
  // Always include
  service: 'order-service',
  version: '1.0.0',
  environment: 'production',
  
  // Business context
  customerId: 'cust-123',
  orderId: 'order-456',
  
  // Technical context
  region: 'us-east-1',
  instanceId: 'i-1234567'
};
```

### 3. Sensitive Data Handling

```typescript
// Configure privacy settings
@Trace({
  metadata: {
    userId: hashUserId(userId), // Hash sensitive data
    email: 'user@*****.com'     // Mask PII
  }
})
```

### 4. Sampling Strategies

```typescript
// Adaptive sampling
const shouldTrace = () => {
  if (isError) return true;           // Always trace errors
  if (isSlowRequest) return true;     // Always trace slow requests
  return Math.random() < 0.1;         // 10% sampling for normal requests
};
```

### 5. Context Propagation

```typescript
// Propagate trace context across services
const headers = {
  'x-trace-id': tracer.getTraceId(),
  'x-span-id': tracer.getSpanId(),
  'x-user-id': context.userId
};
```

## Performance Considerations

### 1. Asynchronous Tracing

All tracing operations are asynchronous to minimize impact:

```typescript
// Traces are queued and sent in batches
await tracer.trackEvent('event', data); // Non-blocking
```

### 2. Batching Configuration

```env
LANGFUSE_FLUSH_AT=15        # Flush after 15 events
LANGFUSE_FLUSH_INTERVAL=10000 # Flush every 10 seconds
```

### 3. Memory Management

- Automatic cleanup of completed traces
- Configurable buffer sizes
- Memory usage monitoring

### 4. Network Optimization

- Compression for large payloads
- Retry with exponential backoff
- Circuit breaker for failed endpoints

## Troubleshooting

### Common Issues

#### 1. Traces Not Appearing

```typescript
// Check if client is initialized
console.log('Langfuse enabled:', langfuseClient.isEnabled());
console.log('Config:', langfuseClient.getConfig());

// Force flush
await langfuseClient.flush();
```

#### 2. Performance Impact

```typescript
// Reduce sampling rate
process.env.TRACE_SAMPLING_RATE = '0.01'; // 1% sampling

// Disable in development
process.env.LANGFUSE_ENABLED = 'false';
```

#### 3. Memory Leaks

```typescript
// Ensure cleanup after workflow
try {
  await engine.execute(data);
} finally {
  await engine.cleanup();
}
```

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
LANGFUSE_DEBUG=true
```

### Health Checks

```typescript
// Check Langfuse connectivity
const health = await langfuseClient.healthCheck();
console.log('Langfuse health:', health);
```

## Advanced Usage

### Custom Trace Processors

```typescript
class CustomTraceProcessor {
  async process(trace: Trace): Promise<void> {
    // Add custom processing
    if (trace.metadata.priority === 'high') {
      await this.alertingService.notify(trace);
    }
  }
}
```

### Integration with Other Tools

```typescript
// Export metrics to Prometheus
const metrics = await engine.getMetrics();
prometheusClient.gauge('workflow_duration', metrics.totalDuration);

// Send to DataDog
datadogClient.increment('workflow.completed', 1, [
  `workflow:${context.workflowName}`,
  `status:${result.status}`
]);
```

### Custom Dashboards

Create Langfuse dashboards for:
- Workflow success rates
- Average execution times
- Error patterns
- Resource utilization
- Business metrics

## Security Considerations

### 1. API Key Management

- Store keys in secure vault
- Rotate keys regularly
- Use different keys per environment

### 2. Data Privacy

- Configure field exclusions
- Implement data retention policies
- Ensure GDPR compliance

### 3. Access Control

- Limit Langfuse project access
- Use role-based permissions
- Audit trace access

## Conclusion

The HackingCo workflow observability system provides comprehensive insights into workflow execution while maintaining performance and security. By following these guidelines, you can effectively monitor, debug, and optimize your workflow implementations.

For additional support, contact the HackingCo DevOps team or refer to the [Langfuse documentation](https://langfuse.com/docs).