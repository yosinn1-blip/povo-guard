import { describe, it, expect } from 'vitest';
import { calculateStatus } from '../src/calculator';

describe('calculateStatus', () => {
  it('有効期限が昨日の場合、elapsed=1, remaining=179', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = calculateStatus(yesterday);
    expect(result.daysElapsed).toBe(1);
    expect(result.daysRemaining).toBe(179);
    expect(result.urgency).toBe('safe');
  });

  it('有効期限が120日前の場合、elapsed=120, remaining=60, urgency=warning', () => {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    const result = calculateStatus(d);
    expect(result.daysElapsed).toBe(120);
    expect(result.daysRemaining).toBe(60);
    expect(result.urgency).toBe('warning');
  });

  it('有効期限が151日前の場合、elapsed=151, remaining=29, urgency=danger', () => {
    const d = new Date();
    d.setDate(d.getDate() - 151);
    const result = calculateStatus(d);
    expect(result.daysElapsed).toBe(151);
    expect(result.daysRemaining).toBe(29);
    expect(result.urgency).toBe('danger');
  });

  it('有効期限がnullの場合、elapsed=180, remaining=0, urgency=danger', () => {
    const result = calculateStatus(null);
    expect(result.daysElapsed).toBe(180);
    expect(result.daysRemaining).toBe(0);
    expect(result.urgency).toBe('danger');
  });
});
