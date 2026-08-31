# Quchan Juice House — Aria v72 Final QA + Map Gestures

نسخه v72 بر پایه نسخه پایدار لوگودار ساخته شده و علاوه بر QA نهایی، تعامل نقشه در موبایل و دسکتاپ و یک ایراد فونت پنل مدیریت را اصلاح می‌کند. هسته سفارش، SQLite، پنل مدیریت، زمان تحویل، ساعات کاری 08:00 تا 24:00، قیمت‌گذاری چندمحدوده‌ای پیک، انتخاب موقعیت روی نقشه، پیگیری سفارش و SEO آماده است.

## تغییرات مهم v68

- جزئیات داخلی محدوده‌های پیک فقط در پنل مدیریت می‌ماند. مشتری فقط هزینه نهایی پیک یا پیام خارج از محدوده را می‌بیند.
- پاسخ عمومی ثبت/پیگیری سفارش اطلاعات `zoneMaxKm`، `zoneFee`، فاصله داخلی و `deliveryZone` را منتشر نمی‌کند.
- یادآوری سفارش تأییدنشده هر دقیقه ادامه دارد، اما برای هر سفارش فقط یک رکورد overdue در SQLite نگه داشته می‌شود.
- وابستگی Runtime به CDN خارجی Leaflet حذف شده و UI نقشه از موتور محلی `public/vendor/aria-map` استفاده می‌کند. Tileهای نقشه همچنان از OpenStreetMap دریافت می‌شوند و برای نمایش نقشه اینترنت لازم است.
- اعتبارسنجی سمت سرور برای نام، موبایل، آدرس، توضیحات، تعداد ردیف‌ها و تعداد هر محصول سخت‌تر شده است.
- شماره موبایل با ارقام فارسی و عربی، از جمله ورودی iPhone، به ارقام انگلیسی استاندارد تبدیل می‌شود. شماره‌های `+98` و `0098` نیز نرمال می‌شوند.
- canonical، `og:url`، تصویر Open Graph مطلق، `robots.txt`، `sitemap.xml`، MIME صحیح SVG و `noindex` برای پنل اضافه شده‌اند.
- شماره نمونه `09120000000` حذف می‌شود؛ شماره واقعی بعداً از پنل تنظیمات وارد شود.
- Node.js موردنیاز با مستندات یکسان شده: **22.13+**.
- زیر فرم ثبت سفارش توضیح کوتاه حریم خصوصی اضافه شده است.
- اینستاگرام رسمی: https://www.instagram.com/arya_coffe_shop/

## اجرا در شبکه محلی

روی Windows از `start-lan.bat` استفاده کنید یا متغیر رمز ادمین را تنظیم کرده و اجرا کنید:

```bash
npm start
```

نکته: Geolocation مرورگر روی `http://192.168.x.x` معمولاً مجاز نیست. انتخاب دستی پین روی نقشه کار می‌کند؛ GPS روی نسخه نهایی **HTTPS** فعال خواهد بود.

## بکاپ

```bash
npm run backup
```

جزئیات Production در `PRODUCTION.md` آمده است.


## v69 iPhone / Safari stability
- Customer CSS and JS are embedded into the initial HTML response to avoid partial LAN loads and stale Safari asset caches.
- Initial store data is bootstrapped in the same response, with API retry fallback.
- Instagram SVG has explicit dimensions so it can never expand before CSS is ready.
- Hero has static photo fallback and the menu shows a visible retry state instead of a blank area.


## v69.1 iPhone Safari storage fix
- فروشگاه در صورت مسدود بودن localStorage در Safari/iOS هم با حافظه موقت کار می‌کند.
- خرابی SSE/EventSource دیگر بارگذاری اصلی منو را شکست‌خورده اعلام نمی‌کند.
- پیام خطای راه‌اندازی با تأخیر بیشتر نمایش داده می‌شود تا LAN کند باعث خطای کاذب نشود.


## v69.2 Safari/desktop bootstrap fix
- Fixed inline asset injection so JavaScript `$$` selectors are preserved literally instead of being rewritten to `$`.
- Restored Vazirmatn loading with a dedicated stylesheet link because CSS `@import` is invalid after concatenated map CSS.
- Customer bootstrap CSS/JS remains inline for LAN/Safari resilience.


## v70 Final cross-device QA
- بررسی خودکار هسته و APIها و یکپارچگی SQLite انجام شده است.
- چیدمان عمومی در عرض‌های 320، 360، 390، 430، 768، 1024 و 1440px از نظر overflow صفحه بررسی شده است.
- کنترل‌های `input`، `textarea` و `select` در Safari/iOS و سایر مرورگرها فونت یکسان می‌گیرند.
- روی موبایل اندازه کنترل‌های فرم حداقل 16px است تا Safari هنگام ورود اطلاعات صفحه را ناخواسته Zoom نکند.
- ارتفاع مودال‌ها برای viewport پویا (`dvh`) بهینه شده و fallback قدیمی `vh` نیز حفظ شده است.
- اسکرول افقی دسته‌بندی منو برای لمس موبایل مقاوم‌تر و بدون ایجاد overflow کل صفحه شده است.
- این نسخه آخرین نسخه پیشنهادی قبل از اتصال درگاه است؛ تا آن زمان فقط باگ واقعی اصلاح شود.
- فایل‌های موقت SQLite (`-wal` و `-shm`) از بسته انتشار حذف شده‌اند و دیتابیس اصلی قبل از بسته‌بندی checkpoint شده است.


## v72 Final QA + Map gestures
- نقشه مشتری و نقشه تنظیمات پنل با اسکرول/Trackpad، دو انگشت (Pinch) و Double-click زوم می‌شوند؛ دکمه‌های + و − هم باقی مانده‌اند.
- زوم حول محل اشاره‌گر/مرکز دو انگشت انجام می‌شود تا کنترل نقشه طبیعی‌تر باشد.
- فونت پنل مدیریت اصلاح شد؛ URL قبلی Google Fonts به‌دلیل یک ادغام CSS خراب شده بود.
- Cache-busting فایل‌های پنل به v72 تغییر کرد تا مرورگر نسخه قدیمی JS/CSS نقشه را نگه ندارد.
- تست‌ها مستقل از ساعت واقعی روز شدند تا اجرای نیمه‌شب به‌اشتباه تست سفارش را Fail نکند، بدون تغییر رفتار واقعی فروشگاه.
- مرزبندی Static File سخت‌تر شد تا مسیرهای Encode‌شده نتوانند از پوشه public خارج شوند.
- 90/90 تست خودکار هسته/API/امنیت/نقشه پاس شده است.
- SQLite قبل از بسته‌بندی integrity-check و checkpoint شده و فایل‌های موقت WAL/SHM داخل Release نیستند.
