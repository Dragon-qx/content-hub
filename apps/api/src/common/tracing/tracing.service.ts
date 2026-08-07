import { Injectable, Logger, ExecutionContext } from '@nestjs/common';
import { randomBytes } from 'crypto';

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error';
  error?: string;
  metadata: Record<string, unknown>;
}

/**
 * Distributed tracing service.
 *
 * Provides trace context propagation across requests and logs span data.
 * In production this would integrate with OpenTelemetry/Jaeger/Zipkin.
 */
@Injectable()
export class TracingService {
  private readonly logger = new Logger('Trace');

  /** Generate a new trace ID */
  createTraceId(): string {
    return randomBytes(16).toString('hex');
  }

  /** Generate a new span ID */
  createSpanId(): string {
    return randomBytes(8).toString('hex');
  }

  /**
   * Start a new span. Returns a span object that can be finished later.
   */
  startSpan(operation: string, parentContext?: { traceId: string; spanId: string }): SpanContext {
    const span: SpanContext = {
      traceId: parentContext?.traceId ?? this.createTraceId(),
      spanId: this.createSpanId(),
      parentSpanId: parentContext?.spanId,
      operation,
      startTime: Date.now(),
      status: 'ok',
      metadata: {},
    };
    return span;
  }

  /**
   * Finish a span and log it.
   */
  finishSpan(span: SpanContext, error?: Error): void {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = error ? 'error' : 'ok';
    if (error) span.error = error.message;

    // Log structured span data
    const level = span.status === 'error' ? 'error' : 'log';
    this.logger[level]({
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      operation: span.operation,
      duration: span.duration,
      status: span.status,
      error: span.error,
      ...span.metadata,
    });
  }

  /**
   * Extract trace context from request headers.
   */
  extractFromHeaders(headers: Record<string, string | undefined>): { traceId?: string; spanId?: string } {
    return {
      traceId: headers['x-trace-id'],
      spanId: headers['x-span-id'],
    };
  }

  /**
   * Add trace context to outgoing headers.
   */
  injectHeaders(context: { traceId: string; spanId: string }, headers: Record<string, string>): void {
    headers['x-trace-id'] = context.traceId;
    headers['x-span-id'] = context.spanId;
  }

  /**
   * Create a NestJS execution context wrapper for tracing.
   */
  async trace<T>(operation: string, fn: () => Promise<T>, parentContext?: { traceId: string; spanId: string }): Promise<T> {
    const span = this.startSpan(operation, parentContext);
    try {
      const result = await fn();
      this.finishSpan(span);
      return result;
    } catch (err) {
      this.finishSpan(span, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }
}
