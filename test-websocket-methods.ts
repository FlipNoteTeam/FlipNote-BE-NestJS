/**
 * WebSocket Gateway 각 메서드 개별 테스트
 * 실제 서버가 실행 중이어야 합니다 (npm run start:dev)
 */
import { io, Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { config } from 'dotenv';

config();

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TEST_TOKEN = process.env.TEST_TOKEN || '';

let client: Socket | null = null;

// 유틸리티 함수
function createClient(): Socket {
  const client = io(`${SERVER_URL}/cardsets`, {
    auth: {
      token: TEST_TOKEN,
    },
    transports: ['websocket'],
  });

  // 모든 이벤트 로깅 (디버깅용)
  client.onAny((event, ...args) => {
    console.log(`   📨 이벤트 수신: ${event}`, args.length > 0 ? JSON.stringify(args[0]) : '');
  });

  // 에러 이벤트 핸들러
  client.on('error', (error) => {
    console.error(`   ❌ 에러 이벤트:`, error);
  });

  client.on('connect_error', (error) => {
    console.error(`   ❌ 연결 에러:`, error.message);
  });

  return client;
}

function waitForConnection(client: Socket, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('연결 타임아웃'));
    }, timeout);

    client.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    client.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForEvent<T>(
  client: Socket,
  event: string,
  timeout = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${event} 이벤트 타임아웃 (${timeout}ms)`));
    }, timeout);

    client.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// 테스트 1: join-cardset 메서드
async function testJoinCardset() {
  console.log('\n📋 테스트 1: join-cardset 메서드');
  console.log('=' .repeat(50));

  const cardsetId = 'test-join-1';
  client = createClient();

  try {
    // 연결
    await waitForConnection(client);
    console.log('✅ WebSocket 연결 성공');

    // 에러 이벤트도 확인
    let errorReceived = false;
    client.once('error', (error: any) => {
      errorReceived = true;
      console.error(`   ❌ 서버에서 에러 수신:`, error);
      if (error.details) {
        console.error(`   📋 에러 상세: ${error.details}`);
      }
    });

    // sync 이벤트 대기
    const syncPromise = waitForEvent<{ cardsetId: string; update: number[] }>(
      client,
      'sync',
      10000, // 타임아웃 10초로 증가
    );

    // join-cardset 이벤트 전송
    console.log(`📤 join-cardset 전송: ${cardsetId}`);
    console.log(`   ⏳ sync 이벤트 대기 중... (최대 10초)`);
    client.emit('join-cardset', { cardsetId });

    // sync 이벤트 수신
    const syncData = await syncPromise;
    console.log('✅ sync 이벤트 수신 성공');
    console.log(`   cardsetId: ${syncData.cardsetId}`);
    console.log(`   update 길이: ${syncData.update.length} bytes`);

    // 문서 복원 검증
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(syncData.update));
    console.log('✅ 문서 복원 성공');

    client.disconnect();
    console.log('✅ 테스트 1 완료\n');
    return true;
  } catch (error) {
    console.error('❌ 테스트 1 실패:', error);
    if (client) client.disconnect();
    return false;
  }
}

// 테스트 2: update 메서드
async function testUpdate() {
  console.log('\n📋 테스트 2: update 메서드');
  console.log('=' .repeat(50));

  const cardsetId = 'test-update-1';
  client = createClient();

  try {
    // 연결
    await waitForConnection(client);
    console.log('✅ WebSocket 연결 성공');

    // 먼저 조인
    const initialSync = waitForEvent<{ cardsetId: string; update: number[] }>(
      client,
      'sync',
    );
    client.emit('join-cardset', { cardsetId });
    const initialData = await initialSync;
    console.log('✅ 조인 완료');

    // 문서 수정
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(initialData.update));
    const testMap = doc.getMap('test');
    testMap.set('key1', 'value1');
    testMap.set('key2', 'value2');

    // 업데이트 생성
    const update = Y.encodeStateAsUpdate(doc);
    const updateArray = Array.from(update);

    // 업데이트 sync 이벤트 대기
    const updateSync = waitForEvent<{ cardsetId: string; update: number[] }>(
      client,
      'sync',
    );

    // update 이벤트 전송
    console.log(`📤 update 전송: ${cardsetId}`);
    client.emit('update', { cardsetId, update: updateArray });

    // 업데이트 sync 이벤트 수신
    const updateData = await updateSync;
    console.log('✅ 업데이트 sync 이벤트 수신 성공');
    console.log(`   update 길이: ${updateData.update.length} bytes`);

    // 업데이트 검증
    const updatedDoc = new Y.Doc();
    Y.applyUpdate(updatedDoc, new Uint8Array(updateData.update));
    const updatedMap = updatedDoc.getMap('test');
    console.log(`   key1: ${updatedMap.get('key1')}`);
    console.log(`   key2: ${updatedMap.get('key2')}`);

    client.disconnect();
    console.log('✅ 테스트 2 완료\n');
    return true;
  } catch (error) {
    console.error('❌ 테스트 2 실패:', error);
    if (client) client.disconnect();
    return false;
  }
}

// 테스트 3: leave-cardset 메서드
async function testLeaveCardset() {
  console.log('\n📋 테스트 3: leave-cardset 메서드');
  console.log('=' .repeat(50));

  const cardsetId = 'test-leave-1';
  client = createClient();

  try {
    // 연결
    await waitForConnection(client);
    console.log('✅ WebSocket 연결 성공');

    // 먼저 조인
    const syncPromise = waitForEvent<{ cardsetId: string; update: number[] }>(
      client,
      'sync',
    );
    client.emit('join-cardset', { cardsetId });
    await syncPromise;
    console.log('✅ 조인 완료');

    // leave-cardset 이벤트 전송
    console.log(`📤 leave-cardset 전송: ${cardsetId}`);
    client.emit('leave-cardset', { cardsetId });

    // 잠시 대기 (서버 처리 시간)
    await new Promise((resolve) => setTimeout(resolve, 500));

    client.disconnect();
    console.log('✅ 테스트 3 완료\n');
    return true;
  } catch (error) {
    console.error('❌ 테스트 3 실패:', error);
    if (client) client.disconnect();
    return false;
  }
}

// 테스트 4: update - 증분 업데이트 테스트
async function testIncrementalUpdate() {
  console.log('\n📋 테스트 4: 증분 업데이트 테스트');
  console.log('=' .repeat(50));

  const cardsetId = 'test-incremental-1';
  client = createClient();

  try {
    // 연결
    await waitForConnection(client);
    console.log('✅ WebSocket 연결 성공');

    // 조인
    const initialSync = waitForEvent<{ cardsetId: string; update: number[] }>(
      client,
      'sync',
    );
    client.emit('join-cardset', { cardsetId });
    const initialData = await initialSync;
    console.log('✅ 조인 완료');

    // 첫 번째 업데이트
    const doc1 = new Y.Doc();
    Y.applyUpdate(doc1, new Uint8Array(initialData.update));
    const map1 = doc1.getMap('test');
    map1.set('step1', 'value1');

    const update1 = Y.encodeStateAsUpdate(doc1);
    const update1Array = Array.from(update1);

    const sync1 = waitForEvent<{ cardsetId: string; update: number[] }>(
      client,
      'sync',
    );
    client.emit('update', { cardsetId, update: update1Array });
    await sync1;
    console.log('✅ 첫 번째 업데이트 완료');

    // 두 번째 업데이트 (증분)
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, new Uint8Array(initialData.update));
    Y.applyUpdate(doc2, update1);
    const map2 = doc2.getMap('test');
    map2.set('step2', 'value2');

    const update2 = Y.encodeStateAsUpdate(doc2);
    const update2Array = Array.from(update2);

    const sync2 = waitForEvent<{ cardsetId: string; update: number[] }>(
      client,
      'sync',
    );
    client.emit('update', { cardsetId, update: update2Array });
    const sync2Data = await sync2;
    console.log('✅ 두 번째 업데이트 완료');

    // 최종 상태 검증
    const finalDoc = new Y.Doc();
    Y.applyUpdate(finalDoc, new Uint8Array(sync2Data.update));
    const finalMap = finalDoc.getMap('test');
    console.log(`   step1: ${finalMap.get('step1')}`);
    console.log(`   step2: ${finalMap.get('step2')}`);

    client.disconnect();
    console.log('✅ 테스트 4 완료\n');
    return true;
  } catch (error) {
    console.error('❌ 테스트 4 실패:', error);
    if (client) client.disconnect();
    return false;
  }
}

// 메인 실행 함수
async function main() {
  console.log('🧪 WebSocket Gateway 메서드 개별 테스트 시작');
  console.log(`📋 서버 URL: ${SERVER_URL}\n`);

  if (!TEST_TOKEN) {
    console.warn('⚠️  TEST_TOKEN이 설정되지 않았습니다.');
    console.warn('   (서버에서 SKIP_WS_AUTH=true로 설정되어 있으면 문제없습니다)\n');
  }

  console.log('💡 팁: 서버 터미널에서 다음 로그를 확인하세요:');
  console.log('   - "User test-user joining cardset ..."');
  console.log('   - "User test-user joined cardset ..."');
  console.log('   - 에러 메시지가 있다면 확인하세요\n');

  const results = {
    joinCardset: false,
    update: false,
    leaveCardset: false,
    incrementalUpdate: false,
  };

  try {
    results.joinCardset = await testJoinCardset();
    results.update = await testUpdate();
    results.leaveCardset = await testLeaveCardset();
    results.incrementalUpdate = await testIncrementalUpdate();

    // 결과 요약
    console.log('\n' + '='.repeat(50));
    console.log('📊 테스트 결과 요약');
    console.log('='.repeat(50));
    console.log(`✅ join-cardset: ${results.joinCardset ? '통과' : '실패'}`);
    console.log(`✅ update: ${results.update ? '통과' : '실패'}`);
    console.log(`✅ leave-cardset: ${results.leaveCardset ? '통과' : '실패'}`);
    console.log(
      `✅ 증분 업데이트: ${results.incrementalUpdate ? '통과' : '실패'}`,
    );
    console.log('='.repeat(50));

    const allPassed = Object.values(results).every((r) => r === true);
    if (allPassed) {
      console.log('\n🎉 모든 테스트 통과!');
      process.exit(0);
    } else {
      console.log('\n❌ 일부 테스트 실패');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ 테스트 실행 중 오류:', error);
    process.exit(1);
  }
}

main().catch(console.error);

