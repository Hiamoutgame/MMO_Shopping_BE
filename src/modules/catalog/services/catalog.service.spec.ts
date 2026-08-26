import { BadRequestException } from '@nestjs/common';
import { slugify } from '../../../common/utils/slug';
import { CatalogService } from './catalog.service';

describe('CatalogService pure rules', () => {
  let service: CatalogService;

  beforeEach(() => {
    service = Object.create(CatalogService.prototype) as CatalogService;
  });

  describe('assertPrice', () => {
    it('accepts non-negative decimal string', () => {
      expect(() => service['assertPrice']('100000')).not.toThrow();
      expect(() => service['assertPrice']('99.5000')).not.toThrow();
      expect(() => service['assertPrice']('0')).not.toThrow();
    });

    it('rejects negative or non-decimal', () => {
      expect(() => service['assertPrice']('-1')).toThrow(BadRequestException);
      expect(() => service['assertPrice']('abc')).toThrow(BadRequestException);
      expect(() => service['assertPrice']('1e5')).toThrow(BadRequestException);
    });
  });

  describe('slugify mapping', () => {
    it('normalizes Vietnamese and maps to kebab-case', () => {
      expect(slugify('Thẻ Game Liên Quân')).toBe('the-game-lien-quan');
    });
  });

  describe('assertCategoryParent', () => {
    it('rejects self-parent without touching repository', async () => {
      await expect(
        service['assertCategoryParent']('id-1', 'id-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects descendant as parent (cycle)', async () => {
      (
        service as unknown as {
          categoryRepository: { findOne: () => Promise<unknown> };
        }
      ).categoryRepository = {
        findOne: jest.fn().mockResolvedValue({ id: 'parent-1' }),
      };
      (
        service as unknown as {
          loadDescendantIds: (id: string) => Promise<string[]>;
        }
      ).loadDescendantIds = jest
        .fn()
        .mockResolvedValue(['child-1', 'parent-1']);

      await expect(
        service['assertCategoryParent']('parent-1', 'id-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
