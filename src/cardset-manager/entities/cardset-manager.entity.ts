import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity('card_set_managers')
// @Unique('UQ_card_set_manager_user_cardset', ['userId', 'cardSetId'])
// @Index('idx_card_set_manager_user', ['userId'])
// @Index('idx_card_set_manager_cardset', ['cardSetId'])
export class CardsetManager {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'user_id', type: 'int', nullable: false })
  userId!: number;

  @Column({ name: 'card_set_id', type: 'int', nullable: false })
  cardSetId!: number;
}
