import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import { db } from './db';

export default function App() {
  const [newHabit, setNewHabit] = useState('');
  const habits = useLiveQuery(() => db.habits.toArray());
  const history = useLiveQuery(() => db.history.toArray());

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
      const updatedHabit = {
        ...habit,
        lastCompleted: habit.previousLastCompleted || null,
        streak: Math.max(0, currentStreak - 1),
        bestStreak: habit.previousBestStreak || habit.bestStreak
      };
      await db.habits.put(updatedHabit);
      
      // Remove from history
      await db.history.where({ habitId: id, date: today }).delete();
    } else {
      // Complete: Check if it's a continuation or a reset
      const isContinuation = lastDate === yesterday;
      const newStreak = isContinuation ? currentStreak + 1 : 1;
      const newBestStreak = Math.max(habit.bestStreak || 0, newStreak);

      const updatedHabit = {
        ...habit,
        previousBestStreak: habit.bestStreak,
        previousLastCompleted: habit.lastCompleted,
        lastCompleted: today,
        streak: newStreak,
        bestStreak: newBestStreak
      };
      await db.habits.put(updatedHabit);
      
      // Add to history
      await db.history.add({ 
        habitId: id, 
        date: today, 
        timestamp: new Date().getTime() 
      });
    }
  };

  const deleteHabit = async (id) => {
    if (confirm('Tem certeza que deseja excluir este hábito?')) {
      await db.habits.delete(id);
      await db.history.where({ habitId: id }).delete();
    }
  };

  const exportData = async () => {
    const habitsList = await db.habits.toArray();
    const historyList = await db.history.toArray();
    const data = JSON.stringify({ habits: habitsList, history: historyList, date: new Date().toISOString() });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habitos-backup-${new Date().toLocaleDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (confirm('Isso irá substituir todos os seus hábitos atuais. Tem certeza?')) {
          await db.habits.clear();
          await db.history.clear();
          await db.habits.bulkAdd(data.habits);
          await db.history.bulkAdd(data.history);
          window.location.reload();
        }
      } catch (err) {
        alert('Arquivo inválido ou corrompido.');
      }
    };
    reader.readAsText(file);
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

  const renderHeatmap = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const daysToShow = 56; // 8 weeks
    const days = [];

    for (let i = daysToShow - 1; i >= 0; i--) {
      days.push(today - i * 86400000);
    }

    return (
      <div className="mt-12 bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
        <h3 className="text-zinc-900 font-bold mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          Consistência Global
        </h3>
        <div className="flex gap-1.5 flex-wrap">
          {days.map(day => {
            const count = history?.filter(h => h.date === day).length || 0;
            const intensity = totalHabits > 0 ? (count / totalHabits) : 0;
            
            return (
              <div 
                key={day}
                className={`w-3 h-3 rounded-[3px] transition-all duration-500 ${
                  intensity === 0 ? 'bg-zinc-100' :
                  intensity <= 0.3 ? 'bg-emerald-200' :
                  intensity <= 0.7 ? 'bg-emerald-400' :
                  'bg-emerald-600'
                }`}
                title={`${new Date(day).toLocaleDateString()}: ${count} hábitos`}
              />
            );
          })}
        </div>
        <div className="mt-4 flex justify-between items-center text-[10px] text-zinc-400 font-bold uppercase">
          <span>Menos</span>
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-zinc-100 rounded-[2px]" />
            <div className="w-2 h-2 bg-emerald-200 rounded-[2px]" />
            <div className="w-2 h-2 bg-emerald-400 rounded-[2px]" />
            <div className="w-2 h-2 bg-emerald-600 rounded-[2px]" />
          </div>
          <span>Mais</span>
        </div>
      </div>
    );
  };

  const renderStats = () => {
    const stats = (() => {
      if (!history || history.length === 0) return null;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const sevenDaysAgo = today - 7 * 86400000;
      const fourteenDaysAgo = today - 14 * 86400000;

      const thisWeek = history.filter(h => h.date >= sevenDaysAgo).length;
      const lastWeek = history.filter(h => h.date >= fourteenDaysAgo && h.date < sevenDaysAgo).length;
      
      const diff = thisWeek - lastWeek;
      const trend = diff >= 0 ? 'melhor' : 'menor';

      const hours = new Array(24).fill(0);
      history.forEach(h => {
        if (h.timestamp) {
          const hour = new Date(h.timestamp).getHours();
          hours[hour]++;
        }
      });
      const peakHour = hours.indexOf(Math.max(...hours));
      
      return { thisWeek, lastWeek, diff, trend, peakHour };
    })();

    if (!stats) return null;

    return (
      <div className="grid grid-cols-2 gap-4 mt-8">
        <div className="bg-white p-5 rounded-3xl border border-zinc-100 shadow-sm">
          <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1">Horário de Pico</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-zinc-900">{stats.peakHour}:00</span>
            <span className="text-zinc-400 text-xs font-medium">h</span>
          </div>
          <p className="text-zinc-400 text-[9px] mt-1 leading-tight">Quando você é mais constante</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-zinc-100 shadow-sm">
          <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1">Relatório Semanal</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-zinc-900">{stats.thisWeek}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stats.diff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
              {stats.diff >= 0 ? '+' : ''}{stats.diff}
            </span>
          </div>
          <p className="text-zinc-400 text-[9px] mt-1 leading-tight">
            {stats.diff >= 0 ? 'Desempenho superior' : 'Abaixo'} da semana passada
          </p>
        </div>
      </div>
    );
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
                    className="opacity-20 hover:opacity-100 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-400 transition-all ml-1"
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

      <footer className="max-w-md mx-auto mb-20 px-2">
        {renderStats()}
        {renderHeatmap()}
        
        <div className="mt-12 mb-8 flex flex-col items-center gap-4 py-8 border-t border-zinc-200/50">
          <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em]">Configurações & Backup</p>
          <div className="flex gap-4">
            <button 
              onClick={exportData}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-zinc-200 text-zinc-600 text-xs font-bold hover:border-zinc-400 transition-all shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exportar JSON
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-zinc-200 text-zinc-600 text-xs font-bold hover:border-zinc-400 cursor-pointer transition-all shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar
              <input type="file" className="hidden" accept=".json" onChange={importData} />
            </label>
          </div>
          <p className="text-zinc-300 text-[9px] text-center max-w-[200px]">Os dados são salvos apenas no seu navegador. Exporte regularmente para não perder nada.</p>
        </div>
      </footer>
    </div>
  );
}