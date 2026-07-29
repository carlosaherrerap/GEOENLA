import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient: Redis | null = null;
let isRedisConnected = false;

try {
  redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        console.warn('[Redis] Connection retries exceeded. Falling back to memory/DB mode.');
        return null;
      }
      return Math.min(times * 200, 1000);
    },
    lazyConnect: true,
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
    console.log('[Redis] Connected successfully to Redis server');
  });

  redisClient.on('error', (err) => {
    isRedisConnected = false;
    console.warn('[Redis] Redis error/unavailable:', err.message);
  });

  redisClient.connect().catch((err) => {
    isRedisConnected = false;
    console.warn('[Redis] Failed initial connect, continuing without Redis cache:', err.message);
  });
} catch (e: any) {
  console.warn('[Redis] Could not initialize Redis client:', e.message);
}

export async function setLatestUserLocation(
  userId: string,
  data: {
    lat: number;
    lng: number;
    accuracy?: number | null;
    speed?: number | null;
    battery_level?: number | null;
    id_activity?: string | null;
    recorded_at: string;
  }
) {
  if (!redisClient || !isRedisConnected) return;

  try {
    const key = `user:latest:${userId}`;
    await redisClient.set(key, JSON.stringify(data));
    await redisClient.sadd('users:active_set', userId);
  } catch (err: any) {
    console.warn('[Redis] Error setting user location:', err.message);
  }
}

export async function getLatestUserLocations(userIds?: string[]) {
  if (!redisClient || !isRedisConnected) return null;

  try {
    const targets = userIds || (await redisClient.smembers('users:active_set'));
    if (!targets || targets.length === 0) return {};

    const pipeline = redisClient.pipeline();
    for (const uid of targets) {
      pipeline.get(`user:latest:${uid}`);
    }

    const results = await pipeline.exec();
    const output: Record<string, any> = {};

    if (results) {
      results.forEach(([err, val], idx) => {
        const uid = targets[idx];
        if (!err && val && typeof val === 'string') {
          try {
            output[uid] = JSON.parse(val);
          } catch {
            // ignore JSON parse error
          }
        }
      });
    }

    return output;
  } catch (err: any) {
    console.warn('[Redis] Error getting user locations:', err.message);
    return null;
  }
}

export { redisClient, isRedisConnected };
