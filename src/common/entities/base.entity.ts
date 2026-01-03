import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 생성시간과 수정시간을 포함한 Base Entity
 */
export abstract class BaseEntity {
  /**
   * 생성 시간
   */
  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
  })
  createdAt!: Date;

  /**
   * 수정 시간
   */
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
  })
  updatedAt!: Date;
}
