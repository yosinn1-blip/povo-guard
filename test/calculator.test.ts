import { describe, it, expect } from 'vitest';
import { calculateStatus } from '../src/calculator';

function daysFromToday(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

describe('calculateStatus', () => {
  it('有効期限が昨日の場合、elapsed=1, remaining=179', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = calculateStatus(yesterday);
    expect(result.daysElapsed).toBe(1);
    expect(result.daysRemaining).toBe(179);
    expect(result.urgency).toBe('safe');
    expect(result.phase).toBe('normal');
  });

  it('有効期限が120日前の場合、elapsed=120, remaining=60, urgency=warning', () => {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    const result = calculateStatus(d);
    expect(result.daysElapsed).toBe(120);
    expect(result.daysRemaining).toBe(60);
    expect(result.urgency).toBe('warning');
    expect(result.phase).toBe('normal');
  });

  it('有効期限が151日前の場合、elapsed=151, remaining=29, urgency=danger', () => {
    const d = new Date();
    d.setDate(d.getDate() - 151);
    const result = calculateStatus(d);
    expect(result.daysElapsed).toBe(151);
    expect(result.daysRemaining).toBe(29);
    expect(result.urgency).toBe('danger');
    expect(result.phase).toBe('normal');
  });

  it('有効期限がnullの場合、elapsed=180, remaining=0, urgency=danger', () => {
    const result = calculateStatus(null);
    expect(result.daysElapsed).toBe(180);
    expect(result.daysRemaining).toBe(0);
    expect(result.urgency).toBe('danger');
    expect(result.phase).toBe('normal');
  });

  it('停止予告日がある場合、停止日までの残日数とsuspension_pendingを返す', () => {
    const lastExpiry = daysFromToday(-150);
    const suspensionDate = daysFromToday(5);

    const result = calculateStatus(lastExpiry, suspensionDate);

    expect(result.daysElapsed).toBe(150);
    expect(result.daysRemaining).toBe(5);
    expect(result.urgency).toBe('danger');
    expect(result.phase).toBe('suspension_pending');
  });

  it('停止予告日を過ぎて契約解除予定日がある場合、解除日までの残日数とtermination_pendingを返す', () => {
    const lastExpiry = daysFromToday(-185);
    const suspensionDate = daysFromToday(-3);
    const terminationDate = daysFromToday(10);

    const result = calculateStatus(lastExpiry, suspensionDate, terminationDate);

    expect(result.daysElapsed).toBe(185);
    expect(result.daysRemaining).toBe(10);
    expect(result.urgency).toBe('danger');
    expect(result.phase).toBe('termination_pending');
  });
});
