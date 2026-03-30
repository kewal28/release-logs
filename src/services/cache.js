/**
 * Optional Redis cache. If REDIS_URL (or REDIS_HOST) is unset, all ops no-op / miss → use DB.
 */
let client = null;
let connectAttempted = false;

function isRedisEnabled() {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

function getClient() {
  if (!isRedisEnabled()) return null;
  if (client) return client;
  if (connectAttempted) return null;
  connectAttempted = true;
  try {
    const Redis = require('ioredis');
    if (process.env.REDIS_URL) {
      client = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: false
      });
    } else {
      client = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 2
      });
    }
    client.on('error', (err) => {
      console.warn('Redis error:', err.message);
    });
    return client;
  } catch (e) {
    console.warn('Redis not available:', e.message);
    client = null;
    return null;
  }
}

const PREFIX = process.env.REDIS_KEY_PREFIX || 'release_log:';

function key(k) {
  return `${PREFIX}${k}`;
}

async function getJson(cacheKey) {
  const c = getClient();
  if (!c) return null;
  try {
    const raw = await c.get(key(cacheKey));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setJson(cacheKey, value, ttlSeconds) {
  const c = getClient();
  if (!c) return;
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await c.set(key(cacheKey), payload, 'EX', ttlSeconds);
    } else {
      await c.set(key(cacheKey), payload);
    }
  } catch (e) {
    console.warn('Redis set failed:', e.message);
  }
}

async function del(cacheKey) {
  const c = getClient();
  if (!c) return;
  try {
    await c.del(key(cacheKey));
  } catch (e) {
    console.warn('Redis del failed:', e.message);
  }
}

async function invalidateChangelogListCaches() {
  const c = getClient();
  if (!c) return;
  const match = `${PREFIX}changelogs:list:*`;
  try {
    const stream = c.scanStream({ match, count: 200 });
    for await (const batch of stream) {
      if (batch.length) await c.del(...batch);
    }
  } catch (e) {
    console.warn('Redis changelog cache invalidate failed:', e.message);
  }
}

async function ping() {
  const c = getClient();
  if (!c) return 'skipped';
  try {
    const p = await c.ping();
    return p === 'PONG' ? 'ok' : 'unknown';
  } catch {
    return 'error';
  }
}

module.exports = {
  isRedisEnabled,
  getJson,
  setJson,
  del,
  invalidateChangelogListCaches,
  ping,
  publicSettingsKey: 'public:settings'
};
