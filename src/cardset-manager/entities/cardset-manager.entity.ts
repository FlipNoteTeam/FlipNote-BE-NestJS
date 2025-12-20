import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('card_set_managers')
export class CardsetManager {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'user_id', type: 'int', nullable: false })
  userId!: number;

  @Column({ name: 'card_set_id', type: 'int', nullable: false })
  cardSetId!: number;
}
