# Observability Module

This module provides comprehensive observability for the HackingCo Flow Framework using Langfuse.

## Quick Start

1. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your Langfuse credentials
```

2. **Initialize in your application**:
```typescript
import { initializeObservability } from './observability';

await initializeObservability();
```

3. **Use decorators for automatic tracing**:
```typescript
import { Trace, Span } from './observability';

class MyService {
  @Trace({ name: 'MyService.processData' })
  async processData(data: any) {
    // Automatically traced
  }
}
```

4. **Create traced workflows**:
```typescript
import { createTracedWorkflowEngine } from '../core/traced-workflow-engine';

const engine = createTracedWorkflowEngine(workflowDefinition);
const result = await engine.execute(input, { traceEnabled: true });
```

## Features

- **Automatic method tracing** with decorators
- **Workflow execution tracking** with detailed spans
- **Performance monitoring** and alerts
- **Error tracking** with stack traces
- **Custom event tracking** for business metrics
- **Real-time observability** via Langfuse dashboard

## Components

- `langfuse-client.ts` - Singleton Langfuse client
- `trace-decorator.ts` - TypeScript decorators for tracing
- `workflow-tracer.ts` - Comprehensive workflow tracking
- `../core/traced-workflow-engine.ts` - Extended workflow engine with tracing

## Documentation

See [/docs/observability.md](/docs/observability.md) for complete documentation.