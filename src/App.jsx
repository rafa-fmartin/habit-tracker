import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

export default function App() {
  const [newHabit, setNewHabit] = useState('');
  const habits = useLiveQuery(() => db.habits.toArray());

  const addHabit = async (e) => {
    e.preventDefault();
    if (!newHabit.trim()) return;
    
    await db.habits.add({
      title: newHabit,
      streak: 0,
      lastCompleted: null
    });
    setNewHabit('');
  };

  const toggleHabit = async (id, currentStreak) => {
    const today = new Date().toLocaleDateString();
    const habit = await db.habits.get(id);
    
    if (habit.lastCompleted === today) {
      await db.habits.update(id, {
        lastCompleted: null,
        streak: Math.max(0, currentStreak - 1)
      });
    } else {
      await db.habits.update(id, {
        lastCompleted: today,
        streak: currentStreak + 1
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-6 text-zinc-900 selection:bg-zinc-200">
      <header className="mb-12 max-w-md mx-auto pt-8 text-center">
        <h1 className="text-4xl font-black tracking-tight text-zinc-900">Focus</h1>
        <div className="mt-2 flex justify-center items-center gap-2">
          <span className="h-px w-8 bg-zinc-300"></span>
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest">Privado & Local</p>
          <span className="h-px w-8 bg-zinc-300"></span>
        </div>
      </header>

      <main className="max-w-md mx-auto">
        <form onSubmit={addHabit} className="mb-8 group">
          <div className="flex gap-2 p-1.5 bg-white rounded-2xl shadow-sm border border-zinc-200 focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 transition-all">
            <input
              type="text"
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              placeholder="Qual o hábito de hoje?"
              className="flex-1 px-4 py-3 bg-transparent outline-none text-zinc-800 placeholder:text-zinc-400"
            />
            <button className="bg-zinc-900 text-white px-5 py-3 rounded-xl font-bold hover:bg-zinc-800 active:scale-95 transition-all shadow-lg shadow-zinc-200">
              Adicionar
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {habits?.map((habit) => (
            <div
              key={habit.id}
              className="flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:border-zinc-200 transition-colors"
            >
              <div className="flex flex-col">
                <span className="font-bold text-zinc-800 text-lg leading-tight">{habit.title}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-orange-500 text-sm">🔥</span>
                  <span className="text-zinc-500 text-sm font-medium">{habit.streak} dias de sequência</span>
                </div>
              </div>

              <button
                onClick={() => toggleHabit(habit.id, habit.streak)}
                className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all border-2 
                  ${habit.lastCompleted === new Date().toLocaleDateString()
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    : 'bg-zinc-50 border-zinc-200 text-transparent hover:border-zinc-400'
                  }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}