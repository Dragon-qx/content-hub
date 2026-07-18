import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController', () => {
  let controller: WalletController;
  let service: any;

  beforeEach(async () => {
    service = {
      balance: jest.fn(),
      topUp: jest.fn(),
      debit: jest.fn(),
      listTransactions: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getPrices: jest.fn().mockReturnValue({}),
      setPrices: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [{ provide: WalletService, useValue: service }],
    }).compile();
    controller = module.get(WalletController);
  });

  it('delegates balance lookup to the service', async () => {
    service.balance.mockResolvedValue({ balance: 50 });
    const res = await controller.balance('team-1');
    expect(service.balance).toHaveBeenCalledWith('team-1');
    expect(res.balance).toBe(50);
  });

  it('delegates top-up with team from path', async () => {
    service.topUp.mockResolvedValue({ wallet: { balance: 200 } });
    const res: any = await controller.topUp('team-1', { amount: 200, note: 'seed' } as any);
    expect(service.topUp).toHaveBeenCalledWith('team-1', { amount: 200, note: 'seed' });
    expect(res.wallet.balance).toBe(200);
  });

  it('parses debit type and delegates', async () => {
    service.debit.mockResolvedValue({ wallet: { balance: 90 } });
    const res: any = await controller.debit('team-1', { type: 'PUBLISH', refId: 'j1' } as any);
    expect(service.debit).toHaveBeenCalledWith('team-1', 'PUBLISH', { refId: 'j1', note: undefined });
    expect(res.balance).toBe(90);
  });

  it('returns a zero-charge response for free operations', async () => {
    service.debit.mockResolvedValue(null);
    const res: any = await controller.debit('team-1', { type: 'TOPUP' } as any);
    expect(res.charge).toBe(0);
  });

  it('throws NotFoundException for an unknown transaction type', async () => {
    await expect(
      controller.debit('team-1', { type: 'NOT_A_TYPE' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('passes pagination to listTransactions', async () => {
    await controller.listTransactions('team-1', { skip: 5, take: 10 } as any);
    expect(service.listTransactions).toHaveBeenCalledWith('team-1', { skip: 5, take: 10 });
  });

  it('sets prices through the service', async () => {
    service.setPrices.mockImplementation(() => undefined);
    service.getPrices.mockReturnValue({ PUBLISH: 99 });
    const res: any = await controller.setPrices({ PUBLISH: 99 });
    expect(service.setPrices).toHaveBeenCalledWith({ PUBLISH: 99 });
    expect(res.PUBLISH).toBe(99);
  });
});
