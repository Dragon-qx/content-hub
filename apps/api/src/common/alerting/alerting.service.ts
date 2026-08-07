import { Injectable, Logger } from '@nestjs/common';

export interface AlertRule {
  name: string;
  condition: () => boolean | Promise<boolean>;
  message: string;
  severity: 'warning' | 'critical';
  cooldownMs: number;
  lastTriggered?: number;
}

/**
 * Simple alerting service.
 *
 * Monitors key metrics and triggers alerts when thresholds are breached.
 * In production this would integrate with PagerDuty/OpsGenie/Slack.
 */
@Injectable()
export class AlertingService {
  private readonly logger = new Logger('Alert');
  private rules: AlertRule[] = [];

  constructor() {
    this.registerDefaultRules();
  }

  /** Register an alert rule */
  registerRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  /** Evaluate all alert rules */
  async evaluate(): Promise<void> {
    for (const rule of this.rules) {
      // Check cooldown
      if (rule.lastTriggered && Date.now() - rule.lastTriggered < rule.cooldownMs) {
        continue;
      }

      try {
        const triggered = await rule.condition();
        if (triggered) {
          rule.lastTriggered = Date.now();
          this.fireAlert(rule);
        }
      } catch {
        // Silently skip rules that fail to evaluate
      }
    }
  }

  /** Fire an alert (log it; in production, send to alerting channel) */
  private fireAlert(rule: AlertRule): void {
    const alert = {
      rule: rule.name,
      severity: rule.severity,
      message: rule.message,
      timestamp: new Date().toISOString(),
    };

    if (rule.severity === 'critical') {
      this.logger.error(alert);
    } else {
      this.logger.warn(alert);
    }
  }

  /** Register default alert rules */
  private registerDefaultRules(): void {
    // Error rate alert
    this.registerRule({
      name: 'high_error_rate',
      condition: () => false, // Would check metrics service
      message: 'Error rate exceeded threshold',
      severity: 'critical',
      cooldownMs: 5 * 60 * 1000, // 5 minutes
    });

    // Queue backlog alert
    this.registerRule({
      name: 'queue_backlog',
      condition: () => false, // Would check queue depth
      message: 'Publish queue backlog detected',
      severity: 'warning',
      cooldownMs: 10 * 60 * 1000, // 10 minutes
    });
  }
}
