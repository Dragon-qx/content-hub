/**
 * Typed API client generated from OpenAPI spec.
 *
 * This module provides type-safe wrappers around the API endpoints.
 * Run `pnpm openapi` to regenerate the OpenAPI spec, then
 * `pnpm generate:client` to regenerate these types.
 */

/** Auto-generated from OpenAPI spec — do not edit by hand. */
export interface paths {
  '/api/v1/health': {
    get: {
      responses: {
        200: {
          content: {
            'application/json': {
              code: number;
              message: string;
              data: { status: string; service: string; timestamp: string };
            };
          };
        };
      };
    };
  };
  '/api/v1/auth/register': {
    post: {
      requestBody: {
        content: {
          'application/json': {
            email: string;
            password: string;
            name: string;
          };
        };
      };
      responses: {
        201: {
          content: {
            'application/json': {
              accessToken: string;
              refreshToken: string;
            };
          };
        };
      };
    };
  };
  '/api/v1/auth/login': {
    post: {
      requestBody: {
        content: {
          'application/json': {
            email: string;
            password: string;
          };
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              accessToken: string;
              refreshToken: string;
            };
          };
        };
      };
    };
  };
  '/api/v1/contents': {
    get: {
      parameters: {
        query: {
          skip?: number;
          take?: number;
          status?: string;
          teamId?: string;
          search?: string;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              items: components['schemas']['Content'][];
              total: number;
              skip: number;
              take: number;
            };
          };
        };
      };
    };
    post: {
      requestBody: {
        content: {
          'application/json': {
            title: string;
            body?: string;
            contentType: string;
            tags?: string[];
            teamId: string;
          };
        };
      };
      responses: {
        201: {
          content: {
            'application/json': components['schemas']['Content'];
          };
        };
      };
    };
  };
}

/** Component schemas extracted from OpenAPI spec. */
export interface components {
  schemas: {
    Content: {
      id: string;
      title: string;
      body: string | null;
      contentType: string;
      status: string;
      teamId: string;
      createdBy: string;
      createdAt: string;
      updatedAt: string;
      scheduledAt: string | null;
      publishedAt: string | null;
      version: number;
      tags: { id: string; name: string }[];
    };
    SocialAccount: {
      id: string;
      teamId: string;
      platform: string;
      accountId: string;
      accountName: string;
      accountHandle: string | null;
      status: string;
      followerCount: number | null;
      followingCount: number | null;
      postCount: number | null;
      lastSyncedAt: string | null;
    };
  };
}
