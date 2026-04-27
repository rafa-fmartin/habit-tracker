import Dexie from 'dexie';

export const db = new Dexie('habitTrackerDB');

db.version(2).stores({
  habits: '++id, title, streak, bestStreak, lastCompleted'
});
