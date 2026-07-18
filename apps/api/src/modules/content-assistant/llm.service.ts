import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  provider: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LlmProvider {
  readonly name: string;
  readonly isAvailable: boolean;
  generate(request: LlmRequest): Promise<LlmResponse>;
}

@Injectable()
export class HeuristicLlmProvider implements LlmProvider {
  readonly name = 'heuristic';
  readonly isAvailable: boolean = true;

  async generate(request: LlmRequest): Promise<LlmResponse> {
    return { text: '', provider: this.name };
  }
}

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'openai';
  readonly isAvailable: boolean = false;
  private readonly logger = new Logger(OpenAiLlmProvider.name);
  private client: any = null;
  private model: string = 'gpt-4o-mini';

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const baseUrl = this.config.get<string>('OPENAI_BASE_URL');
    this.model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set — OpenAI provider disabled');
      return;
    }

    try {
      const OpenAI = require('openai');
      this.client = new OpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
      this.isAvailable = true;
      this.logger.log(`OpenAI client ready (model=${this.model})`);
    } catch (err) {
      this.logger.error(`Failed to initialize OpenAI client: ${err instanceof Error ? err.message : err}`);
    }
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    if (!this.client) return { text: '', provider: this.name };

    try {
      const resp = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      });

      const text = resp.choices?.[0]?.message?.content ?? '';
      return {
        text,
        provider: this.name,
        usage: resp.usage
          ? { promptTokens: resp.usage.prompt_tokens, completionTokens: resp.usage.completion_tokens }
          : undefined,
      };
    } catch (err) {
      this.logger.error(`OpenAI call failed: ${err instanceof Error ? err.message : err}`);
      return { text: '', provider: this.name };
    }
  }
}

@Injectable()
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly isAvailable: boolean = false;
  private readonly logger = new Logger(AnthropicLlmProvider.name);
  private client: any = null;
  private model: string = 'claude-sonnet-4-20250514';

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.model = this.config.get<string>('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514');

    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY not set — Anthropic provider disabled');
      return;
    }

    try {
      const Anthropic = require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey });
      this.isAvailable = true;
      this.logger.log(`Anthropic client ready (model=${this.model})`);
    } catch (err) {
      this.logger.error(`Failed to initialize Anthropic client: ${err instanceof Error ? err.message : err}`);
    }
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    if (!this.client) return { text: '', provider: this.name };

    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 1024,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        temperature: request.temperature ?? 0.7,
      });

      const text = resp.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');

      return {
        text,
        provider: this.name,
        usage: resp.usage
          ? { promptTokens: resp.usage.input_tokens, completionTokens: resp.usage.output_tokens }
          : undefined,
      };
    } catch (err) {
      this.logger.error(`Anthropic call failed: ${err instanceof Error ? err.message : err}`);
      return { text: '', provider: this.name };
    }
  }
}

@Injectable()
export class LlmProviderFactory {
  private readonly logger = new Logger(LlmProviderFactory.name);

  constructor(
    private readonly heuristic: HeuristicLlmProvider,
    private readonly openai: OpenAiLlmProvider,
    private readonly anthropic: AnthropicLlmProvider,
    private readonly config: ConfigService,
  ) {}

  getProvider(): LlmProvider {
    const provider = this.config.get<string>('LLM_PROVIDER', 'heuristic');

    switch (provider) {
      case 'openai':
        return this.openai.isAvailable ? this.openai : this.fallback('openai');
      case 'anthropic':
        return this.anthropic.isAvailable ? this.anthropic : this.fallback('anthropic');
      case 'heuristic':
        return this.heuristic;
      default:
        this.logger.warn(`Unknown LLM_PROVIDER="${provider}", falling back to heuristic`);
        return this.heuristic;
    }
  }

  private fallback(name: string): LlmProvider {
    this.logger.warn(`${name} provider requested but not available — using heuristic fallback`);
    return this.heuristic;
  }
}
