# Aria v72 — Production / Final Pre-Gateway QA

## Runtime

Node.js **22.13+** لازم است. نسخه‌های جدیدتر مانند Node 26 نیز پشتیبانی می‌شوند. برنامه از `node:sqlite` استفاده می‌کند.

## Database

SQLite منبع اصلی داده است (`data/aria.sqlite` به صورت پیش‌فرض) با WAL، FULL synchronous writes، integrity check، ایندکس‌ها و شماره سفارش UNIQUE. اگر دیتابیس خالی باشد، `data/db.json` فقط برای مهاجرت اولیه خوانده می‌شود.

## Required admin password

رمز پیش‌فرض وجود ندارد. حداقل این متغیرها را تنظیم کنید:

```bash
export ADMIN_USER=admin
export ADMIN_PASSWORD='a-long-random-password'
```

رمز باید حداقل 12 کاراکتر باشد. رمز واقعی را داخل فایل‌های پروژه Commit نکنید.

## Public URL / SEO

روی سرور نهایی این متغیر را برابر دامنه HTTPS سایت قرار دهید:

```bash
PUBLIC_BASE_URL=https://YOUR-DOMAIN.IR
```

از آن برای canonical، Open Graph، `robots.txt` و `sitemap.xml` استفاده می‌شود. اگر تنظیم نشده باشد، برنامه Origin درخواست را به صورت خودکار استفاده می‌کند.

## HTTPS / reverse proxy

برای Production:

```bash
NODE_ENV=production
COOKIE_SECURE=1
TRUST_PROXY=1
```

در استقرار نهایی Nginx باید SSL را Terminate کند و `X-Forwarded-For` و `X-Forwarded-Proto` را پاس دهد.

## Maps

کد UI نقشه داخل خود پروژه است و به CDN جاوااسکریپت خارجی وابسته نیست. زوم با Wheel/Trackpad، Pinch دو انگشتی، Double-click و دکمه‌های +/− پشتیبانی می‌شود. تصاویر Tile از OpenStreetMap آنلاین بارگذاری می‌شوند؛ بنابراین نمایش نقشه اینترنت می‌خواهد. Geolocation مشتری نیز در مرورگرهای موبایل روی HTTPS اجرا می‌شود.

## Backups

```bash
npm run backup
```

بکاپ شامل SQLite و `public/uploads/` است. نگهداری پیش‌فرض 14 روز است و با `BACKUP_KEEP_DAYS` تغییر می‌کند. روی VPS اجرای روزانه با cron توصیه می‌شود.

## Rate limits

پیش‌فرض‌ها:
- ورود ناموفق ادمین: 5 بار / 15 دقیقه / IP
- ثبت سفارش: 20 بار / 5 دقیقه / IP
- پیگیری سفارش: 60 بار / 5 دقیقه / IP
- اعتبارسنجی کد تخفیف: 60 بار / 5 دقیقه / IP
- استعلام هزینه پیک: 120 بار / 5 دقیقه / IP

## Remaining deployment stages

درگاه پرداخت هنوز متصل نشده است. پس از دریافت درگاه، مرحله بعد شامل پرداخت امن/Verify/Callback و سپس VPS + PM2 + Nginx + SSL + بکاپ زمان‌بندی‌شده و تست نهایی دستگاه واقعی است.


## v69.2 Safari/desktop bootstrap fix
- Fixed inline asset injection so JavaScript `$$` selectors are preserved literally instead of being rewritten to `$`.
- Restored Vazirmatn loading with a dedicated stylesheet link because CSS `@import` is invalid after concatenated map CSS.
- Customer bootstrap CSS/JS remains inline for LAN/Safari resilience.


## v70 cross-device note
فرانت مشتری برای viewportهای رایج موبایل و دسکتاپ از نظر overflow و اجرای Bootstrap بررسی شده است. تست موتور واقعی Safari فقط روی دستگاه Apple قابل انجام است؛ با این حال اصلاحات سازگاری iOS شامل کنترل فونت فرم‌ها، جلوگیری از auto-zoom و viewport پویا در CSS اعمال شده‌اند.
