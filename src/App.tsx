
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, Volume2, VolumeX, Trophy, MessageSquare, Star, BarChart3, X, Radio, ChevronRight, Coffee, Flag, Award, Medal, Users } from 'lucide-react';
import { generateBoard, checkWin } from './utils';
import { BingoBoard, GameState, GameMode, ChatMessage, Competitor, GameStats, TournamentPhase } from './types';
import { getBingoCommentStream, getAnnouncerChatStream } from './geminiService';
import { 
  playDrawSound, 
  playMarkSound, 
  playWinSound 
} from './soundUtils';
import confetti from 'canvas-confetti';

const COMPETITORS_DATA = [
  { id: '1', name: 'Dona Benta', color: 'bg-pink-500' },
  { id: '2', name: 'Seu Genésio', color: 'bg-blue-500' },
  { id: '3', name: 'Robo-Bingo', color: 'bg-purple-500' },
  { id: '4', name: 'Seu Juvêncio', color: 'bg-teal-500' },
  { id: '5', name: 'Vovó Zuzu', color: 'bg-orange-400' },
  { id: '6', name: 'Tio Barnabé', color: 'bg-amber-700' },
  { id: '7', name: 'Menina Bia', color: 'bg-fuchsia-600' },
  { id: '8', name: 'Dr. Simas', color: 'bg-cyan-600' },
  { id: '9', name: 'Tião Caminhão', color: 'bg-slate-700' },
  { id: '10', name: 'Sra. Margarida', color: 'bg-rose-400' },
  { id: '11', name: 'Zé do Pulo', color: 'bg-lime-500' },
  { id: '12', name: 'Sertanejo Bão', color: 'bg-emerald-800' },
];

const INITIAL_STATS: GameStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  totalBallsDrawn: 0,
  totalCorrectMarks: 0,
  totalPossibleMarks: 0,
  bestWinBalls: null,
  trophies: { gold: 0, silver: 0, bronze: 0 }
};

const COLUMN_THEMES = [
  { letter: 'B', text: 'text-blue-600', border: 'border-blue-700', marked: 'bg-gradient-to-br from-blue-500 to-blue-700 text-white border-blue-800' },
  { letter: 'I', text: 'text-red-600', border: 'border-red-700', marked: 'bg-gradient-to-br from-red-500 to-red-700 text-white border-red-800' },
  { letter: 'N', text: 'text-amber-500', border: 'border-amber-600', marked: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white border-amber-700' },
  { letter: 'G', text: 'text-emerald-600', border: 'border-emerald-700', marked: 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border-emerald-800' },
  { letter: 'O', text: 'text-indigo-600', border: 'border-indigo-700', marked: 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white border-indigo-800' },
];

const App: React.FC = () => {
  const [board, setBoard] = useState<BingoBoard>(generateBoard());
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [qualifiersOtherHeats, setQualifiersOtherHeats] = useState<Competitor[]>([]);
  const [gameState, setGameState] = useState<GameState>('HOME');
  const [gameMode, setGameMode] = useState<GameMode>('FRIENDLY');
  const [tournamentPhase, setTournamentPhase] = useState<TournamentPhase>('PRELIMINARY');
  const [currentHeat, setCurrentHeat] = useState<number>(1);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [rollingNumber, setRollingNumber] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [justLanded, setJustLanded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [victoryFlash, setVictoryFlash] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [lastMarked, setLastMarked] = useState<{row: number, col: number} | null>(null);
  const [lastError, setLastError] = useState<{row: number, col: number} | null>(null);
  const [bingoCount, setBingoCount] = useState<number>(0);
  const [playerRank, setPlayerRank] = useState<number>(0);
  const [stats, setStats] = useState<GameStats>(() => {
    const saved = localStorage.getItem('bingo_gemini_stats');
    return saved ? JSON.parse(saved) : INITIAL_STATS;
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const rollIntervalRef = useRef<number>(0);

  useEffect(() => {
    localStorage.setItem('bingo_gemini_stats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatMessages, isTyping]);

  useEffect(() => {
    if (isCalling) {
      rollIntervalRef.current = window.setInterval(() => setRollingNumber(Math.floor(Math.random() * 75) + 1), 80);
    } else {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      setRollingNumber(null);
    }
    return () => { if (rollIntervalRef.current) clearInterval(rollIntervalRef.current); };
  }, [isCalling]);

  const triggerAnnouncerReaction = async (msg: string) => {
    setIsTyping(true);
    setChatMessages(prev => [...prev, { role: 'announcer', text: '' }]);
    const stream = getAnnouncerChatStream(msg, { 
      drawnNumbers, 
      gameState, 
      competitors: competitors.map(c => ({ name: c.name, markedCount: c.board.flat().filter(x => x.marked).length })) 
    });
    let fullText = "";
    for await (const chunk of stream) {
      fullText += chunk;
      setChatMessages(prev => { 
        const updated = [...prev]; 
        updated[updated.length - 1] = { ...updated[updated.length - 1], text: fullText }; 
        return updated; 
      });
    }
    setIsTyping(false);
  };

  useEffect(() => {
    if (gameState === 'WON' || gameState === 'LOST' || gameState === 'QUALIFIED') {
      const isFinal = tournamentPhase === 'FINAL';
      const isWin = gameState === 'WON';
      const isQualify = gameState === 'QUALIFIED';
      
      if (isWin || isQualify) {
        setVictoryFlash(true);
        setTimeout(() => setVictoryFlash(false), 300);
        if (!isMuted) playWinSound();
        confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 } });
      }

      if (isFinal) {
        setStats(prev => {
          const newStats = { ...prev, gamesPlayed: prev.gamesPlayed + 1 };
          if (isWin) {
            newStats.gamesWon += 1;
            if (playerRank === 1) newStats.trophies.gold += 1;
            else if (playerRank === 2) newStats.trophies.silver += 1;
            else if (playerRank === 3) newStats.trophies.bronze += 1;
          }
          return newStats;
        });
      }

      let reaction = isWin ? "BINGO! O JOGADOR LEVOU A MELHOR!" : "FIM DE JOGO! ALGUÉM BATEU PRIMEIRO!";
      triggerAnnouncerReaction(reaction);
    }
  }, [gameState]);

  const enterTournament = () => {
    setGameMode('TOURNAMENT');
    setTournamentPhase('PRELIMINARY');
    setCurrentHeat(1);
    setBingoCount(0);
    setPlayerRank(0);
    
    const shuffled = [...COMPETITORS_DATA].sort(() => Math.random() - 0.5);
    const heat1_AIs = shuffled.slice(0, 3);
    const heat2_AIs = shuffled.slice(3, 6);
    const heat3_AIs = shuffled.slice(6, 9);
    const heat4_AIs = shuffled.slice(9, 12);
    
    const newCompetitors: Competitor[] = heat1_AIs.map(c => ({ 
      ...c, board: generateBoard(), isWinner: false, isEliminated: false, progress: 0, qualified: false 
    }));
    
    setQualifiersOtherHeats([
      { ...heat2_AIs[0], qualified: true } as Competitor,
      { ...heat3_AIs[0], qualified: true } as Competitor,
      { ...heat4_AIs[0], qualified: true } as Competitor
    ]);
    
    setBoard(generateBoard());
    setCompetitors(newCompetitors);
    setDrawnNumbers([]);
    setChatMessages([]);
    setGameState('BRACKET');
  };

  const enterFriendly = () => {
    setGameMode('FRIENDLY');
    setTournamentPhase('PRELIMINARY');
    setBingoCount(0);
    setPlayerRank(0);
    const friendlyAIs = [...COMPETITORS_DATA].sort(() => Math.random() - 0.5).slice(0, 3);
    const newCompetitors: Competitor[] = friendlyAIs.map(c => ({ 
      ...c, board: generateBoard(), isWinner: false, isEliminated: false, progress: 0, qualified: false 
    }));
    setBoard(generateBoard());
    setCompetitors(newCompetitors);
    setDrawnNumbers([]);
    setChatMessages([]);
    setGameState('PLAYING');
  };

  const startFinal = () => {
    setTournamentPhase('FINAL');
    setBingoCount(0);
    setPlayerRank(0);
    const finalCompetitors: Competitor[] = qualifiersOtherHeats.map(c => ({
      ...c, board: generateBoard(), isWinner: false, isEliminated: false, progress: 0, qualified: false
    }));
    setBoard(generateBoard());
    setCompetitors(finalCompetitors);
    setDrawnNumbers([]);
    setChatMessages([]);
    setGameState('PLAYING');
  };

  const drawNumber = useCallback(async () => {
    if (drawnNumbers.length >= 75 || gameState !== 'PLAYING' || isCalling) return;
    
    setIsCalling(true);
    setJustLanded(false);
    if (!isMuted) playDrawSound();
    
    let newNum: number;
    do { newNum = Math.floor(Math.random() * 75) + 1; } while (drawnNumbers.includes(newNum));
    
    setStats(prev => ({ ...prev, totalBallsDrawn: prev.totalBallsDrawn + 1 }));

    let newBingoCount = bingoCount;
    const updatedCompetitors = competitors.map(comp => {
      const newBoard = comp.board.map(row => row.map(cell => (cell.value === newNum ? { ...cell, marked: true } : cell)));
      const isWinner = checkWin(newBoard) !== null;
      if (isWinner && !comp.qualified) {
        newBingoCount++;
        comp.qualified = true;
        comp.isWinner = true;
        comp.rank = newBingoCount;
      }
      return { ...comp, board: newBoard, progress: (newBoard.flat().filter(c => c.marked).length / 25) * 100 };
    });

    const stream = getBingoCommentStream(newNum, updatedCompetitors.map(c => `${c.name} (${c.progress.toFixed(0)}%)`).join(', '));
    await new Promise(resolve => setTimeout(resolve, 600));
    
    setDrawnNumbers(prev => [...prev, newNum]);
    setCurrentNumber(newNum);
    setCompetitors(updatedCompetitors);
    setBingoCount(newBingoCount);
    setIsCalling(false);
    setJustLanded(true);

    if (gameMode === 'FRIENDLY' && newBingoCount >= 1 && playerRank === 0) setGameState('LOST');
    else if (tournamentPhase === 'PRELIMINARY' && newBingoCount >= 1 && playerRank === 0) setGameState('LOST');
    else if (tournamentPhase === 'FINAL' && newBingoCount >= 4 && playerRank === 0) setGameState('LOST');

    setTimeout(() => setJustLanded(false), 400);
    setChatMessages(prev => [...prev, { role: 'announcer', number: newNum, text: '' }]);
    setIsTyping(true);
    let fullText = "";
    for await (const chunk of stream) {
      fullText += chunk;
      setChatMessages(prev => { 
        const updated = [...prev]; 
        updated[updated.length - 1] = { ...updated[updated.length - 1], text: fullText }; 
        return updated; 
      });
    }
    setIsTyping(false);
  }, [drawnNumbers, gameState, isCalling, isMuted, competitors, bingoCount, tournamentPhase, playerRank, gameMode]);

  const markCell = (row: number, col: number) => {
    if (gameState !== 'PLAYING') return;
    const cell = board[row][col];
    if (cell.value === "FREE" || cell.marked) return;
    
    if (drawnNumbers.includes(cell.value as number)) {
      if (!isMuted) playMarkSound();
      setLastMarked({row, col});
      setTimeout(() => setLastMarked(null), 750);
      const newBoard = board.map((r, ri) => r.map((c, ci) => (ri === row && ci === col ? { ...c, marked: true } : c)));
      setBoard(newBoard);
      if (checkWin(newBoard)) {
        const rank = bingoCount + 1;
        setPlayerRank(rank);
        setBingoCount(rank);
        if (gameMode === 'FRIENDLY') setGameState('WON');
        else if (tournamentPhase === 'PRELIMINARY') setGameState('QUALIFIED');
        else if (rank <= 3) setGameState('WON');
        else setGameState('LOST');
      }
    } else {
      setLastError({row, col});
      setTimeout(() => setLastError(null), 300);
    }
  };

  if (gameState === 'HOME') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
        <div className="max-w-5xl w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
          <div className="text-center mb-12 space-y-4">
            <h1 className="text-7xl md:text-9xl font-lucky text-red-600 drop-shadow-2xl tracking-tighter leading-none mb-4">BINGO!</h1>
            <p className="text-2xl text-slate-600 font-medium max-w-2xl mx-auto italic">"A maior quermesse digital do mundo!"</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl">
            <button onClick={enterTournament} className="group bg-white p-8 rounded-[40px] shadow-xl border-b-8 border-yellow-600 hover:-translate-y-2 transition-all flex flex-col items-center text-center space-y-4">
              <Trophy size={40} className="text-yellow-600" />
              <h2 className="text-2xl font-lucky text-slate-800 uppercase">Torneio</h2>
              <div className="bg-red-600 text-white font-bold py-3 px-8 rounded-full shadow-lg text-sm">JOGAR</div>
            </button>
            <button onClick={enterFriendly} className="group bg-white p-8 rounded-[40px] shadow-xl border-b-8 border-blue-600 hover:-translate-y-2 transition-all flex flex-col items-center text-center space-y-4">
              <Coffee size={40} className="text-blue-600" />
              <h2 className="text-2xl font-lucky text-slate-800 uppercase">Amistoso</h2>
              <div className="bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-lg text-sm">JOGAR</div>
            </button>
            <button onClick={() => setGameState('TROPHY_ROOM')} className="group bg-white p-8 rounded-[40px] shadow-xl border-b-8 border-emerald-600 hover:-translate-y-2 transition-all flex flex-col items-center text-center space-y-4">
              <Award size={40} className="text-emerald-600" />
              <h2 className="text-2xl font-lucky text-slate-800 uppercase">Estante</h2>
              <div className="bg-emerald-600 text-white font-bold py-3 px-8 rounded-full shadow-lg text-sm">VER</div>
            </button>
            <button onClick={() => setShowStats(true)} className="group bg-white p-8 rounded-[40px] shadow-xl border-b-8 border-slate-600 hover:-translate-y-2 transition-all flex flex-col items-center text-center space-y-4">
              <BarChart3 size={40} className="text-slate-600" />
              <h2 className="text-2xl font-lucky text-slate-800 uppercase">Status</h2>
              <div className="bg-slate-600 text-white font-bold py-3 px-8 rounded-full shadow-lg text-sm">STATS</div>
            </button>
          </div>
        </div>
        {showStats && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4" onClick={() => setShowStats(false)}>
            <div className="bg-white rounded-[40px] p-8 max-w-lg w-full shadow-2xl space-y-6" onClick={e => e.stopPropagation()}>
               <div className="flex justify-between items-center"><h2 className="text-3xl font-lucky text-blue-600">SUAS CONQUISTAS</h2><X className="cursor-pointer" onClick={() => setShowStats(false)} /></div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-3xl border"><p className="text-xs font-bold text-slate-400 uppercase">Partidas</p><p className="text-3xl font-lucky">{stats.gamesPlayed}</p></div>
                  <div className="bg-slate-50 p-4 rounded-3xl border"><p className="text-xs font-bold text-slate-400 uppercase">Vitórias</p><p className="text-3xl font-lucky">{stats.gamesWon}</p></div>
               </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (gameState === 'TROPHY_ROOM') {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')]">
        <div className="max-w-4xl w-full space-y-12 text-center animate-in fade-in zoom-in-95 duration-500">
           <button onClick={() => setGameState('HOME')} className="inline-flex items-center gap-2 bg-white px-6 py-2 rounded-full font-bold shadow-md hover:bg-slate-50 transition-all"><RotateCcw size={18} /> VOLTAR</button>
           <h2 className="text-6xl font-lucky text-amber-900 drop-shadow-md uppercase">Estante de Troféus</h2>
           <div className="bg-orange-900/10 p-12 rounded-[60px] border-b-[20px] border-orange-950/20 grid grid-cols-1 md:grid-cols-3 gap-12 items-end">
              <div className="flex flex-col items-center gap-4"><Medal size={120} className="text-slate-400" /><p className="font-lucky text-2xl text-slate-600">{stats.trophies.silver} PRATA</p></div>
              <div className="flex flex-col items-center gap-4 -translate-y-12"><Trophy size={180} className="text-yellow-500" /><p className="font-lucky text-4xl text-yellow-700">{stats.trophies.gold} OURO</p></div>
              <div className="flex flex-col items-center gap-4"><Medal size={120} className="text-orange-700" /><p className="font-lucky text-2xl text-orange-800">{stats.trophies.bronze} BRONZE</p></div>
           </div>
        </div>
      </div>
    );
  }

  if (gameState === 'BRACKET') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
        <div className="max-w-md w-full text-center space-y-12 animate-in fade-in duration-500">
          <h2 className="text-6xl font-lucky text-yellow-500 uppercase">Heat #1</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest">Elimine seus oponentes para chegar na final!</p>
          <button onClick={() => setGameState('PLAYING')} className="bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-lucky text-3xl py-6 px-16 rounded-full shadow-[0_10px_0_rgb(161,98,7)] transition-all uppercase tracking-tighter">Entrar na Roda!</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-100 text-slate-900 flex flex-col p-4 md:p-8 transition-all duration-1000 ${gameState === 'WON' || gameState === 'QUALIFIED' ? 'bg-yellow-50' : gameState === 'LOST' ? 'bg-red-50' : ''}`}>
      {victoryFlash && <div className="fixed inset-0 bg-white z-[100] animate-pulse pointer-events-none" />}
      <header className="flex flex-col items-center mb-8">
        <h1 className="text-5xl md:text-7xl font-lucky text-red-600 drop-shadow-lg tracking-widest">BINGO!</h1>
      </header>
      <main className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-[40px] shadow-xl border-4 border-red-500 flex flex-col items-center justify-center min-h-[200px]">
            <span className="text-xs font-bold uppercase tracking-widest mb-2 text-red-500">Próxima Bola</span>
            <div className={`text-8xl font-lucky transition-all ${justLanded ? 'scale-125 text-green-600' : isCalling ? 'blur-sm' : 'text-slate-800'}`}>
              {isCalling ? rollingNumber : (currentNumber || '--')}
            </div>
          </div>
          <button onClick={drawNumber} disabled={isCalling || gameState !== 'PLAYING'} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-lucky text-2xl py-6 rounded-3xl shadow-xl active:scale-95 transition-all mb-4">SORTEAR!</button>
          
          {/* Competidores IA */}
          <div className="bg-white p-6 rounded-[40px] shadow-xl border-4 border-slate-100 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={20} className="text-slate-600" />
              <h3 className="font-lucky text-lg text-slate-800 uppercase">Oponentes</h3>
            </div>
            <div className="space-y-4">
              {competitors.map(comp => (
                <div key={comp.id} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 font-bold text-slate-700">
                      <span className={`w-3 h-3 rounded-full ${comp.color}`} />
                      {comp.name}
                      {comp.qualified && <Flag size={14} className="text-green-600 animate-bounce" />}
                    </span>
                    <span className="text-xs font-lucky text-slate-400">{comp.progress.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${comp.color}`} 
                      style={{ width: `${comp.progress}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
           <div className={`bg-white p-6 rounded-[50px] shadow-2xl border-8 transition-all duration-500 ${gameState === 'WON' || gameState === 'QUALIFIED' ? 'border-green-400 scale-105' : 'border-slate-100'}`}>
              <div className="grid grid-cols-5 mb-4 text-center">
                {['B', 'I', 'N', 'G', 'O'].map((l, i) => <div key={l} className={`text-4xl font-lucky border-b-4 mx-2 pb-2 ${COLUMN_THEMES[i].text} ${COLUMN_THEMES[i].border}`}>{l}</div>)}
              </div>
              <div className="grid grid-cols-5 gap-3">
                {board.map((row, ri) => row.map((cell, ci) => {
                  const isHint = !cell.marked && cell.value !== "FREE" && drawnNumbers.includes(cell.value as number);
                  return (
                    <button 
                      key={`${ri}-${ci}`} 
                      onClick={() => markCell(ri, ci)} 
                      disabled={cell.marked || gameState !== 'PLAYING'} 
                      className={`aspect-square rounded-2xl flex items-center justify-center text-xl md:text-3xl font-bold transition-all border-2 relative overflow-hidden 
                        ${cell.value === "FREE" ? 'bg-amber-50 text-amber-600' : 'bg-white border-slate-100'} 
                        ${cell.marked && cell.value !== "FREE" ? COLUMN_THEMES[ci].marked : 'hover:bg-slate-50'} 
                        ${lastMarked?.row === ri && lastMarked?.col === ci ? 'animate-mark-pulse shadow-2xl' : ''} 
                        ${lastError?.row === ri && lastError?.col === ci ? 'animate-error' : ''}
                        ${isHint ? 'animate-hint-pulse' : ''}`}
                    >
                      {cell.value === "FREE" ? <Star fill="currentColor" size={24} /> : cell.value}
                    </button>
                  );
                }))}
              </div>
           </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
           <div className="bg-slate-900 rounded-[40px] shadow-2xl flex flex-col h-[450px] border-4 border-slate-800">
              <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-800/50 rounded-t-[36px]">
                <Radio size={20} className="text-red-500 animate-pulse" /><p className="text-white font-lucky text-lg">CHICO DO GLOBO</p>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                 {chatMessages.map((msg, idx) => (
                   <div key={idx} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-white text-slate-900 flex items-center justify-center font-lucky text-sm flex-shrink-0">C</div>
                      <div className="max-w-[85%] p-4 rounded-3xl text-sm bg-white text-slate-800 font-medium">{msg.text || '...'}</div>
                   </div>
                 ))}
                 {isTyping && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-white text-slate-900 flex items-center justify-center font-lucky text-sm flex-shrink-0">C</div>
                      <div className="p-4 rounded-3xl text-sm bg-slate-800 text-slate-400 font-medium">Escrevendo...</div>
                    </div>
                 )}
              </div>
           </div>
        </div>
      </main>

      {(gameState === 'WON' || gameState === 'QUALIFIED' || gameState === 'LOST') && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[500] flex items-center justify-center p-6">
           <div className="bg-white p-12 rounded-[60px] max-w-xl w-full text-center shadow-2xl">
              <h2 className="text-7xl font-lucky text-slate-800 mb-4 uppercase">{gameState === 'LOST' ? 'DERROTA!' : 'VITÓRIA!'}</h2>
              <div className="flex flex-col gap-4">
                <button onClick={() => setGameState('HOME')} className="w-full bg-slate-800 text-white font-lucky text-2xl py-6 rounded-3xl uppercase hover:bg-slate-700 transition-colors">Menu Principal</button>
                {gameState === 'QUALIFIED' && (
                  <button onClick={startFinal} className="w-full bg-yellow-500 text-slate-900 font-lucky text-2xl py-6 rounded-3xl uppercase hover:bg-yellow-400 transition-colors">Ir para Final!</button>
                )}
                <button onClick={() => gameMode === 'FRIENDLY' ? enterFriendly() : enterTournament()} className="w-full bg-slate-200 text-slate-700 font-lucky text-2xl py-6 rounded-3xl uppercase hover:bg-slate-300 transition-colors">Jogar Novamente</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
