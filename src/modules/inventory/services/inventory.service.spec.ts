import { BadRequestException } from '@nestjs/common';
import { InventoryStatus } from '../enums/inventory-status.enum';
import { InventoryService } from './inventory.service';

describe('InventoryService status transitions', () => {
  it('allows only AVAILABLE -> RESERVED -> SOLD and VOID branches', () => {
    const service = Object.create(
      InventoryService.prototype,
    ) as InventoryService;
    expect(() =>
      service['assertTransition'](
        InventoryStatus.AVAILABLE,
        InventoryStatus.RESERVED,
      ),
    ).not.toThrow();
    expect(() =>
      service['assertTransition'](
        InventoryStatus.RESERVED,
        InventoryStatus.SOLD,
      ),
    ).not.toThrow();
    expect(() =>
      service['assertTransition'](
        InventoryStatus.AVAILABLE,
        InventoryStatus.SOLD,
      ),
    ).toThrow(BadRequestException);
  });
});
