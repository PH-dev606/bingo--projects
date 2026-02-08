

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  RotateCcw, Trophy, Star, BarChart3, Radio, Coffee, Users, Check, Medal, 
  Award, Flag, Sparkles, PartyPopper, Crown, ArrowDown, ShieldAlert, 
  ShoppingBag, Palette, UserCircle, Coins, ChevronRight, Lock, Map, Swords
} from 'lucide-react';
import { generateBoard, checkWin } from './utils';
import { BingoBoard, GameState, GameMode, ChatMessage, Competitor, GameStats, StoreItem } from './types';
import { getBingoCommentStream } from './geminiService';
import { playDrawSound, playMarkSound, playWinSound, playTriumphantFanfare } from './soundUtils';
import confetti from 'canvas-confetti';

const ALL_COMPETITORS = [
  { id: '1', name: 'Seu Juvêncio', color: 'bg-emerald-500', dot: '#10b981' },
  { id: '2', name: 'Robô-Bingo', color: 'bg-purple-500', dot: '#a855f7' },
  { id: '3', name: 'Sertanejo Bão', color: 'bg-green-700', dot: '#15803d' },
  { id: '4', name: 'Dona Neide', color: 'bg-pink-500', dot: '#ec4899' },
  { id: '5', name: 'Gamer do Milho', color: 'bg-cyan-500', dot: '#06b6d4' },
  { id: '6', name: 'Professor Azaia', color: 'bg-slate-700', dot: '#334155' },
  { id: '7', name: 'Zé do Trevo', color: 'bg-lime-500', dot: '#84cc16' },
  { id: '8', name: 'Tia do Doce', color: 'bg-orange-400', dot: '#fb923c' },
  { id: '9', name: 'Mestre Cuca', color: 'bg-red-600', dot: '#dc2626' },
  { id: '10', name: 'Cigana da Sorte', color: 'bg-indigo-500', dot: '#6366f1' },
  { id: '11', name: 'Vovô Radinho', color: 'bg-amber-800', dot: '#92400e' },
  { id: '12', name: 'Menino do Milho', color: 'bg-yellow-400', dot: '#facc15' },
];

const STORE_ITEMS: StoreItem[] = [
  { id: 'theme-neon', name: 'Tema Neon', price: 150, type: 'THEME', value: 'border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.6)] bg-slate-900 !text-cyan-50', description: 'Sua cartela brilha no escuro!' },
  { id: 'theme-gold', name: 'Tema Real', price: 500, type: 'THEME', value: 'border-yellow-600 bg-gradient-to-br from-amber-50 to-yellow-100 shadow-2xl', description: 'A cartela mais luxuosa da paróquia.' },
  { id: 'theme-retro', name: 'Tema Retrô', price: 80, type: 'THEME', value: 'border-amber-800 bg-orange-50 font-mono', description: 'Estilo clássico dos anos 80.' },
  { id: 'title-lucky', name: 'Sorte Brava', price: 40, type: 'TITLE', value: 'Sorte Brava 🍀', description: 'Para quem nunca erra o milho.' },
  { id: 'title-king', name: 'O Rei do Milho', price: 200, type: 'TITLE', value: 'Rei do Milho 🌽', description: 'Respeitado em todas as barracas.' },
  { id: 'title-legend', name: 'Lenda Urbana', price: 400, type: 'TITLE', value: 'Lenda Urbana 👻', description: 'O terror dos oponentes.' },
  { id: 'title-expert', name: 'Mestre do Globo', price: 100, type: 'TITLE', value: 'Mestre do Globo 🌎', description: 'Conhece cada rima do Chico.' },
  { id: 'title-rich', name: 'Barão do Bingo', price: 1000, type: 'TITLE', value: 'Barão do Bingo 💰', description: 'Pura ostentação de geminicoins.' },
];

const INITIAL_STATS: GameStats = {
  gamesPlayed: 0, gamesWon: 0, totalBallsDrawn: 0, totalCorrectMarks: 0, totalPossibleMarks: 0, bestWinBalls: null,
  coins: 0, // Inicia com 0 moedas como solicitado
  inventory: [],
  equipped: { theme: '', title: '', icon: '' },
  trophies: { gold: 0, silver: 0, bronze: 0, preliminary: 0, finalist: 0 }
};

const COLUMN_THEMES = [
  { letter: 'B', line: 'bg-blue-600' }, { letter: 'I', line: 'bg-red-600' }, { letter: 'N', line: 'bg-orange-500' }, 
  { letter: 'G', line: 'bg-emerald-600' }, { letter: 'O', line: 'bg-indigo-600' },
];

const App: React.FC = () => {
  const [board, setBoard] = useState<BingoBoard>(generateBoard());
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [gameState, setGameState] = useState<GameState>('HOME');
  const [gameMode, setGameMode] = useState<GameMode>('FRIENDLY');
  const [tournamentStep, setTournamentStep] = useState(1); 
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [rollingNumber, setRollingNumber] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [victoryFlash, setVictoryFlash] = useState(false);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [lastMarkedPos, setLastMarkedPos] = useState<{row: number, col: number} | null>(null);
  const [lastError, setLastError] = useState<{row: number, col: number} | null>(null);
  
  const [stats, setStats] = useState<GameStats>(() => {
    const saved = localStorage.getItem('bingo_stats_v9');
    return saved ? JSON.parse(saved) : INITIAL_STATS;
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const bingoCardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState<number>(0);

  useEffect(() => {
    localStorage.setItem('bingo_stats_v9', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    const updateHeight = () => {
      if (bingoCardRef.current) setCardHeight(bingoCardRef.current.offsetHeight);
    };
    const timer = setTimeout(updateHeight, 100);
    window.addEventListener('resize', updateHeight);
    return () => { window.removeEventListener('resize', updateHeight); clearTimeout(timer); };
  }, [gameState]);

  const handleChatScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
    if (isAtBottom) setHasNewMessages(false);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      setAutoScroll(true);
      setHasNewMessages(false);
    }
  };

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: isTyping ? 'auto' : 'smooth' });
    } else if (!autoScroll && chatMessages.length > 1) {
      setHasNewMessages(true);
    }
  }, [chatMessages, isTyping]);

  const calculateFinalRankings = useCallback(() => {
    const playerProgress = (board.flat().filter(c => c.marked).length / 25) * 100;
    const results = [
      { id: 'player', name: 'Você', progress: playerProgress, isPlayer: true },
      ...competitors.map(c => ({ id: c.id, name: c.name, progress: c.progress, isPlayer: false }))
    ].sort((a, b) => b.progress - a.progress);

    const rank = results.findIndex(r => r.isPlayer) + 1;
    setPlayerRank(rank);

    let earnedCoins = 0;
    if (gameMode === 'TOURNAMENT') {
      if (rank === 1) earnedCoins = 25;
      else if (rank === 2) earnedCoins = 15;
      else if (rank === 3) earnedCoins = 8;
    } else if (gameMode === 'FRIENDLY') {
      if (rank === 1) earnedCoins = 5;
    }

    setStats(prev => {
      const newTrophies = { ...prev.trophies };
      if (gameMode === 'TOURNAMENT') {
        if (tournamentStep === 5 && rank === 1) newTrophies.finalist += 1;
        else if (rank === 1) newTrophies.preliminary += 1;
        
        if (rank === 1) newTrophies.gold += 1;
        else if (rank === 2) newTrophies.silver += 1;
        else if (rank === 3) newTrophies.bronze += 1;
      }
      return { ...prev, coins: prev.coins + earnedCoins, trophies: newTrophies };
    });
  }, [board, competitors, gameMode, tournamentStep]);

  useEffect(() => {
    if (gameState === 'WON' || gameState === 'LOST') {
      calculateFinalRankings();
      if (gameState === 'WON') {
        setVictoryFlash(true);
        setIsCelebrating(true);
        setTimeout(() => setVictoryFlash(false), 300);
        setTimeout(() => setIsCelebrating(false), 5000);
        playWinSound(); setTimeout(playTriumphantFanfare, 600);
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        setStats(prev => ({ ...prev, gamesWon: prev.gamesWon + 1 }));
      }
      setStats(prev => ({ ...prev, gamesPlayed: prev.gamesPlayed + 1 }));
    }
  }, [gameState, calculateFinalRankings]);

  const initGame = (mode: GameMode, step: number = 1) => {
    setGameMode(mode);
    setTournamentStep(step);
    setPlayerRank(null);
    setLastMarkedPos(null);
    setLastError(null);
    
    // Friendly: fixed 4 AIs. Tournament: scales 3-7 based on round
    const numCompetitors = mode === 'FRIENDLY' ? 4 : (3 + (step - 1));
    const pool = [...ALL_COMPETITORS].sort(() => Math.random() - 0.5);
    const ais = pool.slice(0, numCompetitors).map(c => ({
      ...c, board: generateBoard(), isWinner: false, isEliminated: false, progress: 0, qualified: false
    }));
    
    setCompetitors(ais as Competitor[]);
    setBoard(generateBoard());
    setDrawnNumbers([]);
    setCurrentNumber(null);
    setAutoScroll(true);
    
    let welcomeMsg = mode === 'FRIENDLY' 
      ? "Amistoso valendo 5 moedas! Vamos nessa!" 
      : (step === 5 ? "GRANDE FINAL! O bicho vai pegar!" : `Preliminar ${step}. Rumo à vitória!`);
    
    setChatMessages([{ role: 'announcer', text: `Chico do Globo na área! ${welcomeMsg}` }]);
    setGameState('PLAYING');
  };

  const buyItem = (item: StoreItem) => {
    if (stats.coins >= item.price && !stats.inventory.includes(item.id)) {
      setStats(prev => ({
        ...prev,
        coins: prev.coins - item.price,
        inventory: [...prev.inventory, item.id]
      }));
    }
  };

  const equipItem = (item: StoreItem) => {
    setStats(prev => ({
      ...prev,
      equipped: { ...prev.equipped, [item.type.toLowerCase()]: item.id }
    }));
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
      const won = checkWin(nb) !== null;
      if (won && !c.qualified) c.qualified = true;
      return { ...c, board: nb, progress: (nb.flat().filter(x => x.marked).length / 25) * 100 };
    });

    setDrawnNumbers(prev => [...prev, n]);
    setCurrentNumber(n);
    setCompetitors(updatedAIs);
    if (updatedAIs.some(c => c.qualified)) setGameState('LOST');
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
  }, [drawnNumbers, gameState, isCalling, competitors]);

  const mark = (r: number, c: number) => {
    if (gameState !== 'PLAYING') return;
    const cell = board[r][c];
    if (cell.marked) return;
    if (drawnNumbers.includes(cell.value as number)) {
      playMarkSound();
      setLastMarkedPos({row: r, col: c});
      const nb = board.map((row, ri) => row.map((cel, ci) => ri === r && ci === c ? { ...cel, marked: true } : cel));
      setBoard(nb);
      if (checkWin(nb)) setGameState('WON');
    } else {
      setLastError({row: r, col: c});
      setTimeout(() => setLastError(null), 300);
    }
  };

  if (gameState === 'STORE') {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-10 flex flex-col items-center overflow-y-auto">
        <header className="w-full max-w-6xl flex justify-between items-center mb-12">
          <div className="flex flex-col">
            <h1 className="text-6xl font-lucky text-slate-800 uppercase flex items-center gap-4">
              <ShoppingBag className="text-[#ef4444]" size={50} /> Mercado do Chico
            </h1>
            <p className="text-slate-500 font-bold uppercase text-sm flex items-center gap-2">
              <Coins className="text-yellow-500" size={16} /> Seu Tesouro: {stats.coins} moedas
            </p>
          </div>
          <button onClick={() => setGameState('HOME')} className="bg-red-600 text-white px-8 py-4 rounded-[25px] font-lucky text-2xl shadow-xl hover:scale-105 transition-transform">
             SAIR
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
          {STORE_ITEMS.map(item => {
            const isOwned = stats.inventory.includes(item.id);
            const isEquipped = Object.values(stats.equipped).includes(item.id);
            const canAfford = stats.coins >= item.price;

            return (
              <div key={item.id} className={`bg-white p-8 rounded-[40px] shadow-lg border-2 transition-all flex flex-col ${isEquipped ? 'border-blue-500 bg-blue-50/30' : 'border-slate-100'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-4 rounded-2xl ${item.type === 'THEME' ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                    {item.type === 'THEME' ? <Palette size={32} /> : <UserCircle size={32} />}
                  </div>
                  <div className="text-right">
                    <p className="font-lucky text-2xl text-slate-800">{item.name}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase">{item.type}</p>
                  </div>
                </div>
                <p className="text-slate-500 mb-8 flex-1 italic">"{item.description}"</p>
                {isOwned ? (
                  <button onClick={() => equipItem(item)} className={`w-full py-4 rounded-2xl font-lucky text-xl uppercase ${isEquipped ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {isEquipped ? 'Equipado' : 'Equipar'}
                  </button>
                ) : (
                  <button onClick={() => buyItem(item)} disabled={!canAfford} className={`w-full py-4 rounded-2xl font-lucky text-xl uppercase flex items-center justify-center gap-2 ${canAfford ? 'bg-yellow-500 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`}>
                    <Coins size={20} /> {item.price} COMPRAR
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (gameState === 'HOME' || gameState === 'TROPHY_ROOM' || gameState === 'BRACKET') {
    if (gameState === 'HOME') {
      return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] overflow-hidden">
          <div className="text-center mb-16">
            <h1 className="text-[10rem] font-lucky text-[#ef4444] drop-shadow-2xl mb-0 leading-none">BINGO!</h1>
            <p className="text-2xl text-slate-500 font-medium italic">"A maior quermesse digital do mundo!"</p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <span className="bg-yellow-100 text-yellow-700 px-6 py-2 rounded-full font-bold text-lg flex items-center gap-2 border-2 border-yellow-200 shadow-sm">
                <Coins size={20} /> {stats.coins} moedas
              </span>
              {stats.equipped.title && (
                <span className="bg-blue-600 text-white px-6 py-2 rounded-full font-lucky text-lg uppercase tracking-widest shadow-lg">
                  {STORE_ITEMS.find(i => i.id === stats.equipped.title)?.value}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 w-full max-w-7xl">
            <div className="bg-white p-8 rounded-[40px] shadow-xl border-b-[12px] border-amber-400 flex flex-col items-center gap-4 hover:-translate-y-2 transition-transform cursor-pointer" onClick={() => initGame('TOURNAMENT')}>
              <div className="bg-amber-50 p-6 rounded-full"><Map size={48} className="text-amber-500" /></div>
              <h2 className="font-lucky text-2xl uppercase text-slate-800">Torneio</h2>
              <button className="bg-red-600 text-white font-lucky py-2 px-8 rounded-full shadow-lg uppercase">Iniciar</button>
            </div>
            <div className="bg-white p-8 rounded-[40px] shadow-xl border-b-[12px] border-blue-500 flex flex-col items-center gap-4 hover:-translate-y-2 transition-transform cursor-pointer" onClick={() => initGame('FRIENDLY')}>
              <div className="bg-blue-50 p-6 rounded-full"><Coffee size={48} className="text-blue-500" /></div>
              <h2 className="font-lucky text-2xl uppercase text-slate-800">Amistoso</h2>
              <button className="bg-blue-600 text-white font-lucky py-2 px-8 rounded-full shadow-lg uppercase">Jogar</button>
            </div>
            <div className="bg-white p-8 rounded-[40px] shadow-xl border-b-[12px] border-[#ef4444] flex flex-col items-center gap-4 hover:-translate-y-2 transition-transform cursor-pointer" onClick={() => setGameState('STORE')}>
              <div className="bg-red-50 p-6 rounded-full"><ShoppingBag size={48} className="text-[#ef4444]" /></div>
              <h2 className="font-lucky text-2xl uppercase text-slate-800">Loja</h2>
              <button className="bg-[#ef4444] text-white font-lucky py-2 px-8 rounded-full shadow-lg uppercase">Mercado</button>
            </div>
            <div className="bg-white p-8 rounded-[40px] shadow-xl border-b-[12px] border-emerald-500 flex flex-col items-center gap-4 hover:-translate-y-2 transition-transform cursor-pointer" onClick={() => setGameState('TROPHY_ROOM')}>
              <div className="bg-emerald-50 p-6 rounded-full"><Award size={48} className="text-emerald-500" /></div>
              <h2 className="font-lucky text-2xl uppercase text-slate-800">Estante</h2>
              <button className="bg-emerald-600 text-white font-lucky py-2 px-8 rounded-full shadow-lg uppercase">Ver</button>
            </div>
            <div className="bg-white p-8 rounded-[40px] shadow-xl border-b-[12px] border-slate-700 flex flex-col items-center gap-4 hover:-translate-y-2 transition-transform cursor-pointer" onClick={() => setGameState('BRACKET')}>
              <div className="bg-slate-100 p-6 rounded-full"><BarChart3 size={48} className="text-slate-700" /></div>
              <h2 className="font-lucky text-2xl uppercase text-slate-800">Status</h2>
              <button className="bg-slate-700 text-white font-lucky py-2 px-8 rounded-full shadow-lg uppercase">Stats</button>
            </div>
          </div>
        </div>
      );
    }

    if (gameState === 'TROPHY_ROOM') {
      return (
        <div className="min-h-screen bg-[#fffbeb] p-10 flex flex-col items-center overflow-y-auto">
          <header className="w-full max-w-5xl flex justify-between items-center mb-16">
             <div className="flex flex-col">
              <h1 className="text-7xl font-lucky text-amber-900 uppercase">Sua Coleção</h1>
              <p className="text-amber-700 font-bold uppercase tracking-widest text-sm">Orgulho da quermesse</p>
             </div>
             <button onClick={() => setGameState('HOME')} className="bg-red-600 text-white p-5 rounded-[25px] font-lucky text-2xl shadow-xl flex items-center gap-3">VOLTAR</button>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-8 w-full max-w-7xl">
            <div className="bg-white p-10 rounded-[45px] shadow-xl flex flex-col items-center gap-4 border-b-8 border-yellow-400">
              <Trophy size={80} className="text-yellow-500" />
              <h3 className="font-lucky text-2xl text-slate-800">OURO</h3>
              <div className="text-7xl font-lucky text-yellow-600">{stats.trophies.gold}</div>
            </div>
            <div className="bg-white p-10 rounded-[45px] shadow-xl flex flex-col items-center gap-4 border-b-8 border-slate-300">
              <Medal size={80} className="text-slate-400" />
              <h3 className="font-lucky text-2xl text-slate-800">PRATA</h3>
              <div className="text-7xl font-lucky text-slate-400">{stats.trophies.silver}</div>
            </div>
            <div className="bg-white p-10 rounded-[45px] shadow-xl flex flex-col items-center gap-4 border-b-8 border-orange-400">
              <Award size={80} className="text-orange-500" />
              <h3 className="font-lucky text-2xl text-slate-800">BRONZE</h3>
              <div className="text-7xl font-lucky text-orange-500">{stats.trophies.bronze}</div>
            </div>
            <div className="bg-white p-10 rounded-[45px] shadow-xl flex flex-col items-center gap-4 border-b-8 border-blue-500">
              <Star size={80} className="text-blue-500" />
              <h3 className="font-lucky text-2xl text-slate-800">PRELIMINAR</h3>
              <div className="text-7xl font-lucky text-blue-600">{stats.trophies.preliminary}</div>
            </div>
            <div className="bg-white p-10 rounded-[45px] shadow-xl flex flex-col items-center gap-4 border-b-8 border-yellow-700 bg-yellow-50">
              <Crown size={80} className="text-yellow-700" />
              <h3 className="font-lucky text-2xl text-slate-800">FINALISTA</h3>
              <div className="text-7xl font-lucky text-yellow-800">{stats.trophies.finalist}</div>
            </div>
          </div>
        </div>
      );
    }
    return <div onClick={() => setGameState('HOME')}>Voltar</div>;
  }

  const equippedThemeClass = STORE_ITEMS.find(i => i.id === stats.equipped.theme)?.value || '';
  const playerTitle = STORE_ITEMS.find(i => i.id === stats.equipped.title)?.value || '';

  return (
    <div className={`min-h-screen flex flex-col items-center p-4 md:p-8 transition-colors duration-1000 ${gameState === 'WON' ? 'bg-yellow-50' : 'bg-[#f1f5f9]'}`}>
      {victoryFlash && <div className="fixed inset-0 bg-white z-[500] animate-pulse pointer-events-none" />}
      
      {isCelebrating && (
        <div className="fixed inset-0 z-[600] pointer-events-none flex items-center justify-center bg-yellow-400/20 backdrop-blur-[2px]">
          <div className="relative flex flex-col items-center animate-in zoom-in text-center px-4">
            <Trophy size={280} className="text-yellow-500 drop-shadow-[0_0_60px_#eab308] animate-bounce" />
            <h2 className="text-[12rem] font-lucky text-yellow-600 leading-none">BINGO!</h2>
          </div>
        </div>
      )}

      <div className="text-center mb-8 relative w-full max-w-4xl">
        <div className="flex items-center justify-between w-full mb-4 px-2">
           <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2">
              <Coins size={16} className="text-yellow-500" />
              <span className="font-bold text-slate-600">{stats.coins}</span>
           </div>
           {gameMode === 'TOURNAMENT' && (
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(step => (
                <div key={step} className={`w-2 h-2 rounded-full ${step === tournamentStep ? 'bg-[#ef4444] scale-150' : step < tournamentStep ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              ))}
            </div>
           )}
           <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2">
              <Users size={16} className="text-blue-500" />
              <span className="font-bold text-slate-600">{competitors.length + 1}</span>
           </div>
        </div>
        <h1 className="text-[6rem] md:text-[8rem] font-lucky text-[#ef4444] drop-shadow-lg leading-none tracking-tighter">BINGO!</h1>
      </div>

      <main className="w-full max-w-[1500px] grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left - Draw & Arena Header */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-8 rounded-[40px] shadow-xl border-4 border-slate-50 text-center">
            <p className="text-xs font-black uppercase text-[#ef4444] mb-2 tracking-[0.2em]">BOLA DA VEZ</p>
            <div className={`text-9xl font-lucky transition-all ${isCalling ? 'blur-sm scale-90 opacity-40' : 'text-slate-800'}`}>
              {isCalling ? rollingNumber : (currentNumber || '--')}
            </div>
            <button onClick={draw} disabled={isCalling || gameState !== 'PLAYING'} 
              className="mt-6 w-full bg-[#ef4444] text-white font-lucky text-4xl py-6 rounded-[35px] shadow-[0_10px_0_rgb(185,28,28)] active:shadow-none active:translate-y-2 disabled:bg-slate-300 disabled:shadow-none uppercase">
              SORTEAR!
            </button>
          </div>
          
          <div className="bg-slate-800 p-8 rounded-[40px] shadow-lg border border-slate-700">
            <div className="flex items-center gap-2 font-lucky text-white uppercase text-xl mb-6">
              <Swords size={24} className="text-[#ef4444]" /> Arena dos Oponentes
            </div>
            <div className="space-y-4 max-h-[450px] overflow-y-auto custom-scrollbar pr-2">
              {competitors.map(ai => (
                <div key={ai.id} className={`p-4 rounded-[30px] border-2 transition-all relative ${ai.progress >= 80 ? 'bg-red-900/30 border-red-500 animate-opponent-hot' : 'bg-slate-900/50 border-slate-700'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="flex items-center gap-2 font-lucky text-white">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ai.dot }} />
                      <span className="text-lg">{ai.name}</span>
                    </span>
                    <span className="font-bold text-slate-400">{ai.progress.toFixed(0)}%</span>
                  </div>
                  <div className="h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div className={`h-full transition-all duration-1000 ${ai.color}`} style={{ width: `${ai.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center - Player Board */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div ref={bingoCardRef} className={`bg-white p-10 rounded-[60px] shadow-2xl border-[16px] relative w-full overflow-hidden transition-all duration-500 ${gameState === 'WON' ? 'winning-card-highlight' : 'border-white'} ${equippedThemeClass}`}>
            <div className="grid grid-cols-5 mb-8 text-center">
              {['B','I','N','G','O'].map((l, i) => (
                <div key={l} className="flex flex-col items-center">
                  <div className="text-7xl font-lucky text-[#2563eb] drop-shadow-sm">{l}</div>
                  <div className={`h-2 w-14 rounded-full ${COLUMN_THEMES[i].line} shadow-sm`} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-3">
              {board.map((row, ri) => row.map((cell, ci) => {
                const isMarked = cell.marked && cell.value !== "FREE";
                const isCalledNotMarked = !cell.marked && cell.value !== "FREE" && drawnNumbers.includes(cell.value as number);
                return (
                  <button key={`${ri}-${ci}`} onClick={() => mark(ri, ci)} disabled={cell.marked || gameState !== 'PLAYING'}
                    className={`aspect-square rounded-[25px] flex items-center justify-center text-4xl md:text-5xl font-black transition-all border-4 relative text-slate-800
                      ${cell.value === "FREE" ? 'bg-white border-slate-100' : 'bg-white border-slate-50 shadow-sm'}
                      ${isMarked ? 'bg-[#2563eb] border-transparent !text-white z-10 shadow-lg' : 'hover:scale-105'}
                      ${isCalledNotMarked ? 'bg-[#facc15] border-transparent text-slate-900 scale-110 shadow-xl z-30 animate-hint-pulse' : ''}
                      ${lastError?.row === ri && lastError?.col === ci ? 'animate-error' : ''}`}>
                    {cell.value === "FREE" ? <Star fill="#f97316" size={40} className="text-orange-500" /> : <span className="relative z-10">{cell.value}</span>}
                  </button>
                );
              }))}
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-800 px-6 py-2 rounded-full border border-slate-700">
               <span className="w-3 h-3 rounded-full bg-blue-500"></span>
               <span className="text-white font-lucky text-xl uppercase tracking-widest">Sua Cartela</span>
            </div>
            {playerTitle && <div className="text-blue-600 font-bold text-sm uppercase tracking-widest bg-blue-50 px-4 py-1 rounded-full border border-blue-100">{playerTitle}</div>}
          </div>
        </div>

        {/* Right - Announcer */}
        <div className="lg:col-span-4 flex flex-col">
          <div style={{ height: cardHeight > 0 ? `${cardHeight}px` : '600px' }} className="bg-slate-900 rounded-[50px] flex flex-col overflow-hidden border-8 border-slate-800 shadow-2xl relative">
            <div className="bg-slate-800 p-8 flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#ef4444] flex items-center justify-center text-white font-lucky text-2xl">C</div>
                <p className="text-white font-lucky text-2xl flex items-center gap-2">
                  <Radio size={24} className="text-[#ef4444] animate-pulse" /> CHICO DO GLOBO
                </p>
              </div>
            </div>
            <div ref={scrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-slate-950/40">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'announcer' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] p-6 rounded-[30px] text-lg font-bold shadow-xl border-2 ${m.role === 'announcer' ? 'bg-white text-slate-900 rounded-tl-none border-[#ef4444]' : 'bg-[#2563eb] text-white border-blue-400'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isTyping && <div className="flex justify-start"><div className="bg-slate-800 p-4 rounded-full flex gap-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="w-2 h-2 bg-slate-500 rounded-full" />)}</div></div>}
            </div>
            {hasNewMessages && !autoScroll && <button onClick={scrollToBottom} className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#ef4444] text-white px-8 py-3 rounded-full font-lucky text-lg shadow-2xl animate-bounce flex items-center gap-3 border-4 border-white">Novas Falas <ArrowDown size={24} /></button>}
          </div>
          <button onClick={() => setGameState('HOME')} className="mt-8 w-full p-6 bg-white border-2 border-slate-200 rounded-[35px] font-lucky text-2xl text-slate-500 uppercase shadow-md hover:bg-slate-50">MENU PRINCIPAL</button>
        </div>
      </main>

      {(gameState === 'WON' || gameState === 'LOST') && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl z-[1000] flex items-center justify-center p-6">
          <div className="bg-white p-16 rounded-[70px] text-center shadow-2xl max-w-lg w-full border-[12px] border-slate-50 animate-in zoom-in duration-500">
            {gameState === 'WON' ? (
              <>
                <Trophy size={140} className="text-yellow-500 mx-auto mb-8 drop-shadow-xl" />
                <h2 className="text-8xl font-lucky text-slate-900 mb-2 uppercase">BINGO!</h2>
                <p className="text-2xl text-slate-500 mb-10">Você bateu e levou a bolada!</p>
              </>
            ) : (
              <>
                <ShieldAlert size={140} className="text-slate-300 mx-auto mb-8 opacity-50" />
                <h2 className="text-8xl font-lucky text-slate-900 mb-2 uppercase">{playerRank && playerRank <= 3 ? 'BATEU!' : 'QUASE!'}</h2>
                <p className="text-2xl text-slate-500 mb-10">Pódio: #{playerRank}</p>
              </>
            )}
            
            <div className="bg-yellow-50 p-8 rounded-[40px] mb-10 flex justify-between items-center border-2 border-yellow-100 shadow-inner">
              <div className="text-left">
                <p className="text-slate-400 text-sm font-black uppercase tracking-widest">Moedas Ganhas</p>
                <p className="text-5xl font-lucky text-yellow-600 flex items-center gap-3">
                  <Coins size={36} /> {gameMode === 'TOURNAMENT' ? (playerRank === 1 ? 25 : playerRank === 2 ? 15 : playerRank === 3 ? 8 : 0) : (playerRank === 1 ? 5 : 0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-sm font-black uppercase tracking-widest">Seu Saldo</p>
                <p className="text-3xl font-lucky text-slate-800">{stats.coins}</p>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {gameMode === 'TOURNAMENT' && playerRank && playerRank <= 3 && tournamentStep < 5 ? (
                <button onClick={() => initGame('TOURNAMENT', tournamentStep + 1)} className="w-full bg-emerald-600 text-white font-lucky py-6 rounded-3xl text-4xl shadow-2xl uppercase transition-transform active:scale-95 flex items-center justify-center gap-4">
                  PRÓXIMA FASE <ChevronRight size={40} />
                </button>
              ) : (
                <button onClick={() => initGame(gameMode, 1)} className="w-full bg-[#ef4444] text-white font-lucky py-6 rounded-3xl text-4xl shadow-2xl uppercase">NOVA PARTIDA</button>
              )}
              <button onClick={() => setGameState('HOME')} className="w-full bg-slate-100 text-slate-600 font-lucky py-5 rounded-3xl text-3xl uppercase">SAIR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

