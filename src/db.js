import Dexie from 'dexie';

export const db = new Dexie('habitTrackerDB');

db.version(1).stores({
  habits: '++id, title, streak, lastCompleted'
});
