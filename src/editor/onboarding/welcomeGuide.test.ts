import { beforeEach, describe, expect, it } from 'vitest';
import { hasSeenWelcome, setWelcomeSeen } from './welcomeGuide';

describe('welcomeGuide', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to not seen', () => {
    expect(hasSeenWelcome()).toBe(false);
  });

  it('persists seen across reads', () => {
    setWelcomeSeen(true);
    expect(hasSeenWelcome()).toBe(true);
  });

  it('can be reset back to not seen', () => {
    setWelcomeSeen(true);
    setWelcomeSeen(false);
    expect(hasSeenWelcome()).toBe(false);
  });

  it('defaults to not seen when the stored value is corrupt', () => {
    localStorage.setItem('gallery-designer-welcome-v1', 'not json');
    expect(hasSeenWelcome()).toBe(false);
  });

  it('defaults to not seen when the stored shape is unexpected', () => {
    localStorage.setItem('gallery-designer-welcome-v1', JSON.stringify({ seen: 'yes' }));
    expect(hasSeenWelcome()).toBe(false);
  });
});
