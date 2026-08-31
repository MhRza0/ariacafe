'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = '1';

function safeJsonParse(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function createStorage({ dbPath, legacyJsonPath }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sql = new DatabaseSync(dbPath);
  sql.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      sort INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      name TEXT NOT NULL DEFAULT '',
      available INTEGER NOT NULL DEFAULT 1,
      popular INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      customer_phone TEXT,
      coupon_id TEXT,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_orders_coupon ON orders(coupon_id);
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      active INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      type TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read, created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_order ON notifications(order_id);
  `);

  const getMetaStmt = sql.prepare('SELECT value FROM metadata WHERE key = ?');
  const setMetaStmt = sql.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  setMetaStmt.run('schema_version', SCHEMA_VERSION);

  const caches = {
    settings: null,
    categories: new Map(),
    products: new Map(),
    orders: new Map(),
    coupons: new Map(),
    notifications: new Map(),
  };

  const statements = {
    settingsUpsert: sql.prepare('INSERT INTO settings(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'),
    categoryUpsert: sql.prepare('INSERT INTO categories(id,sort,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET sort=excluded.sort,data=excluded.data'),
    categoryDelete: sql.prepare('DELETE FROM categories WHERE id=?'),
    productUpsert: sql.prepare('INSERT INTO products(id,category_id,name,available,popular,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,available=excluded.available,popular=excluded.popular,data=excluded.data'),
    productDelete: sql.prepare('DELETE FROM products WHERE id=?'),
    orderUpsert: sql.prepare('INSERT INTO orders(id,number,created_at,status,customer_phone,coupon_id,data) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET number=excluded.number,created_at=excluded.created_at,status=excluded.status,customer_phone=excluded.customer_phone,coupon_id=excluded.coupon_id,data=excluded.data'),
    orderDelete: sql.prepare('DELETE FROM orders WHERE id=?'),
    couponUpsert: sql.prepare('INSERT INTO coupons(id,code,active,used_count,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,active=excluded.active,used_count=excluded.used_count,data=excluded.data'),
    couponDelete: sql.prepare('DELETE FROM coupons WHERE id=?'),
    notificationUpsert: sql.prepare('INSERT INTO notifications(id,order_id,type,is_read,created_at,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET order_id=excluded.order_id,type=excluded.type,is_read=excluded.is_read,created_at=excluded.created_at,data=excluded.data'),
    notificationDelete: sql.prepare('DELETE FROM notifications WHERE id=?'),
  };

  function tableCount(table) {
    return Number(sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n || 0);
  }

  function isEmpty() {
    return tableCount('settings') === 0 && tableCount('categories') === 0 && tableCount('products') === 0 && tableCount('orders') === 0 && tableCount('coupons') === 0 && tableCount('notifications') === 0;
  }

  function loadRows(table) {
    return sql.prepare(`SELECT data FROM ${table}`).all().map(r => safeJsonParse(r.data, null)).filter(Boolean);
  }

  function refreshCaches(state) {
    caches.settings = JSON.stringify(state.settings || {});
    for (const key of ['categories','products','orders','coupons','notifications']) {
      caches[key].clear();
      for (const row of state[key] || []) caches[key].set(String(row.id), JSON.stringify(row));
    }
  }

  function loadFromSqlite() {
    const settingsRow = sql.prepare('SELECT data FROM settings WHERE id=1').get();
    const state = {
      settings: settingsRow ? safeJsonParse(settingsRow.data, {}) : {},
      categories: loadRows('categories').sort((a,b)=>(Number(a.sort)||0)-(Number(b.sort)||0)),
      products: loadRows('products'),
      orders: loadRows('orders').sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0)),
      coupons: loadRows('coupons'),
      notifications: loadRows('notifications').sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0)),
    };
    refreshCaches(state);
    return state;
  }

  function syncCollection(name, rows, upsert, del, argsFor) {
    const cache = caches[name];
    const seen = new Set();
    const nextSerialized = new Map();
    for (const row of rows || []) {
      const id = String(row.id || '');
      if (!id) throw new Error(`Missing id in ${name}`);
      const serialized = JSON.stringify(row);
      seen.add(id);
      nextSerialized.set(id, serialized);
      if (cache.get(id) !== serialized) upsert.run(...argsFor(row, serialized));
    }
    for (const oldId of cache.keys()) if (!seen.has(oldId)) del.run(oldId);
    return nextSerialized;
  }

  function saveState(state) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      const settingsSerialized = JSON.stringify(state.settings || {});
      if (caches.settings !== settingsSerialized) statements.settingsUpsert.run(settingsSerialized);
      const next = {};
      next.categories = syncCollection('categories', state.categories, statements.categoryUpsert, statements.categoryDelete, (r,s)=>[String(r.id),Number(r.sort)||0,s]);
      next.products = syncCollection('products', state.products, statements.productUpsert, statements.productDelete, (r,s)=>[String(r.id),String(r.categoryId||''),String(r.name||''),r.available===false?0:1,r.popular===true?1:0,s]);
      next.orders = syncCollection('orders', state.orders, statements.orderUpsert, statements.orderDelete, (r,s)=>[String(r.id),String(r.number||''),String(r.createdAt||''),String(r.status||'new'),String(r.customer?.phone||''),String(r.coupon?.id||''),s]);
      next.coupons = syncCollection('coupons', state.coupons, statements.couponUpsert, statements.couponDelete, (r,s)=>[String(r.id),String(r.code||''),r.active===false?0:1,Number(r.usedCount)||0,s]);
      next.notifications = syncCollection('notifications', state.notifications, statements.notificationUpsert, statements.notificationDelete, (r,s)=>[String(r.id),String(r.orderId||''),String(r.type||''),r.read?1:0,String(r.createdAt||''),s]);
      setMetaStmt.run('schema_version', SCHEMA_VERSION);
      setMetaStmt.run('updated_at', new Date().toISOString());
      sql.exec('COMMIT');
      caches.settings = settingsSerialized;
      for (const key of Object.keys(next)) caches[key] = next[key];
    } catch (e) {
      try { sql.exec('ROLLBACK'); } catch {}
      throw e;
    }
  }

  function importLegacyIfNeeded() {
    if (!isEmpty()) return false;
    if (!legacyJsonPath || !fs.existsSync(legacyJsonPath)) return false;
    const legacy = safeJsonParse(fs.readFileSync(legacyJsonPath, 'utf8'), null);
    if (!legacy || typeof legacy !== 'object') throw new Error('فایل دیتابیس قدیمی قابل خواندن نیست.');
    const state = {
      settings: legacy.settings || {},
      categories: Array.isArray(legacy.categories) ? legacy.categories : [],
      products: Array.isArray(legacy.products) ? legacy.products : [],
      orders: Array.isArray(legacy.orders) ? legacy.orders : [],
      coupons: Array.isArray(legacy.coupons) ? legacy.coupons : [],
      notifications: Array.isArray(legacy.notifications) ? legacy.notifications : [],
    };
    refreshCaches({settings:{},categories:[],products:[],orders:[],coupons:[],notifications:[]});
    saveState(state);
    setMetaStmt.run('legacy_imported_at', new Date().toISOString());
    return true;
  }

  function loadState() {
    const imported = importLegacyIfNeeded();
    const state = loadFromSqlite();
    return { state, imported };
  }

  function health() {
    const result = sql.prepare('PRAGMA integrity_check').get();
    return { engine:'sqlite', journalMode:String(sql.prepare('PRAGMA journal_mode').get().journal_mode || ''), integrity:String(result.integrity_check || '') };
  }

  function close() { try { sql.close(); } catch {} }

  return { dbPath, loadState, saveState, health, close, sql };
}

module.exports = { createStorage, SCHEMA_VERSION };
