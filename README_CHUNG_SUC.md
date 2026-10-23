# MMO Shopping - CHUNG SỨC System

> **Tài liệu lịch sử — 23/10/2026:** Phần role SELLER, seller code, hoa hồng, tài khoản demo và danh sách API bên dưới không phải hợp đồng đích hoặc bằng chứng đã kiểm thử. Đọc [nghiệp vụ shop một chủ](../docs/business/single-owner-shop.md), [API](../docs/api/single-owner-shop.md), [plan](../docs/plan/single-owner-shop.md), [rule](../docs/rule/business.md). Chủ shop dùng `ADMIN`, khách dùng `USER`; giữ dịch vụ tiếp sức mã mời game nhưng ngừng seller nội bộ theo kế hoạch. Chưa đổi code/DB trong đợt sửa docs.

Complete e-commerce platform với hệ thống **CHUNG SỨC** (tiếp sức mã mời) - khách gửi mã mời trong game, tài khoản của Shop nhập mã đó để khách đủ lượt mời.

## 🎯 Tính Năng Chính

### 1. **CHUNG SỨC Campaign** (Tiếp sức mã mời)
- Mỗi campaign là một sự kiện game; target quantity là số tài khoản hỗ trợ tối đa cho mỗi mã mời
- Khách gửi mã mời + số tài khoản hỗ trợ, yêu cầu chờ ở trạng thái `PENDING`
- Mã mời lưu dạng hash + mã hóa; một mã chỉ có một yêu cầu đang mở trong mỗi campaign
- Đơn giá chụp từ Price Engine lúc gửi; chưa gọi tool và chưa trừ ví (đợt sau)

### 2. **Price Engine** (Core Business Logic)
Sequential discount pipeline:
```
Base Price → Role Pricing → Quantity Tier → Seasonal → Package → Seller → Coupon → Floor
```
- ✅ Sequential (NOT additive)
- ✅ Server-side only
- ✅ Decimal.js for accuracy
- ✅ Price floor enforcement
- ✅ Detailed breakdown

### 3. **Three-Tier Role System**
- **USER**: Regular customers
- **SELLER**: Referral codes, commission tracking
- **ADMIN**: Full system management

### 4. **Season/Event Management**
- Lifecycle: DRAFT → UPCOMING → ACTIVE → PAUSED → ENDED → ARCHIVED
- Auto-scheduling support
- Season-specific pricing

### 5. **Package System** (Bundles)
- Pre-configured product bundles
- Role-based package availability
- Better unit pricing for packages

### 6. **Advanced Coupon System**
- Product/Season/Package restrictions
- Usage limits (global + per-user)
- Stackable/priority rules
- Atomic usage tracking (race condition safe)

### 7. **Purchase & Cost Management**
- Batch tracking with supplier info
- Volume-based cost tiers
- Average cost calculation

### 8. **Analytics & Testing**
- Per-order profit tracking
- Test campaigns before scaling
- ROI analysis
- Break-even calculation

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Database
```bash
# Start PostgreSQL (choose one):
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=MyStrongPassword123@ postgres
# OR
net start postgresql-x64-16  # Windows Service

# Create database
psql -U postgres -c "CREATE DATABASE MMO;"
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 4. Run Migrations
```bash
npm run typeorm:migration:run
```

### 5. Seed Demo Data
```bash
npm run seed:chung-suc
```

This creates:
- ✅ 3 Demo accounts (User, Seller, Admin)
- ✅ 5 Products with pricing tiers
- ✅ 1 Active season (Tết 2024)
- ✅ 1 CHUNG SỨC campaign
- ✅ 3 Packages (Starter, Pro, Premium)
- ✅ 2 Vouchers
- ✅ Seller with referral code

### 6. Start Development Server
```bash
npm run start:dev
```

API: http://localhost:3000/api  
Swagger: http://localhost:3000/api/docs

## 📚 API Documentation

### Demo Accounts
```
User:   user@demo.com / Demo@123456
Seller: seller@demo.com / Demo@123456
Admin:  admin@mmo-shopping.local / Admin@123456
```

### Key Endpoints

#### Authentication
```
POST /api/auth/login
POST /api/auth/register
```

#### Price Calculation (Core Feature)
```
POST /api/pricing/calculate
Body: {
  "productId": "uuid",
  "accountId": "uuid",
  "quantity": 10,
  "seasonId": "uuid",
  "packageId": "uuid",
  "sellerCode": "DEMOSELLER2024",
  "couponCode": "TET2024"
}
```

#### CHUNG SỨC Campaigns
```
GET   /api/v1/campaigns
GET   /api/v1/campaigns/active
GET   /api/v1/campaigns/:id
POST  /api/v1/campaigns               (Admin only)
PATCH /api/v1/campaigns/:id           (Admin only)
POST  /api/v1/campaigns/:id/activate  (Admin only; also pause, end, close)
POST  /api/v1/campaigns/:id/join      (logged-in user)
```

#### Seasons
```
GET  /api/seasons
GET  /api/seasons/active
POST /api/seasons                    (Admin only)
PUT  /api/seasons/:id/activate       (Admin only)
```

#### Packages
```
GET  /api/packages
GET  /api/packages/season/:seasonId
POST /api/packages                   (Admin only)
```

#### Sellers
```
GET  /api/sellers/profile/:accountId
POST /api/sellers/referral-codes     (Seller only)
POST /api/sellers/track-click
```

#### Coupons
```
POST /api/coupons/validate
GET  /api/coupons/stats/:voucherId   (Admin only)
```

Full documentation: http://localhost:3000/api/docs

## 🧪 Testing

Run tests:
```bash
npm test
```

Run specific test suite:
```bash
npm test -- price-engine.service.spec
```

Coverage:
```bash
npm run test:cov
```

## 📦 Project Structure

```
src/
├── modules/
│   ├── seasons/              # Season management
│   ├── chung-suc/           # Group buying campaigns
│   ├── pricing/             # 🔥 Price engine (CORE)
│   ├── packages/            # Product bundles
│   ├── sellers/             # Seller profiles & referrals
│   ├── coupons/             # Coupon validation
│   ├── purchase/            # Purchase batches & costs
│   ├── analytics/           # Profit tracking & testing
│   ├── catalog/             # Products (existing)
│   ├── commerce/            # Orders (existing)
│   └── identity/            # Auth & accounts (existing)
├── database/
│   ├── migrations/          # TypeORM migrations
│   └── seeds/              # Demo data seeder
├── common/
│   ├── dto/                # Validation DTOs
│   ├── guards/             # RolesGuard
│   ├── decorators/         # @AdminOnly, @CurrentUser
│   ├── filters/            # Exception handlers
│   └── interceptors/       # Logging
└── test/                   # Unit tests
```

## 🔒 Security Features

- ✅ JWT authentication
- ✅ Role-based access control (RBAC)
- ✅ Server-side price calculation ONLY
- ✅ No hardcoded prices in code
- ✅ Atomic transactions for orders
- ✅ Race condition prevention (coupons, inventory)
- ✅ Input validation (class-validator)
- ✅ SQL injection protection (TypeORM)

## 💰 Price Calculation Example

```typescript
// Base: 50,000 VND
// USER → SELLER role: -20% = 40,000 VND
// Quantity 10+: -5,000 = 35,000 VND
// Seasonal 10%: -3,500 = 31,500 VND
// Coupon 5%: -1,575 = 29,925 VND
// Floor: 30,000 VND ✅ (enforced)

Final Price: 30,000 VND
```

**CRITICAL**: Discounts apply SEQUENTIALLY, not additively!

## 🛠️ Development Scripts

```bash
npm run start:dev          # Dev server with hot reload
npm run build             # Production build
npm run start:prod        # Production server
npm run lint              # ESLint
npm run lint:fix          # Auto-fix lint issues
npm run format            # Prettier
npm run typeorm:migration:generate  # Generate migration
npm run typeorm:migration:run       # Run migrations
npm run typeorm:migration:revert    # Rollback last migration
npm run seed:chung-suc     # Seed CHUNG SỨC data
```

## 📊 Database Schema

**New Tables (21):**
- seasons
- chung_suc_campaigns
- chung_suc_participants
- price_tiers
- price_rules
- packages
- package_products
- seller_profiles
- seller_referral_codes
- referral_clicks
- coupon_usage
- coupon_products
- coupon_seasons
- coupon_packages
- purchase_batches
- cost_tiers
- profit_records
- product_test_campaigns

**Extended Tables:**
- products (+ seasonId, minimumSellingPrice)
- orders (+ seasonId, campaignId, sellerId, packageId)
- vouchers (+ stackable, priority, applicableRoles, usagePerUser)

## 🎨 Frontend (To Be Built)

Planned features:
- User dashboard (browse campaigns, packages)
- Seller dashboard (referral stats, commission)
- Admin panel (campaign management, analytics)
- Real-time CHUNG SỨC progress
- Price breakdown visualization

Tech stack: React + Vite + TypeScript

## 📝 License

UNLICENSED - Private project

## 👥 Contributors

Built with ❤️ for MMO Shopping platform

---

**Need Help?**
- API Docs: http://localhost:3000/api/docs
- Check logs in console
- Review test cases in `src/test/`
