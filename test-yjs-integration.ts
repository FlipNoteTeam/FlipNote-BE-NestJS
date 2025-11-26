/**
 * Yjs 문서 서비스 통합 테스트
 * 실제 Redis 연결이 필요합니다
 */
import { config } from 'dotenv';
import Redis from 'ioredis';
import * as Y from 'yjs';

config();

async function testYjsIntegration() {
  console.log('🧪 Yjs 통합 테스트 시작...\n');

  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = Number(process.env.REDIS_PORT) || 6379;
  const redisPassword = process.env.REDIS_PASSWORD;

  const redisClient = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  try {
    // 1. 연결 테스트
    console.log('1️⃣  Redis 연결 테스트...');
    await redisClient.ping();
    console.log('   ✅ Redis 연결 성공!\n');

    // 2. 문서 저장 및 로드
    console.log('2️⃣  문서 저장 및 로드 테스트...');
    const cardsetId = 'test-integration-123';
    const doc = new Y.Doc();
    const testMap = doc.getMap('content');
    testMap.set('key1', 'value1');
    testMap.set('key2', 'value2');

    const state = Y.encodeStateAsUpdate(doc);
    const key = `yjs:cardset:${cardsetId}`;
    await redisClient.set(key, Buffer.from(state));
    await redisClient.expire(key, 60);

    const loadedData = await redisClient.getBuffer(key);
    if (loadedData) {
      const loadedDoc = new Y.Doc();
      Y.applyUpdate(loadedDoc, loadedData);
      const loadedMap = loadedDoc.getMap('content');
      console.log(`   ✅ 문서 로드 성공!`);
      console.log(`      key1: ${loadedMap.get('key1')}`);
      console.log(`      key2: ${loadedMap.get('key2')}\n`);
    }

    // 3. 증분 업데이트 리스트 테스트
    console.log('3️⃣  증분 업데이트 리스트 테스트...');
    const historyKey = `yjs:cardset:${cardsetId}:updates`;
    const update1 = Buffer.from([1, 2, 3]);
    const update2 = Buffer.from([4, 5, 6]);

    await redisClient.rpush(historyKey, update1.toString('base64'));
    await redisClient.rpush(historyKey, update2.toString('base64'));

    const updates = await redisClient.lrange(historyKey, 0, -1);
    console.log(`   ✅ 증분 업데이트 저장 성공! (${updates.length}개)\n`);

    // 4. 클라이언트 관리 테스트
    console.log('4️⃣  클라이언트 관리 테스트...');
    const cardsetKey = `yjs:cardset:${cardsetId}:clients`;
    const clientId = 'test-client-1';

    await redisClient.sadd(cardsetKey, clientId);
    const count = await redisClient.scard(cardsetKey);
    console.log(`   ✅ 클라이언트 등록 성공! (활성 클라이언트: ${count}명)\n`);

    await redisClient.srem(cardsetKey, clientId);
    const countAfter = await redisClient.scard(cardsetKey);
    console.log(
      `   ✅ 클라이언트 해제 성공! (활성 클라이언트: ${countAfter}명)\n`,
    );

    // 5. 정리
    console.log('5️⃣  테스트 데이터 정리...');
    await redisClient.del(key);
    await redisClient.del(historyKey);
    await redisClient.del(cardsetKey);
    console.log('   ✅ 테스트 데이터 삭제 완료!\n');

    console.log('🎉 모든 통합 테스트 통과!');
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    if (error instanceof Error) {
      console.error(`   메시지: ${error.message}`);
    }
    process.exit(1);
  } finally {
    redisClient.disconnect();
    console.log('\n🔌 Redis 연결 종료');
  }
}

testYjsIntegration().catch(console.error);

