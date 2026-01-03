import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Cardset } from './cardset.entity';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 카드셋 최종 스냅샷 테이블
 * Redis에 저장된 최종 합쳐진 doc 내용을 저장
 */
@Entity('cardset_snapshots')
export class CardsetSnapshot extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @OneToOne(() => Cardset, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cardset_id' })
  cardset?: Cardset;

  /**
   * Redis에서 합쳐진 최종 doc 내용 (Yjs 인코딩된 바이너리 데이터)
   * BLOB 또는 MEDIUMBLOB 타입 사용
   */
  @Column({ name: 'doc_content', type: 'mediumblob', nullable: false })
  docContent!: Buffer;
}
