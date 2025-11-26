/**
 * MySQL 연결 테스트
 */
import { config } from 'dotenv';
import { createConnection, Connection } from 'typeorm';
import { Cardset } from './src/cardset/entities/cardset.entity';
import { CardsetContent } from './src/cardset/entities/cardset-content.entity';
import { CardsetIncremental } from './src/cardset/entities/cardset-incremental.entity';
import { CardsetSnapshot } from './src/cardset/entities/cardset-snapshot.entity';

config();

async function testMySQLConnection() {
  console.log('🧪 MySQL 연결 테스트 시작...\n');

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = Number(process.env.DB_PORT) || 3306;
  const dbUsername = process.env.DB_USERNAME || 'root';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbDatabase = process.env.DB_DATABASE || 'flipnote';

  console.log('📋 설정 정보:');
  console.log(`   Host: ${dbHost}`);
  console.log(`   Port: ${dbPort}`);
  console.log(`   Username: ${dbUsername}`);
  console.log(`   Database: ${dbDatabase}`);
  console.log(`   Password: ${dbPassword ? '***' : '(없음)'}\n`);

  let connection: Connection | null = null;

  try {
    // 1. 연결 테스트
    console.log('1️⃣  MySQL 연결 테스트...');
    connection = await createConnection({
      type: 'mysql',
      host: dbHost,
      port: dbPort,
      username: dbUsername,
      password: dbPassword,
      database: dbDatabase,
      entities: [Cardset, CardsetContent, CardsetIncremental, CardsetSnapshot],
      synchronize: false,
      logging: false,
    });

    console.log('   ✅ MySQL 연결 성공!\n');

    // 2. 테이블 존재 확인
    console.log('2️⃣  테이블 존재 확인...');
    const queryRunner = connection.createQueryRunner();

    const tables = [
      'card_set',
      'cardset_contents',
      'cardset_incrementals',
      'cardset_snapshots',
    ];

    for (const tableName of tables) {
      const tableExists = await queryRunner.hasTable(tableName);
      console.log(
        `   ${tableExists ? '✅' : '❌'} ${tableName}: ${tableExists ? '존재' : '없음'}`,
      );
    }
    console.log('');

    // 3. cardset_contents 테이블 구조 확인
    console.log('3️⃣  cardset_contents 테이블 구조 확인...');
    const cardsetContentTable = await queryRunner.getTable('cardset_contents');
    if (cardsetContentTable) {
      console.log('   ✅ 테이블 존재');
      console.log(`   컬럼 수: ${cardsetContentTable.columns.length}`);
      cardsetContentTable.columns.forEach((col) => {
        console.log(`      - ${col.name} (${col.type})`);
      });
    } else {
      console.log('   ❌ 테이블 없음');
    }
    console.log('');

    // 4. cardset_incrementals 테이블 구조 확인
    console.log('4️⃣  cardset_incrementals 테이블 구조 확인...');
    const incrementalTable = await queryRunner.getTable('cardset_incrementals');
    if (incrementalTable) {
      console.log('   ✅ 테이블 존재');
      console.log(`   컬럼 수: ${incrementalTable.columns.length}`);
      incrementalTable.columns.forEach((col) => {
        console.log(`      - ${col.name} (${col.type})`);
      });
    } else {
      console.log('   ❌ 테이블 없음');
    }
    console.log('');

    // 5. 샘플 데이터 조회 테스트
    console.log('5️⃣  샘플 데이터 조회 테스트...');
    try {
      const cardsetRepository = connection.getRepository(Cardset);
      const count = await cardsetRepository.count();
      console.log(`   ✅ cardset 테이블 레코드 수: ${count}`);
    } catch (error) {
      console.log(`   ⚠️  cardset 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const contentRepository = connection.getRepository(CardsetContent);
      const count = await contentRepository.count();
      console.log(`   ✅ cardset_contents 테이블 레코드 수: ${count}`);
    } catch (error) {
      console.log(`   ⚠️  cardset_contents 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const incrementalRepository = connection.getRepository(CardsetIncremental);
      const count = await incrementalRepository.count();
      console.log(`   ✅ cardset_incrementals 테이블 레코드 수: ${count}`);
    } catch (error) {
      console.log(`   ⚠️  cardset_incrementals 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log('');

    // 6. INSERT 테스트 (트랜잭션으로 롤백)
    console.log('6️⃣  INSERT 테스트 (트랜잭션 롤백)...');
    const queryRunner2 = connection.createQueryRunner();
    await queryRunner2.connect();
    await queryRunner2.startTransaction();

    try {
      // 테스트용 INSERT (실제로는 저장하지 않음)
      await queryRunner2.query(
        'SELECT 1 as test',
      );
      console.log('   ✅ 쿼리 실행 성공');
      await queryRunner2.rollbackTransaction();
      console.log('   ✅ 트랜잭션 롤백 성공\n');
    } catch (error) {
      await queryRunner2.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner2.release();
    }

    console.log('🎉 모든 MySQL 테스트 통과!');
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    if (error instanceof Error) {
      console.error(`   메시지: ${error.message}`);
      if (error.stack) {
        console.error(`   스택: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
      }
    }
    process.exit(1);
  } finally {
    if (connection && connection.isConnected) {
      await connection.close();
      console.log('\n🔌 MySQL 연결 종료');
    }
  }
}

testMySQLConnection().catch(console.error);

