import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Package } from '../entities/package.entity';
import { PackageProduct } from '../entities/package-product.entity';
import { Product } from '../../catalog/entities/product.entity';
import Decimal from 'decimal.js';

export interface CreatePackageDto {
  seasonId?: string;
  name: string;
  slug: string;
  description?: string;
  quantity: number;
  displayPrice: string;
  unitPrice: string;
  applicableRoles: string[];
  sortOrder?: number;
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, any>;
  products: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface UpdatePackageDto {
  name?: string;
  description?: string;
  quantity?: number;
  displayPrice?: string;
  unitPrice?: string;
  applicableRoles?: string[];
  sortOrder?: number;
  isActive?: boolean;
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);

  constructor(
    @InjectRepository(Package)
    private packageRepo: Repository<Package>,
    @InjectRepository(PackageProduct)
    private packageProductRepo: Repository<PackageProduct>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreatePackageDto): Promise<Package> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(Package, {
        where: { slug: dto.slug },
      });

      if (existing) {
        throw new BadRequestException(`Package with slug "${dto.slug}" already exists`);
      }

      const displayPrice = new Decimal(dto.displayPrice);
      const unitPrice = new Decimal(dto.unitPrice);

      if (displayPrice.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Display price must be greater than 0');
      }

      if (unitPrice.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Unit price must be greater than 0');
      }

      if (dto.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than 0');
      }

      if (!dto.applicableRoles || dto.applicableRoles.length === 0) {
        throw new BadRequestException('At least one applicable role is required');
      }

      if (dto.products.length === 0) {
        throw new BadRequestException('At least one product is required');
      }

      const productIds = dto.products.map(p => p.productId);
      const products = await manager.find(Product, {
        where: { id: In(productIds) },
      });

      if (products.length !== productIds.length) {
        throw new BadRequestException('One or more products not found');
      }

      const pkg = manager.create(Package, {
        seasonId: dto.seasonId,
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        quantity: dto.quantity,
        displayPrice: dto.displayPrice,
        unitPrice: dto.unitPrice,
        applicableRoles: dto.applicableRoles,
        sortOrder: dto.sortOrder || 0,
        startDate: dto.startDate,
        endDate: dto.endDate,
        metadata: dto.metadata,
        isActive: true,
      });

      await manager.save(Package, pkg);

      for (const productDto of dto.products) {
        const packageProduct = manager.create(PackageProduct, {
          packageId: pkg.id,
          productId: productDto.productId,
          quantity: productDto.quantity,
        });
        await manager.save(PackageProduct, packageProduct);
      }

      return manager.findOne(Package, {
        where: { id: pkg.id },
      }) as Promise<Package>;
    });
  }

  async findAll(): Promise<Package[]> {
    return this.packageRepo.find({
      relations: { season: true },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async findActive(roleCode?: string): Promise<Package[]> {
    const query = this.packageRepo
      .createQueryBuilder('package')
      .leftJoinAndSelect('package.packageProducts', 'packageProducts')
      .leftJoinAndSelect('packageProducts.product', 'product')
      .leftJoinAndSelect('package.season', 'season')
      .where('package.isActive = :isActive', { isActive: true });

    const now = new Date();
    query.andWhere(
      '(package.startDate IS NULL OR package.startDate <= :now)',
      { now },
    );
    query.andWhere(
      '(package.endDate IS NULL OR package.endDate >= :now)',
      { now },
    );

    if (roleCode) {
      query.andWhere(
        'package.applicableRoles @> :roles',
        { roles: JSON.stringify([roleCode]) },
      );
    }

    return query.orderBy('package.sortOrder', 'ASC').getMany();
  }

  async findById(id: string): Promise<Package> {
    const pkg = await this.packageRepo.findOne({
      where: { id },
      relations: { season: true },
    });

    if (!pkg) {
      throw new NotFoundException(`Package with ID "${id}" not found`);
    }

    return pkg;
  }

  async findBySlug(slug: string): Promise<Package> {
    const pkg = await this.packageRepo.findOne({
      where: { slug },
      relations: { season: true },
    });

    if (!pkg) {
      throw new NotFoundException(`Package with slug "${slug}" not found`);
    }

    return pkg;
  }

  async update(id: string, dto: UpdatePackageDto): Promise<Package> {
    const pkg = await this.findById(id);

    if (dto.displayPrice) {
      const displayPrice = new Decimal(dto.displayPrice);
      if (displayPrice.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Display price must be greater than 0');
      }
    }

    if (dto.unitPrice) {
      const unitPrice = new Decimal(dto.unitPrice);
      if (unitPrice.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Unit price must be greater than 0');
      }
    }

    if (dto.quantity !== undefined && dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    if (dto.applicableRoles && dto.applicableRoles.length === 0) {
      throw new BadRequestException('At least one applicable role is required');
    }

    Object.assign(pkg, dto);
    return this.packageRepo.save(pkg);
  }

  async updateProducts(
    packageId: string,
    products: Array<{ productId: string; quantity: number }>,
  ): Promise<Package> {
    return this.dataSource.transaction(async (manager) => {
      const pkg = await manager.findOne(Package, {
        where: { id: packageId },
      });

      if (!pkg) {
        throw new NotFoundException(`Package with ID "${packageId}" not found`);
      }

      if (products.length === 0) {
        throw new BadRequestException('At least one product is required');
      }

      const productIds = products.map(p => p.productId);
      const foundProducts = await manager.find(Product, {
        where: { id: In(productIds) },
      });

      if (foundProducts.length !== productIds.length) {
        throw new BadRequestException('One or more products not found');
      }

      await manager.delete(PackageProduct, { packageId });

      for (const productDto of products) {
        const packageProduct = manager.create(PackageProduct, {
          packageId,
          productId: productDto.productId,
          quantity: productDto.quantity,
        });
        await manager.save(PackageProduct, packageProduct);
      }

      return manager.findOne(Package, {
        where: { id: packageId },
      }) as Promise<Package>;
    });
  }

  async activate(id: string): Promise<Package> {
    const pkg = await this.findById(id);
    pkg.isActive = true;
    return this.packageRepo.save(pkg);
  }

  async deactivate(id: string): Promise<Package> {
    const pkg = await this.findById(id);
    pkg.isActive = false;
    return this.packageRepo.save(pkg);
  }

  async delete(id: string): Promise<void> {
    const pkg = await this.findById(id);
    await this.packageRepo.softRemove(pkg);
  }
}
