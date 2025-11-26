import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Cardset } from './cardset.entity';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 카드셋 내용 JSON 테이블
 * 카드 내용을 JSON 문자열로 저장
 * 예: {"question1": "content1", "question2": "content2"}
 */
@Entity('cardset_contents')
export class CardsetContent extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  //1대1 관계
  @OneToOne(() => Cardset, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cardset_id' })
  cardset?: Cardset;

  /**
   * 카드셋의 내용을 JSON 문자열로 저장
   * 예: {"question1": "content1", "question2": "content2"}
   * TEXT 또는 LONGTEXT 타입 사용
   */
  @Column({ type: 'longtext', nullable: false })
  content!: string;
}
