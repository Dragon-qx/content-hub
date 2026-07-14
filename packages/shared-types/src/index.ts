// Shared TypeScript types & constants for ContentHub
// Re-exported across apps/* and packages/*

export const API_VERSION = 'v1' as const;

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export type {
  PlatformAdapter,
  PublishRequest,
  PublishResult,
  MetricsResult,
} from '@content-hub/platform-sdk';
