import Redis from 'ioredis';
import * as Y from 'yjs';
import { config } from 'dotenv';

// .env 파일 로드
config();

async function testRedis() {
  console.log('🔌 Redis 연결 테스트 시작...\n');

  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = Number(process.env.REDIS_PORT) || 6379;
  const redisPassword = process.env.REDIS_PASSWORD;

  console.log(`📋 설정 정보:`);
  console.log(`   Host: ${redisHost}`);
  console.log(`   Port: ${redisPort}`);
  console.log(`   Password: ${redisPassword ? '***' : '(없음)'}\n`);

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
    // 연결 테스트
    console.log('1️⃣  연결 테스트...');
    await redisClient.ping();
    console.log('   ✅ Redis 연결 성공!\n');

    // Yjs 문서 저장 테스트
    console.log('2️⃣  Yjs 문서 저장 테스트...');
    const testDoc = new Y.Doc();
    const testArray = testDoc.getArray('test');
    testArray.push(['test1', 'test2', 'test3']);

    const state = Y.encodeStateAsUpdate(testDoc);
    const testKey = 'yjs:cardset:test-123';
    await redisClient.set(testKey, Buffer.from(state));
    await redisClient.expire(testKey, 60);
    console.log('   ✅ Yjs 문서 저장 성공!\n');

    // Yjs 문서 로드 테스트
    console.log('3️⃣  Yjs 문서 로드 테스트...');
    const loadedData = await redisClient.getBuffer(testKey);
    if (loadedData) {
      const loadedDoc = new Y.Doc();
      Y.applyUpdate(loadedDoc, loadedData);
      const loadedArray = loadedDoc.getArray('test');
      console.log(`   ✅ 문서 로드 성공! 데이터: ${JSON.stringify(loadedArray.toArray())}\n`);
    } else {
      console.log('   ❌ 문서를 찾을 수 없습니다.\n');
    }

    // 테스트 데이터 삭제
    console.log('4️⃣  테스트 데이터 정리...');
    await redisClient.del(testKey);
    console.log('   ✅ 테스트 데이터 삭제 완료!\n');

    console.log('🎉 모든 테스트 통과!');
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    if (error instanceof Error) {
      console.error(`   메시지: ${error.message}`);
    }
  } finally {
    redisClient.disconnect();
    console.log('\n🔌 Redis 연결 종료');
  }
}

// 환경변수 로드 (필요시)
import * as dotenv from 'dotenv';
dotenv.config();

testRedis().catch(console.error);

