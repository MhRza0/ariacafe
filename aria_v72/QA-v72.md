# Aria v72 QA Report

- Automated suite: 90/90 passed.
- JavaScript syntax: server, storage, backup, customer app, admin app and local map engine passed `node --check`.
- SQLite: `PRAGMA integrity_check = ok`; checkpoint completed before release; WAL/SHM excluded from ZIP.
- Customer flow covered by tests: menu, options/add-ons, cart, coupon, checkout, pickup/delivery, delivery quote, Persian/Arabic phone digits, order tracking, latest-order UX, business hours and overdue logic.
- Admin flow covered by tests: login/logout, rate limit, products/categories, coupons, orders/status transitions, ETA lock, notifications, analytics, settings and delivery zones.
- Security checks include no default admin password, public delivery-zone privacy, request limits, admin session protection and encoded static-path traversal protection.
- SEO checks include canonical/Open Graph, robots, sitemap, SVG MIME and admin noindex.
- Map behavior is unit-tested for wheel/trackpad zoom, two-finger pinch zoom and double-click zoom. +/- buttons remain available.
- Responsive CSS guards for customer/admin mobile layouts are covered by regression tests; iOS form font/16px anti-auto-zoom/dynamic viewport rules remain intact.
- Admin font import was repaired and admin JS/CSS/map assets were cache-busted to v72.

Visual-browser note: the execution environment used for this QA blocks localhost pages in its managed Chromium policy, so a fresh automated screenshot run against the live local server cannot be used as evidence. Real iPhone/desktop testing already performed by the project owner remains the final device-level visual check.
