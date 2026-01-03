import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Cardset } from './cardset.entity';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 카드셋 증분값 저장 테이블
 * 스케줄러로 자동 저장 (문서에 사람이 없을 때)
 */
@Entity('cardset_incrementals')
export class CardsetIncremental extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @ManyToOne(() => Cardset, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cardset_id' })
  cardset?: Cardset;

  /**
   * 증분값 (Yjs 업데이트 바이너리 데이터)
   * BLOB 타입 사용
   */
  @Column({ name: 'incremental_value', type: 'blob', nullable: false })
  incrementalValue!: Buffer;

  /**
   * MySQL 반영 여부 플래그
   */
  @Column({
    name: 'is_flushed',
    type: 'boolean',
    default: false,
    nullable: false,
  })
  isFlushed!: boolean;
}
