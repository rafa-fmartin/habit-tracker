import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
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
      bestStreak: 0,
      lastCompleted: null
    });
    setNewHabit('');
  };

  const toggleHabit = async (id, currentStreak) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;

    const habit = await db.habits.get(id);
    const lastDate = habit.lastCompleted ? new Date(habit.lastCompleted).getTime() : 0;

    if (lastDate === today) {
      // Undo: Go back to previous streak
      await db.habits.update(id, {
        lastCompleted: habit.previousLastCompleted || null,
        streak: Math.max(0, currentStreak - 1)
      });
    } else {
      // Complete: Check if it's a continuation or a reset
      const isContinuation = lastDate === yesterday;
      const newStreak = isContinuation ? currentStreak + 1 : 1;
      const newBestStreak = Math.max(habit.bestStreak || 0, newStreak);

      await db.habits.update(id, {
        previousLastCompleted: habit.lastCompleted,
        lastCompleted: today,
        streak: newStreak,
        bestStreak: newBestStreak
      });
    }
  };

  const deleteHabit = async (id) => {
    if (confirm('Tem certeza que deseja excluir este hábito?')) {
      await db.habits.delete(id);
    }
  };

  const todayTimestamp = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const completedToday = habits?.filter(h => h.lastCompleted === todayTimestamp).length || 0;
  const totalHabits = habits?.length || 0;
  const progressPercentage = totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0;

  useEffect(() => {
    if (progressPercentage === 100 && totalHabits > 0) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#09090b', '#71717a', '#10b981']
      });
    }
  }, [progressPercentage, totalHabits]);

  const getEffectiveStreak = (habit) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;

    if (!habit.lastCompleted) return 0;
    // Se a última vez foi antes de ontem, a sequência quebrou
    if (habit.lastCompleted < yesterday) return 0;
    return habit.streak;
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-6 text-zinc-900 selection:bg-zinc-200">
      <header className="mb-12 max-w-md mx-auto pt-8 text-center">
        <h1 className="text-4xl font-black tracking-tight text-zinc-900">Hábitos</h1>
        <div className="mt-2 flex justify-center items-center gap-2">
          <span className="h-px w-8 bg-zinc-300"></span>
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest">Vamos ver até onde vai</p>
          <span className="h-px w-8 bg-zinc-300"></span>
        </div>

        {totalHabits > 0 && (
          <div className="mt-8 px-4">
            <div className="flex justify-between items-end mb-2">
              <span className="text-zinc-400 text-xs font-bold uppercase">Progresso de Hoje</span>
              <span className="text-zinc-900 font-black text-lg">{progressPercentage}%</span>
            </div>
            <div className="h-2 w-full bg-zinc-200 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-zinc-900 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(0,0,0,0.1)]"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}
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
              className="group flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:border-zinc-200 transition-all hover:shadow-md"
            >
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-800 text-lg leading-tight">{habit.title}</span>
                  <button 
                    onClick={() => deleteHabit(habit.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-300 hover:text-red-400 transition-all"
                    title="Excluir hábito"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-orange-500 text-sm">🔥</span>
                    <span className="text-zinc-500 text-sm font-medium">{getEffectiveStreak(habit)} dias</span>
                  </div>
                  {habit.bestStreak > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-300 text-sm">🏆</span>
                      <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-tight">Recorde: {habit.bestStreak}</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => toggleHabit(habit.id, habit.streak)}
                className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all border-2 
                  ${habit.lastCompleted === todayTimestamp
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