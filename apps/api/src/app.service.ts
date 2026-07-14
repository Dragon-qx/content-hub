import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      code: 0,
      message: 'success',
      data: {
        status: 'ok',
        service: 'content-hub-api',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
