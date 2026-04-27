import Dexie from 'dexie';

export const db = new Dexie('habitTrackerDB');

db.version(6).stores({
  habits: '++id, title, type, frequency, days, streak, bestStreak, lastCompleted',
  history: '++id, habitId, date, timestamp',
  userStats: 'id, xp, level'
});
