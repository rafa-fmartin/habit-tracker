import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import { db } from './db';

export default function App() {
  const [newHabit, setNewHabit] = useState('');
  const [habitType, setHabitType] = useState('good');
  const [habitDays, setHabitDays] = useState([0, 1, 2, 3, 4, 5, 6]); // All days by default
  const [initialStreak, setInitialStreak] = useState(0);
  const [activeTab, setActiveTab] = useState('checklist');
  const [error, setError] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [pendingToggles, setPendingToggles] = useState(new Set());
  
  const habits = useLiveQuery(() => db.habits.toArray());
  const history = useLiveQuery(() => db.history.toArray());
  const userStats = useLiveQuery(() => db.userStats.get(1));

  useEffect(() => {
    const initStats = async () => {
      try {
        const stats = await db.userStats.get(1);
        if (!stats) {
          await db.userStats.add({ id: 1, xp: 0, level: 1 });
        }
      } catch (err) {
        console.error("Failed to init stats:", err);
        setError("Erro ao inicializar banco de dados. Tente recarregar a página.");
      }
    };
    initStats();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const addHabit = async (e) => {
    e.preventDefault();
    if (!newHabit.trim()) return;

    await db.habits.add({
      title: newHabit,
      type: habitType,
      days: habitDays,
      frequency: habitDays.length === 7 ? 'daily' : 'flexible',
      streak: parseInt(initialStreak) || 0,
      bestStreak: parseInt(initialStreak) || 0,
      lastCompleted: initialStreak > 0 ? getPreviousScheduledDay(habitDays) : null,
      createdAt: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()
    });
    setNewHabit('');
    setHabitType('good');
    setHabitDays([0, 1, 2, 3, 4, 5, 6]);
    setInitialStreak(0);
  };

  const toggleHabit = async (id, currentStreak) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const habit = await db.habits.get(id);
    const lastDate = habit.lastCompleted ? new Date(habit.lastCompleted).getTime() : 0;

    const isUndo = lastDate === today;

    if (isUndo) {
      // Undo: Go back to previous streak
      const updatedHabit = {
        ...habit,
        lastCompleted: habit.previousLastCompleted ?? null,
        streak: habit.type === 'bad' ? (habit.previousStreak ?? habit.streak) : Math.max(0, currentStreak - 1),
        bestStreak: habit.previousBestStreak ?? habit.bestStreak
      };
      await db.habits.put(updatedHabit);
      
      // Remove from history
      await db.history.where({ habitId: id, date: today }).delete();
    } else {
      // Complete: Check if it's a continuation or a reset
      const lastScheduled = getPreviousScheduledDay(habit.days || [0,1,2,3,4,5,6]);
      const isContinuation = lastDate === lastScheduled;
      const newStreak = habit.type === 'bad' ? 0 : (isContinuation ? currentStreak + 1 : 1);
      const newBestStreak = Math.max(habit.bestStreak || 0, newStreak);

      const updatedHabit = {
        ...habit,
        previousBestStreak: habit.bestStreak,
        previousLastCompleted: habit.lastCompleted,
        previousStreak: habit.streak,
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

    // Gamification: XP update
    const stats = await db.userStats.get(1);
    const baseChange = habit.type === 'bad' ? -10 : 10;
    const xpChange = isUndo ? -baseChange : baseChange;
    
    let newXp = (stats?.xp || 0) + xpChange;
    let newLevel = stats?.level || 1;
    
    if (xpChange > 0) {
      const xpToNextLevel = newLevel * 100;
      if (newXp >= xpToNextLevel) {
        newXp -= xpToNextLevel;
        newLevel += 1;
        confetti({
          particleCount: 200,
          spread: 90,
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#f59e0b', '#ffffff']
        });
      }
    } else {
      if (newXp < 0 && newLevel > 1) {
        newLevel -= 1;
        newXp += (newLevel * 100);
      } else if (newXp < 0 && newLevel === 1) {
        newXp = 0;
      }
    }
    
    await db.userStats.put({ id: 1, xp: newXp, level: newLevel });
  };

  const saveChanges = async () => {
    // Determine which habits are being completed in this batch
    const hasAnyBadHabitToday = activeHabitsToday.some(h => h.type === 'bad');
    
    for (const id of pendingToggles) {
      const habit = habits.find(h => h.id === id);
      if (habit) {
        await toggleHabit(id, habit.streak);
      }
    }

    // Check if after this save, all good habits are done and no bad habits were involved
    const newCompletedCount = activeHabitsToday.filter(h => {
      const isActuallyDone = h.lastCompleted === todayTimestamp;
      const isBeingToggled = pendingToggles.has(h.id);
      // If it's done and NOT being toggled, it's completed.
      // If it's NOT done but IS being toggled, it's now completed.
      return (isActuallyDone && !isBeingToggled) || (!isActuallyDone && isBeingToggled);
    }).length;

    if (newCompletedCount === totalActiveHabits && totalActiveHabits > 0 && !hasAnyBadHabitToday) {
      confetti({
        particleCount: 200,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10b981', '#fbbf24', '#ffffff']
      });
    }

    setPendingToggles(new Set());
  };

  const handleToggleDraft = (id) => {
    const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
    const habit = habits.find(h => h.id === id);
    
    // Prevent changing the status if it has already been saved as completed today
    if (habit && habit.lastCompleted === today) {
      return;
    }

    const next = new Set(pendingToggles);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setPendingToggles(next);
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
        console.error('Import error:', err);
        alert('Arquivo inválido ou corrompido.');
      }
    };
    reader.readAsText(file);
  };

  const getPreviousScheduledDay = (habitDays, fromDate = new Date()) => {
    const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
    for (let i = 1; i <= 7; i++) {
      const prev = new Date(today - i * 86400000);
      if (habitDays.includes(prev.getDay())) return prev.getTime();
    }
    return null;
  };

  const getScheduledDaysBetween = (startTimestamp, endTimestamp, scheduledDays) => {
    if (!startTimestamp || !endTimestamp || startTimestamp >= endTimestamp) return 0;
    
    let count = 0;
    let current = new Date(startTimestamp);
    current.setDate(current.getDate() + 1); // Start day after
    current.setHours(0,0,0,0);
    
    const end = new Date(endTimestamp);
    end.setHours(0,0,0,0);

    while (current <= end) {
      if (scheduledDays.includes(current.getDay())) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  const getEffectiveStreak = (habit) => {
    const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
    
    if (habit.type === 'bad') {
      const isFailedTodayInDb = habit.lastCompleted === today;
      const isPending = pendingToggles.has(habit.id);
      const isFailedToday = isPending ? !isFailedTodayInDb : isFailedTodayInDb;
      
      if (isFailedToday) return 0;

      const lastRecorded = habit.lastCompleted || habit.createdAt || today;
      const daysSince = getScheduledDaysBetween(lastRecorded, today, habit.days || [0,1,2,3,4,5,6]);
      
      return (habit.streak || 0) + daysSince;
    } else {
      if (!habit.lastCompleted) return 0;
      
      const now = new Date();
      const isScheduledToday = habit.days?.includes(now.getDay());
      const lastScheduled = getPreviousScheduledDay(habit.days || [0,1,2,3,4,5,6]);
      
      if (habit.lastCompleted < lastScheduled && (isScheduledToday || lastScheduled > habit.lastCompleted)) {
        return 0;
      }
      
      return habit.streak;
    }
  };

  const todayTimestamp = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  
  const isHabitCompleted = (habit) => {
    const dbCompleted = habit.lastCompleted === todayTimestamp;
    const isPending = pendingToggles.has(habit.id);
    return isPending ? !dbCompleted : dbCompleted;
  };

  const activeHabitsToday = habits?.filter(h => h.days?.includes(new Date().getDay()) || !h.days) || [];
  const goodHabitsToday = activeHabitsToday.filter(h => h.type !== 'bad');
  const badHabitsToday = activeHabitsToday.filter(h => h.type === 'bad');
  
  const completedGoodCount = goodHabitsToday.filter(h => isHabitCompleted(h)).length;
  const performedBadCount = badHabitsToday.filter(h => isHabitCompleted(h)).length;
  
  const goodProgress = goodHabitsToday.length > 0 ? Math.round((completedGoodCount / goodHabitsToday.length) * 100) : 0;
  const badProgress = badHabitsToday.length > 0 ? Math.round((performedBadCount / badHabitsToday.length) * 100) : 0;
  
  const totalActiveHabits = activeHabitsToday.length;

  const renderHeatmap = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const daysToShow = 56; // 8 weeks
    const days = [];

    for (let i = daysToShow - 1; i >= 0; i--) {
      days.push(today - i * 86400000);
    }

    const totalHabits = habits?.length || 0;

    return (
      <div className="mt-12 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
        <h3 className="text-zinc-900 dark:text-zinc-100 font-bold mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
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
                  intensity === 0 ? 'bg-zinc-100 dark:bg-zinc-800' :
                  intensity <= 0.3 ? 'bg-emerald-200 dark:bg-emerald-900' :
                  intensity <= 0.7 ? 'bg-emerald-400 dark:bg-emerald-700' :
                  'bg-emerald-600 dark:bg-emerald-500'
                }`}
                title={`${new Date(day).toLocaleDateString()}: ${count} hábitos`}
              />
            );
          })}
        </div>
        <div className="mt-4 flex justify-between items-center text-[10px] text-zinc-400 font-bold uppercase">
          <span>Menos</span>
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-[2px]" />
            <div className="w-2 h-2 bg-emerald-200 dark:bg-emerald-900 rounded-[2px]" />
            <div className="w-2 h-2 bg-emerald-400 dark:bg-emerald-700 rounded-[2px]" />
            <div className="w-2 h-2 bg-emerald-600 dark:bg-emerald-500 rounded-[2px]" />
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
      const goodHabitsCount = habits?.filter(h => h.type !== 'bad').length || 0;
      const badHabitsCount = habits?.filter(h => h.type === 'bad').length || 0;
      
      return { thisWeek, lastWeek, diff, trend, peakHour, goodHabitsCount, badHabitsCount };
    })();

    if (!stats) return null;

    return (
      <div className="space-y-4 mt-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
            <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1">Horário de Pico</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-zinc-900 dark:text-white">{stats.peakHour}:00</span>
              <span className="text-zinc-400 text-xs font-medium">h</span>
            </div>
            <p className="text-zinc-400 text-[9px] mt-1 leading-tight">Quando você é mais constante</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
            <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1">Relatório Semanal</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-zinc-900 dark:text-white">{stats.thisWeek}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stats.diff >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-orange-50 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400'}`}>
                {stats.diff >= 0 ? '+' : ''}{stats.diff}
              </span>
            </div>
            <p className="text-zinc-400 text-[9px] mt-1 leading-tight">
              {stats.diff >= 0 ? 'Desempenho superior' : 'Abaixo'} da semana passada
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xl font-black text-zinc-900 dark:text-white">{stats.goodHabitsCount}</span>
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">Bons Hábitos</span>
            </div>
            <div className="w-px h-8 bg-zinc-100 dark:bg-zinc-800" />
            <div className="flex flex-col">
              <span className="text-xl font-black text-zinc-900 dark:text-white">{stats.badHabitsCount}</span>
              <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter">Maus Hábitos</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider">Foco Atual</p>
            <p className="text-zinc-900 dark:text-zinc-100 text-xs font-black">
              {stats.goodHabitsCount >= stats.badHabitsCount ? 'Construção' : 'Disciplina'}
            </p>
          </div>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-xs text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-zinc-900 dark:text-white font-black mb-2">Ops! Algo deu errado.</p>
          <p className="text-zinc-500 text-xs mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold text-sm"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }

  if (!habits || !userStats) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-white rounded-full animate-spin"></div>
          <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest animate-pulse">Sincronizando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 text-zinc-900 dark:text-zinc-100 selection:bg-zinc-200 transition-colors duration-500 pb-40">
      <header className="mb-8 max-w-md mx-auto pt-8 text-center relative">
        <button 
          onClick={() => setDarkMode(!darkMode)}
          className="absolute right-0 top-8 p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all active:scale-95"
        >
          {darkMode ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 9h-1m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-white">Hábitos</h1>
        <div className="mt-2 flex justify-center items-center gap-2">
          <span className="h-px w-8 bg-zinc-300 dark:bg-zinc-800"></span>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs font-medium uppercase tracking-widest">Vamos ver até onde vai</p>
          <span className="h-px w-8 bg-zinc-300 dark:bg-zinc-800"></span>
        </div>

        {userStats && (
          <div className="mt-8 px-4">
            <div className="flex justify-between items-end mb-2">
              <div className="flex items-baseline gap-2">
                <span className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Nível</span>
                <span className="text-2xl font-black text-zinc-900 dark:text-white">{userStats.level}</span>
              </div>
              <span className="text-zinc-400 text-[10px] font-bold uppercase">{userStats.xp} / {userStats.level * 100} XP</span>
            </div>
            <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner p-0.5">
              <div 
                className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                style={{ width: `${(userStats.xp / (userStats.level * 100)) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <main className="max-w-md mx-auto">
        {activeTab === 'checklist' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {totalActiveHabits > 0 ? (
              <>
                <div className="mb-10 space-y-6">
                  {goodHabitsToday.length > 0 && (
                    <div className="px-4">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">Bons Hábitos</span>
                        <span className="text-zinc-900 dark:text-white font-black text-sm">{goodProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-700 ease-out"
                          style={{ width: `${goodProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {badHabitsToday.length > 0 && (
                    <div className="px-4">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest">Maus Hábitos</span>
                        <span className="text-zinc-900 dark:text-white font-black text-sm">{badProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-rose-500 transition-all duration-700 ease-out"
                          style={{ width: `${badProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {activeHabitsToday.map((habit) => (
                    <div
                      key={habit.id}
                      className={`group flex items-center justify-between p-5 bg-white dark:bg-zinc-900 rounded-3xl border shadow-sm transition-all hover:shadow-md ${
                        habit.type === 'bad' 
                          ? 'border-rose-100 dark:border-rose-900/30' 
                          : 'border-zinc-100 dark:border-zinc-800'
                      }`}
                    >
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-lg leading-tight ${
                            habit.type === 'bad' ? 'text-rose-900 dark:text-rose-100' : 'text-zinc-800 dark:text-zinc-100'
                          }`}>
                            {habit.title}
                          </span>
                          {habit.type === 'bad' && (
                            <span className="text-rose-400 text-[10px] font-black uppercase tracking-tighter">(Falhei)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-orange-500 text-xs">🔥</span>
                            <span className="text-zinc-500 text-xs font-bold">{getEffectiveStreak(habit)} dias</span>
                          </div>
                          {habit.type === 'bad' && (
                            <span className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md">Evitar</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleDraft(habit.id)}
                        disabled={habit.lastCompleted === todayTimestamp}
                        className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-all border-2 
                          ${isHabitCompleted(habit)
                            ? habit.type === 'bad'
                              ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/50 text-rose-600 dark:text-rose-400'
                              : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-transparent hover:border-zinc-400 dark:hover:border-zinc-500'
                          } ${pendingToggles.has(habit.id) ? 'opacity-60 ring-2 ring-zinc-500/20 shadow-xl' : ''} ${habit.lastCompleted === todayTimestamp ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-20 text-center">
                <div className="text-5xl mb-6 opacity-20 grayscale">🛋️</div>
                <p className="text-zinc-400 font-bold text-sm uppercase tracking-widest">Nada agendado para hoje</p>
                <button 
                  onClick={() => setActiveTab('manage')}
                  className="mt-6 text-zinc-900 dark:text-white text-xs font-black underline underline-offset-4"
                >
                  Gerenciar Meus Hábitos
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'manage' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-10 text-center">
              <p className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Configuração Contínua</p>
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white">Gerenciar Hábitos</h2>
            </div>

            <form onSubmit={addHabit} className="mb-12">
              <div className="flex flex-col gap-4">
                <div className="flex gap-2 p-2 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 focus-within:border-zinc-400 transition-all">
                  <input
                    type="text"
                    value={newHabit}
                    onChange={(e) => setNewHabit(e.target.value)}
                    placeholder="Nome do novo hábito..."
                    className="flex-1 px-4 py-2 bg-transparent outline-none text-zinc-800 dark:text-zinc-100"
                  />
                  <button className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 py-2 rounded-xl font-black text-xs uppercase hover:scale-105 transition-all">
                    Criar
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setHabitType('good')}
                    className={`flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all font-black text-[10px] uppercase tracking-widest ${
                      habitType === 'good' ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-white border-zinc-100 text-zinc-400'
                    }`}
                  >
                    ✨ Bom Hábito
                  </button>
                  <button
                    type="button"
                    onClick={() => setHabitType('bad')}
                    className={`flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all font-black text-[10px] uppercase tracking-widest ${
                      habitType === 'bad' ? 'bg-rose-50 border-rose-500 text-rose-600' : 'bg-white border-zinc-100 text-zinc-400'
                    }`}
                  >
                    🚫 Mau Hábito
                  </button>
                </div>

                <div className="p-5 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Agendamento Semanal</p>
                  <div className="flex justify-between gap-1">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const next = habitDays.includes(i) ? habitDays.filter(d => d !== i) : [...habitDays, i];
                          if (next.length > 0) setHabitDays(next);
                        }}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all border ${
                          habitDays.includes(i)
                            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-md scale-110 z-10'
                            : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 border-zinc-100 dark:border-zinc-800'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-5 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Já possuo uma sequência de</p>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      value={initialStreak}
                      onChange={(e) => setInitialStreak(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-20 px-4 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 text-center font-black"
                    />
                    <span className="text-zinc-500 font-bold text-xs">dias fazendo este hábito</span>
                  </div>
                </div>
              </div>
            </form>

            <div className="space-y-3">
              <p className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4 ml-2">Hábitos Ativos ({habits.length})</p>
              {habits.map((habit) => (
                <div key={habit.id} className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <div>
                    <p className="font-bold text-zinc-800 dark:text-zinc-100 text-sm">{habit.title}</p>
                    <div className="flex gap-1 mt-1">
                      {[0,1,2,3,4,5,6].map(d => (
                        <div key={d} className={`w-1.5 h-1.5 rounded-full ${habit.days?.includes(d) ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteHabit(habit.id)}
                    className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8 text-center">
              <p className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Relatório de Desempenho</p>
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white">Estatísticas</h2>
            </div>
            {renderStats()}
            {renderHeatmap()}
            
            <div className="mt-12 mb-8 flex flex-col items-center gap-4 py-8 border-t border-zinc-200/50 dark:border-zinc-800">
              <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Configurações & Backup</p>
              <div className="flex gap-4">
                <button 
                  onClick={exportData}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-bold hover:border-zinc-400 dark:hover:border-zinc-600 transition-all shadow-sm"
                >
                  Exportar JSON
                </button>
                <label className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-bold hover:border-zinc-400 dark:hover:border-zinc-600 cursor-pointer transition-all shadow-sm">
                  Importar
                  <input type="file" className="hidden" accept=".json" onChange={importData} />
                </label>
              </div>
            </div>
          </div>
        )}

        {pendingToggles.size > 0 && activeTab === 'checklist' && (
          <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 animate-bounce-subtle">
            <button 
              onClick={saveChanges}
              className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black shadow-2xl shadow-emerald-500/40 hover:bg-emerald-600 active:scale-95 transition-all flex items-center gap-3 border-2 border-white/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              Salvar Alterações
            </button>
          </div>
        )}
      </main>

      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <div className="flex gap-2 p-1.5 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-800/50 rounded-full shadow-2xl shadow-zinc-900/10">
          <button
            onClick={() => setActiveTab('checklist')}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest transition-all ${
              activeTab === 'checklist'
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-lg scale-105'
                : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            Checklist
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest transition-all ${
              activeTab === 'manage'
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-lg scale-105'
                : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            Gerenciar
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest transition-all ${
              activeTab === 'stats'
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-lg scale-105'
                : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            Estatísticas
          </button>
        </div>
      </nav>
    </div>
  );
}