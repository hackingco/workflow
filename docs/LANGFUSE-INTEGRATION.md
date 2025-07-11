# 📊 Langfuse Integration Guide

## Overview

HackingCo's workflow framework includes comprehensive observability through Langfuse, providing real-time insights into swarm operations, workflow executions, and agent behaviors.

## 🚀 Quick Start

### 1. Environment Setup

Create a `.env` file with your Langfuse credentials:

```bash
# Langfuse Configuration
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_HOST=https://cloud.langfuse.com  # or your self-hosted URL
LANGFUSE_ENABLED=true
LANGFUSE_FLUSH_INTERVAL=1000

# Optional: Session tracking
LANGFUSE_SESSION_ID=auto  # auto-generate or provide custom
LANGFUSE_USER_ID=system    # default user ID
```

### 2. Run Traced Workflows

```bash
# Install dependencies
npm install

# Run traced swarm example
npm run example:traced

# Run specific workflow with tracing
LANGFUSE_ENABLED=true npm run workflow:run examples/traced-workflow.yaml

# Check Langfuse connection
npm run observability:check
```

## 📈 What Gets Traced

### Swarm Operations
- **Agent Lifecycle**: Spawning, initialization, task assignment
- **Task Execution**: Input, output, duration, success/failure
- **Consensus Voting**: Topics, options, results, participation
- **Memory Sharing**: Key-value pairs, timestamps, agent sources
- **Performance Metrics**: Execution times, resource usage, success rates

### Workflow Execution
- **Workflow Spans**: Start-to-end execution tracking
- **Task Performance**: Individual task metrics
- **Dependencies**: Task relationships and execution order
- **Errors**: Stack traces, retry attempts, failure reasons
- **User Context**: User ID, session ID, metadata

### Custom Events
- **Business Events**: Client onboarding, project milestones
- **System Events**: Deployments, scaling, configuration changes
- **Performance Events**: SLA violations, optimization opportunities

## 🔧 Implementation Details

### 1. Traced Swarm Class

```typescript
import { LangfuseTracedSwarm } from '@hackingco/swarm';

const swarm = new LangfuseTracedSwarm({
  title: 'Client Project',
  agents: 6,
  phases: ['Discovery', 'Planning', 'Implementation'],
  objectives: {
    primary: 'Deliver client solution'
  }
});

// All operations are automatically traced
const agent = await swarm.spawnAgent('developer', 'agent-001');
const result = await swarm.executeTask('agent-001', task);
```

### 2. Workflow Tracing

```typescript
import { TracedWorkflowEngine } from '@hackingco/workflow';

const engine = new TracedWorkflowEngine({
  langfuseConfig: {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY
  }
});

// Execution is automatically traced
const result = await engine.execute('client-onboarding.yaml');
```

### 3. Custom Decorators

```typescript
import { Trace, Span, Observable } from '@hackingco/observability';

@Observable()
class ClientService {
  @Trace({ name: 'onboard_client' })
  async onboardClient(clientData: ClientData) {
    // Method execution is automatically traced
    return await this.processOnboarding(clientData);
  }

  @Span({ includeArgs: true })
  private async processOnboarding(data: ClientData) {
    // Nested spans for detailed tracking
    return result;
  }
}
```

## 📊 Langfuse Dashboard Views

### 1. Swarm Overview
- Active swarms and their phases
- Agent distribution and workload
- Task completion rates
- Consensus voting patterns

### 2. Performance Metrics
- P50, P90, P99 latencies
- Success/failure rates by task type
- Resource utilization trends
- Cost analysis per operation

### 3. Error Analysis
- Error frequency and patterns
- Stack trace aggregation
- Retry success rates
- Root cause identification

### 4. User Sessions
- Client journey tracking
- Workflow completion rates
- User satisfaction metrics
- Engagement patterns

## 🛡️ Security & Privacy

### Data Sanitization
- Automatic PII removal from traces
- Configurable field masking
- Secure credential handling

### Access Control
- Role-based dashboard access
- API key management
- Audit logging

### Compliance
- GDPR-compliant data handling
- Configurable retention policies
- Export capabilities for audits

## 🔍 Advanced Features

### 1. Custom Scoring

```typescript
// Score task quality
generation.score({
  name: 'task_quality',
  value: 0.95,
  comment: 'High-quality output with all requirements met'
});

// Score client satisfaction
trace.score({
  name: 'client_satisfaction',
  value: 4.8,
  dataType: 'NUMERIC',
  comment: 'Client feedback from post-project survey'
});
```

### 2. A/B Testing

```typescript
// Track different approaches
const variant = Math.random() > 0.5 ? 'A' : 'B';
trace.update({
  metadata: { variant },
  tags: [`variant:${variant}`]
});
```

### 3. Cost Tracking

```typescript
// Track operational costs
span.update({
  metadata: {
    cost: {
      compute: 0.024,
      storage: 0.001,
      network: 0.002,
      total: 0.027
    }
  }
});
```

## 🚨 Troubleshooting

### Connection Issues
```bash
# Test Langfuse connection
npm run observability:check

# Enable debug logging
LANGFUSE_DEBUG=true npm run example:traced
```

### Missing Traces
1. Verify environment variables are set
2. Check network connectivity to Langfuse
3. Ensure `LANGFUSE_ENABLED=true`
4. Review application logs for errors

### Performance Impact
- Langfuse runs asynchronously with minimal overhead
- Batching reduces network calls
- Local buffering prevents data loss
- Configurable flush intervals

## 📚 Resources

- [Langfuse Documentation](https://langfuse.com/docs)
- [HackingCo Observability Standards](./standards/observability.md)
- [Tracing Best Practices](./best-practices/tracing.md)
- [Support Portal](https://support.hackingco.com)

## 🤝 Support

For assistance with Langfuse integration:
- **Email**: observability@hackingco.com
- **Slack**: #observability-support
- **Documentation**: https://docs.hackingco.com/observability

---

*Last Updated: 2025-01-11*  
*Version: 1.0.0*