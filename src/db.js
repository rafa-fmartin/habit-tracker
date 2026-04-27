import Dexie from 'dexie';

export const db = new Dexie('habitTrackerDB');

db.version(5).stores({
  habits: '++id, title, type, streak, bestStreak, lastCompleted',
  history: '++id, habitId, date, timestamp'
});
