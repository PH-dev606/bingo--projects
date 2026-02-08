


import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Trophy as TrophyIcon, Star, Users, Medal, 
  ShieldAlert, Coins, X, ShoppingCart, Sparkles, Coffee, BarChart3, CheckCircle2,
  Palette, ChevronRight, Lock
} from 'lucide-react';
import { generateBoard, checkWin } from './utils';
import { BingoBoard, GameState, GameMode, ChatMessage, Competitor, GameStats, StoreItem, Trophy } from './types';
import { getBingoCommentStream } from './geminiService';
import { playDrawSound, playMarkSound, playWinSound } from './soundUtils';
import confetti from 'canvas-confetti';

const STORE_ITEMS: StoreItem[] = [
  { id: 'theme-classic', name: 'Tema Clean', price: 0, type: 'THEME', value: 'border-white bg-white', description: 'O clássico branco minimalista.' },
  { id: 'theme-neon', name: 'Tema Neon', price: 50, type: 'THEME', value: 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)] bg-slate-900 !text-cyan-50', description: 'O brilho da quermesse tecnológica!' },
  { id: 'theme-gold', name: 'Tema Real', price: 150, type: 'THEME', value: 'border-yellow-600 bg-amber-50 shadow-xl', description: 'Pura ostentação na paróquia.' },
  { id: 'title-lucky', name: 'Sorte Brava', price: 20, type: 'TITLE', value: 'Sorte Brava 🍀', description: 'Pra quem nunca erra o milho.' },
  { id: 'title-king', name: 'Rei do Milho', price: 40, type: 'TITLE', value: 'Rei do Milho 🌽', description: 'O título mais cobiçado.' },
  { id: 'title-legend', name: 'Lenda do Globo', price: 100, type: 'TITLE', value: 'Lenda do Globo 🏆', description: 'Respeitado em todas as vilas.' },
];

const INITIAL_STATS: GameStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  coins: 0,
  inventory: ['theme-classic'],
  equipped: { theme: 'theme-classic', title: '', icon: '' },
  trophies: [],
  tournamentRound: 0,
};

const COLUMN_CONFIG = [
  { letter: 'B', color: 'bg-blue-600' },
  { letter: 'I', color: 'bg-red-600' },
  { letter: 'N', color: 'bg-amber-500' },
  { letter: 'G', color: 'bg-emerald-600' },
  { letter: 'O', color: 'bg-purple-600' },
];

const ALL_COMPETITORS = [
  { id: '1', name: 'Seu Juvêncio', color: 'bg-emerald-600' },
  { id: '2', name: 'Robô-Bingo', color: 'bg-indigo-600' },
  { id: '3', name: 'Dona Neide', color: 'bg-rose-600' },
];

const App: React.FC = () => {
  const [board, setBoard] = useState<BingoBoard>(generateBoard());
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [gameState, setGameState] = useState<GameState>('HOME');
  const [gameMode, setGameMode] = useState<GameMode>('FRIENDLY');
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [lastError, setLastError] = useState<{row: number, col: number} | null>(null);
  
  const [stats, setStats] = useState<GameStats>(() => {
    const saved = localStorage.getItem('bingo_stats_v20');
    return saved ? JSON.parse(saved) : INITIAL_STATS;
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('bingo_stats_v20', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, isTyping]);

  const initGame = (mode: GameMode) => {
    setGameMode(mode);
    setLastError(null);
    const ais = ALL_COMPETITORS.map(c => ({
      ...c, board: generateBoard(), isWinner: false, isEliminated: false, progress: 0, qualified: false, dot: ''
    }));
    setCompetitors(ais as Competitor[]);
    setBoard(generateBoard());
    setDrawnNumbers([]);
    setCurrentNumber(null);
    setChatMessages([{ role: 'announcer', text: mode === 'TOURNAMENT' ? `Rodada ${stats.tournamentRound + 1} do Torneio! Valendo a vaga!` : "Amistoso valendo 5 moedas! Boa sorte!" }]);
    setGameState('PLAYING');
  };

  const draw = useCallback(async () => {
    if (isCalling || gameState !== 'PLAYING' || drawnNumbers.length >= 75) return;
    setIsCalling(true);
    playDrawSound();
    let n: number;
    do { n = Math.floor(Math.random() * 75) + 1; } while (drawnNumbers.includes(n));
    await new Promise(r => setTimeout(r, 600));
    
    const updatedAIs = competitors.map(c => {
      const nb = c.board.map(r => r.map(cell => cell.value === n ? { ...cell, marked: true } : cell));
      if (checkWin(nb) && !c.qualified) c.qualified = true;
      return { ...c, board: nb, progress: (nb.flat().filter(x => x.marked).length / 25) * 100 };
    });

    setDrawnNumbers(prev => [...prev, n]);
    setCurrentNumber(n);
    setCompetitors(updatedAIs);
    
    // Controle rigoroso de mensagens para mobile
    setChatMessages(prev => prev.length > 5 ? prev.slice(1) : prev);

    if (updatedAIs.some(c => c.qualified)) {
      setGameState('LOST');
      setIsCalling(false);
      if (gameMode === 'TOURNAMENT') {
        setStats(prev => ({ ...prev, tournamentRound: 0 })); // Reseta se perder torneio
      }
      return;
    }
    setIsCalling(false);

    const stream = getBingoCommentStream(n);
    setIsTyping(true);
    setChatMessages(prev => [...prev, { role: 'announcer', text: '' }]);
    let full = "";
    for await (const chunk of stream) {
      full += chunk;
      setChatMessages(prev => {
        const up = [...prev];
        up[up.length - 1] = { ...up[up.length - 1], text: full };
        return up;
      });
    }
    setIsTyping(false);
  }, [drawnNumbers, gameState, isCalling, competitors, gameMode, stats.tournamentRound]);

  const handleWin = () => {
    setGameState('WON');
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    playWinSound();

    let coinsEarned = 0;
    let newTrophies = [...stats.trophies];
    let newRound = stats.tournamentRound;

    if (gameMode === 'FRIENDLY') {
      coinsEarned = 5;
    } else {
      // Torneio
      if (stats.tournamentRound < 4) {
        coinsEarned = 8;
        newRound += 1;
      } else {
        // GANHOU A FINAL
        coinsEarned = 25;
        newRound = 0;
        const epicTrophy: Trophy = {
          id: `trophy-${Date.now()}`,
          name: 'Troféu Épico da Quermesse',
          description: 'Campeão invicto do Grande Torneio.',
          date: new Date().toLocaleDateString(),
          tier: 'EPIC'
        };
        newTrophies.push(epicTrophy);
      }
    }

    setStats(prev => ({ 
      ...prev, 
      coins: prev.coins + coinsEarned,
      gamesPlayed: prev.gamesPlayed + 1,
      gamesWon: prev.gamesWon + 1,
      trophies: newTrophies,
      tournamentRound: newRound
    }));
  };

  const mark = (r: number, c: number) => {
    if (gameState !== 'PLAYING') return;
    const cell = board[r][c];
    if (cell.marked) return;
    if (drawnNumbers.includes(cell.value as number)) {
      playMarkSound();
      const nb = board.map((row, ri) => row.map((cel, ci) => ri === r && ci === c ? { ...cel, marked: true } : cel));
      setBoard(nb);
      if (checkWin(nb)) handleWin();
    } else {
      setLastError({row: r, col: c});
      setTimeout(() => setLastError(null), 300);
    }
  };

  const equippedThemeClass = STORE_ITEMS.find(i => i.id === stats.equipped.theme)?.value || 'border-white bg-white';
  const playerTitle = STORE_ITEMS.find(i => i.id === stats.equipped.title)?.value || '';

  // VIEWS
  if (gameState === 'HOME') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center mb-10 animate-float">
          <h1 className="text-[80px] sm:text-[150px] font-black text-[#e11d48] drop-shadow-[0_8px_0_rgba(159,18,57,0.1)] leading-none">BINGO!</h1>
          <p className="text-lg text-slate-400 font-medium italic -mt-2">"A maior quermesse digital do mundo!"</p>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 w-full max-w-5xl">
           <button onClick={() => setGameState('TOURNAMENT_PROGRESS')} className="bg-white rounded-3xl p-6 flex flex-col items-center justify-between home-card-shadow transition-all hover:-translate-y-1 border border-slate-50">
             <TrophyIcon size={40} className="text-amber-500 mb-4" />
             <span className="font-black text-sm text-slate-800 uppercase mb-4 text-center">Torneio</span>
             <div className="bg-[#e11d48] text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest">Jogar</div>
           </button>

           <button onClick={() => initGame('FRIENDLY')} className="bg-white rounded-3xl p-6 flex flex-col items-center justify-between home-card-shadow transition-all hover:-translate-y-1 border border-slate-50">
             <Coffee size={40} className="text-blue-500 mb-4" />
             <span className="font-black text-sm text-slate-800 uppercase mb-4 text-center">Amistoso</span>
             <div className="bg-[#2563eb] text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest">Jogar</div>
           </button>

           <button onClick={() => setGameState('TROPHY_ROOM')} className="bg-white rounded-3xl p-6 flex flex-col items-center justify-between home-card-shadow transition-all hover:-translate-y-1 border border-slate-50">
             <Medal size={40} className="text-emerald-500 mb-4" />
             <span className="font-black text-sm text-slate-800 uppercase mb-4 text-center">Estante</span>
             <div className="bg-[#059669] text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest">Ver</div>
           </button>

           <button onClick={() => setGameState('STATS')} className="bg-white rounded-3xl p-6 flex flex-col items-center justify-between home-card-shadow transition-all hover:-translate-y-1 border border-slate-50">
             <BarChart3 size={40} className="text-slate-500 mb-4" />
             <span className="font-black text-sm text-slate-800 uppercase mb-4 text-center">Status</span>
             <div className="bg-[#334155] text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest">Stats</div>
           </button>

           <button onClick={() => setGameState('STORE')} className="col-span-2 sm:col-span-1 bg-white rounded-3xl p-6 flex flex-col items-center justify-between home-card-shadow transition-all hover:-translate-y-1 border border-slate-50">
             <ShoppingCart size={40} className="text-orange-500 mb-4" />
             <span className="font-black text-sm text-slate-800 uppercase mb-4 text-center">Loja</span>
             <div className="bg-[#ea580c] text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest">Loja</div>
           </button>
        </div>

        <div className="fixed top-6 right-6 flex items-center gap-2 bg-white px-5 py-3 rounded-full shadow-lg border border-slate-100">
           <Coins className="text-yellow-500" size={18} /> <span className="font-black text-lg text-slate-800">{stats.coins}</span>
        </div>
      </div>
    );
  }

  if (gameState === 'TOURNAMENT_PROGRESS') {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
        <h2 className="text-4xl font-black text-slate-800 mb-8 tracking-tighter">CAMINHO DO CAMPEÃO</h2>
        <div className="space-y-4 w-full max-w-md">
          {[1,2,3,4,5].map(step => {
            const isFinished = stats.tournamentRound >= step;
            const isCurrent = stats.tournamentRound === step - 1;
            const isLocked = stats.tournamentRound < step - 1;
            const label = step === 5 ? "GRANDE FINAL" : `Preliminar ${step}`;

            return (
              <div key={step} className={`p-5 rounded-3xl flex items-center justify-between border transition-all ${isCurrent ? 'bg-white shadow-xl scale-105 border-red-200' : 'bg-slate-100 opacity-60 border-transparent'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${isFinished ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-red-500 text-white' : 'bg-slate-300 text-slate-500'}`}>
                    {isFinished ? <CheckCircle2 size={20}/> : step}
                  </div>
                  <span className="font-bold text-slate-800">{label}</span>
                </div>
                {isCurrent && <button onClick={() => initGame('TOURNAMENT')} className="bg-red-500 text-white px-6 py-2 rounded-full text-xs font-black animate-pulse">JOGAR</button>}
                {isLocked && <Lock size={20} className="text-slate-400"/>}
              </div>
            );
          })}
        </div>
        <button onClick={() => setGameState('HOME')} className="mt-10 font-bold text-slate-400 uppercase tracking-widest">Voltar</button>
      </div>
    );
  }

  if (gameState === 'TROPHY_ROOM') {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex flex-col items-center">
        <header className="w-full max-w-4xl flex justify-between items-center mb-10">
          <h2 className="text-4xl font-black text-slate-800 tracking-tighter">MINHA ESTANTE</h2>
          <button onClick={() => setGameState('HOME')} className="p-3 bg-white rounded-2xl shadow-sm"><X size={24}/></button>
        </header>

        {/* Estante de Vidro */}
        <div className="w-full max-w-4xl bg-white/40 backdrop-blur-md rounded-[50px] p-8 md:p-12 shadow-2xl border border-white/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8">
            {stats.trophies.length === 0 ? (
              <div className="col-span-full py-20 text-center">
                <Medal size={80} className="mx-auto text-slate-300 mb-4 opacity-20" />
                <p className="text-slate-400 font-bold uppercase tracking-widest">Nenhum troféu ainda.<br/>Vença um Torneio!</p>
              </div>
            ) : (
              stats.trophies.map(t => (
                <div key={t.id} className="group relative flex flex-col items-center animate-in zoom-in duration-500">
                  <div className="w-full aspect-square bg-gradient-to-b from-slate-50 to-slate-200 rounded-3xl mb-4 flex items-center justify-center shadow-inner relative overflow-hidden">
                    <TrophyIcon size={64} className={`${t.tier === 'EPIC' ? 'text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'text-slate-400'} group-hover:scale-110 transition-transform`} />
                    <div className="absolute bottom-2 bg-black/5 px-3 py-1 rounded-full text-[8px] font-black uppercase text-slate-500 tracking-widest">{t.tier}</div>
                  </div>
                  <p className="font-black text-xs text-slate-800 text-center uppercase leading-tight">{t.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{t.date}</p>
                </div>
              ))
            )}
          </div>
          
          {/* Prateleira de vidro visual */}
          <div className="h-4 bg-white/30 backdrop-blur-sm mt-10 rounded-full border-b border-white/20 shadow-sm" />
        </div>
      </div>
    );
  }

  if (gameState === 'STORE') {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
        <header className="w-full max-w-4xl flex justify-between items-center mb-10">
          <h2 className="text-4xl font-black text-slate-800 tracking-tighter">LOJA</h2>
          <div className="flex items-center gap-4">
            <div className="bg-white px-5 py-2 rounded-full shadow-sm border border-slate-100 flex items-center gap-2">
              <Coins className="text-yellow-500" size={16}/> <span className="font-black text-slate-800">{stats.coins}</span>
            </div>
            <button onClick={() => setGameState('HOME')} className="p-3 bg-white rounded-2xl shadow-sm"><X size={24}/></button>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {STORE_ITEMS.map(item => {
            const isOwned = stats.inventory.includes(item.id);
            const isEquipped = stats.equipped.theme === item.id || stats.equipped.title === item.id;
            
            return (
              <div key={item.id} className="bg-white rounded-[40px] p-6 shadow-lg border border-slate-50 flex flex-col justify-between transition-all hover:-translate-y-1">
                <div>
                  <div className={`w-full aspect-video rounded-3xl mb-4 flex items-center justify-center border ${item.type === 'THEME' ? 'bg-slate-50' : 'bg-amber-50'}`}>
                    {item.type === 'TITLE' ? <span className="font-black text-lg italic text-slate-700">{item.value}</span> : <Palette size={40} className="text-slate-300" />}
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-1">{item.name}</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-4">{item.description}</p>
                </div>

                {isOwned ? (
                  <button onClick={() => setStats(prev => ({ ...prev, equipped: { ...prev.equipped, [item.type.toLowerCase()]: item.id } }))} className={`w-full py-3 rounded-2xl font-black text-xs uppercase tracking-widest ${isEquipped ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {isEquipped ? 'Equipado' : 'Equipar'}
                  </button>
                ) : (
                  <button onClick={() => stats.coins >= item.price && setStats(prev => ({ ...prev, coins: prev.coins - item.price, inventory: [...prev.inventory, item.id] }))} disabled={stats.coins < item.price} className="w-full bg-[#ea580c] text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-100 disabled:opacity-30 flex items-center justify-center gap-2">
                    <Coins size={14}/> {item.price} - Comprar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // JOGO PRINCIPAL
  return (
    <div className={`min-h-screen flex flex-col items-center p-4 sm:p-8 bg-slate-50`}>
      <header className="w-full max-w-6xl flex justify-between items-center mb-6">
        <div className="flex items-center gap-3 bg-white p-2 sm:p-3 rounded-2xl shadow-sm border border-slate-100">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold text-lg sm:text-xl">C</div>
          <div className="hidden sm:block">
            <p className="font-bold text-slate-800 text-xs uppercase tracking-tight">CHICO DO GLOBO</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Rádio Quermesse</p>
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#e11d48] tracking-tighter">BINGO!</h1>
        <button onClick={() => setGameState('HOME')} className="p-2 bg-white rounded-xl shadow-sm"><X size={24} className="text-slate-400" /></button>
      </header>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Lado Esquerdo - Chamada */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="bg-white p-6 sm:p-10 rounded-[40px] shadow-xl border border-slate-50 text-center">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-4">Número Chamado</p>
            <div className={`text-[80px] sm:text-[100px] font-black tracking-tighter leading-none text-slate-800 ${isCalling ? 'opacity-20 blur-sm' : 'animate-in zoom-in duration-300'}`}>
              {currentNumber || '--'}
            </div>
            <button onClick={draw} disabled={isCalling || gameState !== 'PLAYING'} className="mt-6 w-full bg-[#e11d48] text-white font-black text-lg py-4 sm:py-5 rounded-[25px] shadow-lg shadow-red-100 active:translate-y-1 disabled:opacity-30 uppercase tracking-widest transition-all">
              GIRAR GLOBO
            </button>
          </div>

          <div className="hidden lg:block bg-white p-6 rounded-[32px] shadow-sm border border-slate-50">
             <h3 className="font-black text-slate-800 text-[10px] mb-4 flex items-center gap-2 tracking-widest uppercase"><Users size={14} className="text-blue-500"/> OPONENTES</h3>
             <div className="space-y-4">
               {competitors.map(ai => (
                 <div key={ai.id}>
                   <div className="flex justify-between text-[9px] font-black uppercase mb-1">
                     <span className="text-slate-500">{ai.name}</span>
                     <span className="text-slate-800">{ai.progress.toFixed(0)}%</span>
                   </div>
                   <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                     <div className={`h-full transition-all duration-1000 ${ai.color}`} style={{width: `${ai.progress}%`}} />
                   </div>
                 </div>
               ))}
             </div>
          </div>
        </aside>

        {/* Central - Cartela */}
        <section className="lg:col-span-6 flex flex-col items-center order-first lg:order-none">
          <div className={`p-4 sm:p-8 rounded-[40px] sm:rounded-[50px] border-[10px] sm:border-[16px] relative w-full transition-all duration-700 bg-white ${equippedThemeClass} shadow-2xl`}>
            <div className="grid grid-cols-5 gap-2 sm:gap-4 mb-6 sm:mb-8">
              {COLUMN_CONFIG.map((cfg) => (
                <div key={cfg.letter} className={`${cfg.color} w-8 h-8 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white font-black text-lg sm:text-4xl shadow-md border-b-2 sm:border-b-4 border-black/20`}>
                  {cfg.letter}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {board.map((row, ri) => row.map((cell, ci) => {
                const isMarked = cell.marked && cell.value !== "FREE";
                const isCalled = !cell.marked && cell.value !== "FREE" && drawnNumbers.includes(cell.value as number);
                return (
                  <button key={`${ri}-${ci}`} onClick={() => mark(ri, ci)} disabled={cell.marked || gameState !== 'PLAYING'} className={`relative aspect-square rounded-xl sm:rounded-3xl flex items-center justify-center text-xl sm:text-4xl font-black border-b-2 sm:border-b-4 transition-all ${cell.value === "FREE" ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-100 active:scale-95'} ${isCalled ? 'animate-hint-pulse z-10' : ''} ${lastError?.row === ri && lastError?.col === ci ? 'animate-error border-red-500' : ''}`}>
                    {isMarked && <div className="absolute inset-1 sm:inset-2 bg-blue-600 rounded-full animate-mark-ink flex items-center justify-center text-white shadow-inner text-sm sm:text-3xl">{cell.value}</div>}
                    {!isMarked && (cell.value === "FREE" ? <Star fill="#cbd5e1" className="text-slate-300 w-6 h-6 sm:w-10 sm:h-10" /> : <span className="text-slate-800">{cell.value}</span>)}
                  </button>
                );
              }))}
            </div>
          </div>
          {playerTitle && <div className="mt-4 bg-slate-900 text-white px-8 py-2 rounded-full font-black text-xs sm:text-sm shadow-xl flex items-center gap-2 animate-bounce"><Sparkles size={16} className="text-yellow-400"/> {playerTitle}</div>}
        </section>

        {/* Direito - Chat */}
        <aside className="lg:col-span-3 h-[250px] lg:h-[600px] flex flex-col bg-slate-900 rounded-[30px] sm:rounded-[40px] overflow-hidden shadow-2xl">
          <div className="bg-slate-800 p-4 flex items-center gap-3 border-b border-slate-700">
            <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse shadow-[0_0_10px_rgba(225,29,72,0.8)]" />
            <p className="font-black text-white text-xs tracking-widest uppercase">RADIO QUERMESSE</p>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/40 custom-scrollbar">
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'announcer' ? 'justify-start' : 'justify-end'} animate-in slide-in-from-bottom-2`}>
                <div className={`max-w-[90%] p-3 rounded-2xl text-[11px] font-bold shadow-md border ${m.role === 'announcer' ? 'bg-white text-slate-800 border-slate-200 rounded-tl-none' : 'bg-blue-600 text-white border-blue-400 rounded-tr-none'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isTyping && <div className="bg-slate-800 w-10 h-5 rounded-full flex gap-1 items-center justify-center animate-pulse"><div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"/><div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"/><div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"/></div>}
          </div>
        </aside>
      </div>

      {(gameState === 'WON' || gameState === 'LOST') && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[1000] flex items-center justify-center p-4">
           <div className="bg-white p-10 rounded-[40px] text-center shadow-2xl max-w-sm w-full animate-in zoom-in duration-300">
              {gameState === 'WON' ? <TrophyIcon size={80} className="text-yellow-500 mx-auto mb-6 animate-bounce" /> : <ShieldAlert size={80} className="text-slate-200 mx-auto mb-6" />}
              <h2 className="text-6xl font-black text-slate-900 mb-2 tracking-tighter">{gameState === 'WON' ? 'BINGO!' : 'AZAR!'}</h2>
              <p className="text-[10px] text-slate-400 mb-8 uppercase font-black tracking-widest">{gameState === 'WON' ? 'O pé quente da paróquia!' : 'Fica triste não, cristão...'}</p>
              
              <div className="bg-slate-50 p-6 rounded-3xl mb-8 border border-slate-100 flex justify-between items-center">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prêmio</p>
                   <p className="text-3xl font-black text-slate-800 flex items-center gap-2"><Coins size={24} className="text-yellow-500"/> {gameState === 'WON' ? (gameMode === 'FRIENDLY' ? 5 : (stats.tournamentRound === 0 ? 25 : 8)) : 0}</p>
              </div>
              <div className="grid gap-3">
                 <button onClick={() => { if(gameMode === 'TOURNAMENT' && gameState === 'WON') setGameState('TOURNAMENT_PROGRESS'); else initGame(gameMode); }} className="w-full bg-[#e11d48] text-white font-black py-5 rounded-[25px] text-xl shadow-xl shadow-red-100 active:scale-95 transition-all uppercase tracking-widest">Continuar</button>
                 <button onClick={() => setGameState('HOME')} className="w-full text-slate-400 font-bold py-3 rounded-2xl text-sm uppercase tracking-widest">Início</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
