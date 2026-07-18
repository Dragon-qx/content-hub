import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Platform } from '@content-hub/platform-sdk';
import {
  AccountService,
  BatchImportSummary,
} from './account.service';
import { AuditService } from '../audit/audit.service';
import { AccountController } from './account.controller';
import { AccountTransferService } from './account-transfer.service';

const validSummary = (over: Partial<BatchImportSummary> = {}): BatchImportSummary => ({
  total: 1,
  succeeded: 1,
  failed: 0,
  results: [{ line: 1, status: 'ok' }],
  ...over,
});

describe('AccountController (batch import)', () => {
  let controller: AccountController;
  let accountService: {
    parseImportCsv: jest.Mock;
    batchImport: jest.Mock;
  };

  const user = { userId: 'u1', email: 'a@b.com' } as Parameters<
    AccountController['importCsv']
  >[2];
  const req = { ip: '127.0.0.1' } as { ip?: string };

  beforeEach(async () => {
    accountService = {
      parseImportCsv: jest.fn(),
      batchImport: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [
        { provide: AccountService, useValue: accountService },
        { provide: AccountTransferService, useValue: { initiate: jest.fn(), decide: jest.fn(), cancel: jest.fn(), listForTeam: jest.fn().mockResolvedValue([]) } },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    controller = moduleRef.get(AccountController);
  });

  describe('importCsv', () => {
    it('throws BadRequestException when no file is uploaded', async () => {
      await expect(
        controller.importCsv(undefined, 'team-1', user, req as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when teamId is missing', async () => {
      const file = { buffer: Buffer.from('data') } as unknown as Parameters<
        AccountController['importCsv']
      >[0];
      await expect(
        controller.importCsv(file, undefined, user, req as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the file is larger than 5 MB', async () => {
      const file = { buffer: Buffer.alloc(6 * 1024 * 1024) } as unknown as Parameters<
        AccountController['importCsv']
      >[0];
      await expect(
        controller.importCsv(file, 'team-1', user, req as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('parses the CSV, delegates to batchImport, and returns an audit-wrapped summary', async () => {
      const csv = 'platform,accountId,accountName\nWECHAT_OFFICIAL,wx1,Brand';
      const file = { buffer: Buffer.from(csv) } as unknown as Parameters<
        AccountController['importCsv']
      >[0];

      accountService.parseImportCsv.mockReturnValue({
        rows: [
          {
            platform: 'WECHAT_OFFICIAL',
            accountId: 'wx1',
            accountName: 'Brand',
          },
        ],
        parseErrors: [],
      });
      accountService.batchImport.mockResolvedValue(validSummary());

      const res = await controller.importCsv(file, 'team-1', user, req as any);

      expect(accountService.parseImportCsv).toHaveBeenCalledWith(csv);
      expect(accountService.batchImport).toHaveBeenCalledWith('team-1', [
        { platform: 'WECHAT_OFFICIAL', accountId: 'wx1', accountName: 'Brand' },
      ]);
      expect(res.succeeded).toBe(1);
    });

    it('prepends CSV parse errors to the result set', async () => {
      const csv = 'platform,accountId\nWECHAT_OFFICIAL,wx1\nRAGGED';
      const file = { buffer: Buffer.from(csv) } as unknown as Parameters<
        AccountController['importCsv']
      >[0];

      accountService.parseImportCsv.mockReturnValue({
        rows: [
          { platform: 'WECHAT_OFFICIAL', accountId: 'wx1', accountName: 'Brand' },
        ],
        parseErrors: [{ line: 2, status: 'error', error: 'column count mismatch' }],
      });
      accountService.batchImport.mockResolvedValue(
        validSummary({ failed: 0 }),
      );

      const res = await controller.importCsv(file, 'team-1', user, req as any);

      // the parse error should be prepended (batched results come after)
      expect(res.results[0]).toMatchObject({
        line: 2,
        status: 'error',
        error: 'column count mismatch',
      });
    });
  });

  describe('importJson', () => {
    it('maps records → rows, calls batchImport, and audits', async () => {
      const dto = {
        teamId: 'team-1',
        records: [
          {
            platform: 'WECHAT_OFFICIAL' as Platform,
            accountId: 'wx1',
            accountName: 'Brand',
            credentials: { appid: 'a', secret: 's' },
          },
        ],
      } as Parameters<AccountController['importJson']>[0];
      accountService.batchImport.mockResolvedValue(validSummary());

      const res = await controller.importJson(dto, user as any, req as any);

      expect(accountService.batchImport).toHaveBeenCalledWith('team-1', [
        {
          platform: 'WECHAT_OFFICIAL',
          accountId: 'wx1',
          accountName: 'Brand',
          accountHandle: undefined,
          credentials: { appid: 'a', secret: 's' },
        },
      ]);
      expect(res.succeeded).toBe(1);
    });
  });
});
