import { Injectable } from '@nestjs/common';

export interface MetricSample {
  timestamp: number;
  [key: string]: number | string;
}

/**
 * In-memory metrics collector.
 *
 * Tracks request counts, error rates, and latency. In production this would
 * be replaced by a proper metrics backend (Prometheus, Datadog, etc.).
 */
@Injectable()
export class MetricsService {
  private counters: Record<string, number> = {};
  private gauges: Record<string, number> = {};
  private histograms: Record<string, number[]> = {};

  /** Increment a counter metric */
  increment(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    this.counters[key] = (this.counters[key] ?? 0) + value;
  }

  /** Set a gauge metric */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    this.gauges[key] = value;
  }

  /** Record a histogram observation (e.g. request duration) */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    if (!this.histograms[key]) this.histograms[key] = [];
    this.histograms[key].push(value);
    // Keep only last 1000 observations to prevent memory growth
    if (this.histograms[key].length > 1000) {
      this.histograms[key] = this.histograms[key].slice(-1000);
    }
  }

  /** Get all metrics as a snapshot */
  getMetrics(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { count: number; avg: number; p50: number; p95: number; p99: number; min: number; max: number }>;
  } {
    const histograms: Record<string, { count: number; avg: number; p50: number; p95: number; p99: number; min: number; max: number }> = {};

    for (const [key, values] of Object.entries(this.histograms)) {
      const sorted = [...values].sort((a, b) => a - b);
      const count = sorted.length;
      const avg = count > 0 ? sorted.reduce((a, b) => a + b, 0) / count : 0;
      histograms[key] = {
        count,
        avg: Math.round(avg * 100) / 100,
        p50: count > 0 ? sorted[Math.floor(count * 0.5)] : 0,
        p95: count > 0 ? sorted[Math.floor(count * 0.95)] : 0,
        p99: count > 0 ? sorted[Math.floor(count * 0.99)] : 0,
        min: count > 0 ? sorted[0] : 0,
        max: count > 0 ? sorted[count - 1] : 0,
      };
    }

    return {
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      histograms,
    };
  }

  /** Reset all metrics (useful for testing) */
  reset(): void {
    this.counters = {};
    this.gauges = {};
    this.histograms = {};
  }

  private formatKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}
