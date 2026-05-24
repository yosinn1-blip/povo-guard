import { describe, it, expect } from 'vitest';
import { getReachedThresholds } from '../src/notifier';

describe('getReachedThresholds', () => {
  it('経過日数60のとき、[60]を返す', () => {
    expect(getReachedThresholds(60)).toEqual([60]);
  });

  it('経過日数121のとき、[60,120]を返す（Cronが1日止まっても取りこぼさない）', () => {
    expect(getReachedThresholds(121)).toEqual([60, 120]);
  });

  it('経過日数150のとき、[60,120,150]を返す', () => {
    expect(getReachedThresholds(150)).toEqual([60, 120, 150]);
  });

  it('経過日数165のとき、[60,120,150,160]を返す', () => {
    expect(getReachedThresholds(165)).toEqual([60, 120, 150, 160]);
  });

  it('経過日数180のとき、全閾値[60,120,150,160,170]を返す', () => {
    expect(getReachedThresholds(180)).toEqual([60, 120, 150, 160, 170]);
  });

  it('経過日数59のとき、空配列を返す', () => {
    expect(getReachedThresholds(59)).toEqual([]);
  });
});
