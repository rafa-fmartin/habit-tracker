import Dexie from 'dexie';

export const db = new Dexie('habitTrackerDB');

db.version(4).stores({
  habits: '++id, title, streak, bestStreak, lastCompleted',
  history: '++id, habitId, date, timestamp'
});
