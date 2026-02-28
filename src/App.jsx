import React, { useState, useEffect, useRef } from 'react';
import { useHandTracking } from './useHandTracking';
import { getNextWord, shuffleString } from './words';
import confetti from 'canvas-confetti';
import useSound from 'use-sound';

const GAME_STATES = {
  INIT: 'init',
  LOADING: 'loading',
  WAITING_FOR_HANDS: 'waiting_hands',
  PLAYING: 'playing',
  SUCCESS: 'success',
  GAME_OVER: 'game_over'
};

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState(GAME_STATES.INIT);
  const [handMode, setHandMode] = useState('two');
  const [currentWord, setCurrentWord] = useState(null);
  const [shuffledLetters, setShuffledLetters] = useState([]);
  const [placedLetters, setPlacedLetters] = useState([]); // Array of letters placed in slots
  const [tiles, setTiles] = useState([]);
  const [draggedTileId, setDraggedTileId] = useState(null);
  const [score, setScore] = useState(0);
  const [showWrong, setShowWrong] = useState(false);
  const [lockedCorrectSlots, setLockedCorrectSlots] = useState([]); // 拼对后锁定的正确槽位
  const [placedTileIds, setPlacedTileIds] = useState([]); // 槽位 i 里放的 tile id
  const [wrongTileIds, setWrongTileIds] = useState(new Set()); // 刚弹回、需要闪红的 tile id
  const [wrongMessage, setWrongMessage] = useState(false); // 显示「错了重新试试」
  const [showTranslationHint, setShowTranslationHint] = useState(false);
  const confirmGestureFiredRef = useRef(false);
  const nextWordGestureFiredRef = useRef(false);
  const tilesRef = useRef(tiles);
  const currentWordRef = useRef(currentWord);
  const lockedCorrectSlotsRef = useRef(lockedCorrectSlots);
  const placedTileIdsRef = useRef(placedTileIds);

  // Keep refs in sync with state
  useEffect(() => { tilesRef.current = tiles; }, [tiles]);
  useEffect(() => { currentWordRef.current = currentWord; }, [currentWord]);
  useEffect(() => { lockedCorrectSlotsRef.current = lockedCorrectSlots; }, [lockedCorrectSlots]);
  useEffect(() => { placedTileIdsRef.current = placedTileIds; }, [placedTileIds]);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const TILE_SIZE = isMobile ? 48 : 70;
  const TILE_HIT_RADIUS = isMobile ? 40 : 52;
  const SLOT_WIDTH = isMobile ? 52 : 80;
  const SLOT_GAP = isMobile ? 8 : 15;
  const SLOT_PITCH = SLOT_WIDTH + SLOT_GAP;
  const DROP_SNAP_RADIUS = isMobile ? 50 : 70;
  const translationBtnRef = useRef(null);
  const pronunciationBtnRef = useRef(null);
  const translationGestureFiredRef = useRef(false);
  const pronunciationGestureFiredRef = useRef(false);
  const removeFromSlotGestureFiredRef = useRef(false);

  // 槽位几何（与 CSS 一致）
  const getSlotLayout = () => {
    if (!currentWord) return null;
    const startX = (window.innerWidth - (currentWord.word.length * SLOT_PITCH)) / 2;
    const slotY = window.innerHeight / 2 - (isMobile ? 60 : 100);
    return { startX, slotY };
  };
  const getSlotCenter = (slotIndex) => {
    const layout = getSlotLayout();
    if (!layout) return null;
    return {
      x: layout.startX + slotIndex * SLOT_PITCH + SLOT_WIDTH / 2,
      y: layout.slotY + SLOT_WIDTH / 2
    };
  };
  const getSlotIndexAt = (x, y) => {
    const layout = getSlotLayout();
    if (!layout || !currentWord) return -1;
    const i = Math.round((x - layout.startX - SLOT_WIDTH / 2) / SLOT_PITCH);
    if (i < 0 || i >= currentWord.word.length) return -1;
    const margin = isMobile ? 12 : 20;
    if (y < layout.slotY - margin || y > layout.slotY + SLOT_WIDTH + margin) return -1;
    return i;
  };
  const getNearestSlotIndex = (x, y) => {
    const layout = getSlotLayout();
    if (!layout || !currentWord) return -1;
    let best = -1;
    let bestDist = DROP_SNAP_RADIUS + 1;
    for (let i = 0; i < currentWord.word.length; i++) {
      const c = getSlotCenter(i);
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  };

  const playWordPronunciation = () => {
    if (currentWord?.word && typeof speechSynthesis !== 'undefined') {
      const u = new SpeechSynthesisUtterance(currentWord.word);
      u.lang = 'en-US';
      u.rate = 0.9;
      speechSynthesis.speak(u);
    }
  };

  const isPointInRect = (rect, x, y) => {
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  // Hand Tracking：捏合拖拽/确认/下一题/取槽/翻译/读音
  const onHandDetected = ({ x, y, pinching }) => {
    if (gameState === GAME_STATES.SUCCESS) {
      if (pinching && !nextWordGestureFiredRef.current) {
        nextWordGestureFiredRef.current = true;
        handleNextWord();
      } else if (!pinching) nextWordGestureFiredRef.current = false;
      return;
    }
    if (gameState !== GAME_STATES.PLAYING) return;

    if (pinching) {
      if (!draggedTileId) {
        const half = TILE_SIZE / 2;
        const tile = tiles.find(t => {
          if (t.placed) return false;
          return Math.hypot(x - (t.x + half), y - (t.y + half)) < TILE_HIT_RADIUS;
        });
        if (tile) {
          setDraggedTileId(tile.id);
        } else {
          const slotIdx = getSlotIndexAt(x, y);
          if (slotIdx >= 0 && placedLetters[slotIdx] && !lockedCorrectSlots[slotIdx] && !removeFromSlotGestureFiredRef.current) {
            removeFromSlotGestureFiredRef.current = true;
            handleRemoveFromSlot(slotIdx);
          } else {
            const allFilled = currentWord && placedLetters.every(Boolean);
            if (allFilled && !confirmGestureFiredRef.current) {
              confirmGestureFiredRef.current = true;
              handleConfirmSpelling();
            } else if (!allFilled) {
              const tr = translationBtnRef.current?.getBoundingClientRect();
              const pr = pronunciationBtnRef.current?.getBoundingClientRect();
              if (tr && isPointInRect(tr, x, y) && !translationGestureFiredRef.current) {
                translationGestureFiredRef.current = true;
                setShowTranslationHint(s => !s);
              } else if (pr && isPointInRect(pr, x, y) && !pronunciationGestureFiredRef.current) {
                pronunciationGestureFiredRef.current = true;
                playWordPronunciation();
              }
            }
          }
        }
      } else {
        setTiles(prev => prev.map(t => 
          t.id === draggedTileId ? { ...t, x, y } : t
        ));
      }
    } else {
      confirmGestureFiredRef.current = false;
      removeFromSlotGestureFiredRef.current = false;
      translationGestureFiredRef.current = false;
      pronunciationGestureFiredRef.current = false;
      if (draggedTileId) {
        checkDropZone(draggedTileId, x, y);
        setDraggedTileId(null);
      }
    }
  };

  // 从槽中取出字母（未锁定的槽），字母块回到槽中心位置可再拖
  const handleRemoveFromSlot = (slotIndex) => {
    if (!currentWord || slotIndex < 0 || slotIndex >= currentWord.word.length) return;
    if (lockedCorrectSlots[slotIndex]) return;
    const tileId = placedTileIds[slotIndex];
    if (!tileId) return;
    const center = getSlotCenter(slotIndex);
    if (!center) return;
    setPlacedLetters(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
    setPlacedTileIds(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
    setTiles(prev => prev.map(t => 
      t.id === tileId ? { ...t, placed: false, x: center.x - TILE_SIZE / 2, y: center.y - TILE_SIZE / 2 } : t
    ));
  };

  const { isCameraActive, isModelLoaded, handPresence, cursorPosition, isPinching, statusMessage, loadingProgress } = useHandTracking(videoRef, canvasRef, onHandDetected, handMode);

  // Game Logic
  useEffect(() => {
    if (gameState === GAME_STATES.LOADING && isModelLoaded) {
      setGameState(GAME_STATES.WAITING_FOR_HANDS);
    }
  }, [isModelLoaded, gameState]);

  const selectMode = (mode) => {
    setHandMode(mode);
    setGameState(GAME_STATES.LOADING);
  };

  useEffect(() => {
    if (gameState === GAME_STATES.WAITING_FOR_HANDS && handPresence) {
      startGame();
    }
  }, [gameState, handPresence]);

  const startGame = () => {
    const wordObj = getNextWord(); // 从四级词库随机出题
    setCurrentWord(wordObj);
    
    setPlacedLetters(new Array(wordObj.word.length).fill(null));
    setPlacedTileIds(new Array(wordObj.word.length).fill(null));
    setLockedCorrectSlots(new Array(wordObj.word.length).fill(false));
    setWrongMessage(false);
    setShowTranslationHint(false);

    // 字母打乱分布在目标区域四周，带轻微倾斜
    const letters = shuffleString(wordObj.word);
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2 - 60;
    const n = letters.length;
    const newTiles = letters.map((char, i) => {
      const angle = (2 * Math.PI * i) / n + (Math.random() - 0.5) * 1.2;
      const r = 180 + Math.random() * 100;
      const tileW = TILE_SIZE;
      const x = centerX + r * Math.cos(angle) - tileW / 2;
      const y = centerY + r * Math.sin(angle) - tileW / 2;
      const rotation = (Math.random() - 0.5) * 24;
      return {
        id: `tile-${i}`,
        char,
        x,
        y,
        originX: x,
        originY: y,
        originRotation: rotation,
        rotation,
        placed: false
      };
    });
    setTiles(newTiles);
    
    setGameState(GAME_STATES.PLAYING);
  };

  const checkDropZone = (tileId, x, y) => {
    const tile = tilesRef.current.find(t => t.id === tileId);
    if (!tile || !currentWordRef.current) return;

    const slotIndex = getNearestSlotIndex(x, y);
    const notLocked = slotIndex >= 0 && !lockedCorrectSlotsRef.current[slotIndex];
    if (slotIndex >= 0 && notLocked) {
        setPlacedLetters(prev => {
            const newPlaced = [...prev];
            if (newPlaced[slotIndex] === null) {
                newPlaced[slotIndex] = tile.char;
                setPlacedTileIds(prevIds => {
                    const next = [...prevIds];
                    next[slotIndex] = tileId;
                    return next;
                });
                setTiles(prevTiles => prevTiles.map(t => 
                    t.id === tileId ? { ...t, placed: true } : t
                ));
                return newPlaced;
            }
            return prev;
        });
    } else {
        setTiles(prev => prev.map(t =>
            t.id === tileId ? { ...t, x: t.originX, y: t.originY, rotation: t.originRotation } : t
        ));
    }
  };

  const allSlotsFilled = currentWord && placedLetters.every(Boolean);
  const handleConfirmSpelling = () => {
    if (!currentWord || !allSlotsFilled) return;
    const target = currentWord.word;
    const currentString = placedLetters.join('');
    if (currentString === target) {
      handleSuccess();
      return;
    }
    // 拼错：正确槽位锁定显绿，错误字母弹回并闪红
    const newLocked = [...lockedCorrectSlots];
    const tilesToReturn = [];
    for (let i = 0; i < target.length; i++) {
      if (placedLetters[i] === target[i]) {
        newLocked[i] = true;
      } else {
        newLocked[i] = false;
        const tid = placedTileIds[i];
        if (tid) tilesToReturn.push(tid);
      }
    }
    setLockedCorrectSlots(newLocked);
    setPlacedLetters(prev => prev.map((ch, i) => (newLocked[i] ? ch : null)));
    setPlacedTileIds(prev => prev.map((id, i) => (newLocked[i] ? id : null)));
    setTiles(prev => prev.map(t => {
      if (!tilesToReturn.includes(t.id)) return t;
      return { ...t, placed: false, x: t.originX, y: t.originY, rotation: t.originRotation };
    }));
    setWrongTileIds(new Set(tilesToReturn));
    setWrongMessage(true);
    setTimeout(() => {
      setWrongTileIds(new Set());
      setWrongMessage(false);
    }, 1200);
  };

  const handleSuccess = () => {
    setGameState(GAME_STATES.SUCCESS);
    setShowWrong(false);
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    setScore(s => s + 10);
    // 答对时播放英语读音
    if (currentWord?.word && typeof speechSynthesis !== 'undefined') {
      const utterance = new SpeechSynthesisUtterance(currentWord.word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  };

  const handleNextWord = () => {
    startGame();
  };

  return (
    <div className="game-container">
      {/* Camera & Detection Layer */}
      <div className="camera-layer">
        <video ref={videoRef} className="camera-feed" autoPlay playsInline muted />
        <canvas ref={canvasRef} className="detection-canvas" width={isMobile ? 480 : 640} height={isMobile ? 270 : 360} />
      </div>

      {/* UI Layer */}
      <div className="ui-layer">
        <header className="header">
           <div className="score-board">分数: {score}</div>
           <div className={`status ${wrongMessage ? 'status-wrong' : ''}`}>
              {gameState === GAME_STATES.WAITING_FOR_HANDS && "请举起双手开始游戏！"}
              {gameState === GAME_STATES.PLAYING && !wrongMessage && (allSlotsFilled ? "拼好后捏合手指确认" : "捏合拖拽字母；捏合槽内字母可取出重放")}
              {wrongMessage && "错了重新试试"}
           </div>
        </header>

        {gameState === GAME_STATES.INIT && (
            <div className="start-screen">
                <div className="start-content">
                    <h1>✨ 魔法拼写 ✨</h1>
                    <p>请选择魔法模式：</p>
                    
                    {/* System Status Indicator */}
                    <div style={{ 
                        marginBottom: '20px', 
                        padding: '15px', 
                        background: 'rgba(0,0,0,0.6)', 
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '1.1rem',
                        color: isModelLoaded ? '#4ecdc4' : '#ffdd57',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px'
                    }}>
                        {!isModelLoaded && <div className="loading-spinner" style={{width: '20px', height: '20px', margin: 0, borderWidth: '3px'}}></div>}
                        {statusMessage}
                    </div>

                    <div className="mode-selection">
                        <button 
                            className="mode-btn" 
                            onClick={() => selectMode('one')}
                            style={{ opacity: isModelLoaded ? 1 : 0.5, cursor: isModelLoaded ? 'pointer' : 'not-allowed' }}
                        >
                            👆 单手模式 (One Hand)
                        </button>
                        <button 
                            className="mode-btn" 
                            onClick={() => selectMode('two')}
                            style={{ opacity: isModelLoaded ? 1 : 0.5, cursor: isModelLoaded ? 'pointer' : 'not-allowed' }}
                        >
                            🙌 双手模式 (Two Hands)
                        </button>
                    </div>
                </div>
            </div>
        )}


        {gameState === GAME_STATES.LOADING && (
            <div className="start-screen">
                <div className="start-content">
                    <h1>🔮 正在召唤...</h1>
                    <p>魔法模型加载中，请稍候...</p>
                    <div style={{
                        marginTop: '20px',
                        width: '80%',
                        maxWidth: '400px',
                    }}>
                        <div style={{
                            height: '8px',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${loadingProgress}%`,
                                background: 'linear-gradient(90deg, #4ecdc4, #44a08d)',
                                borderRadius: '4px',
                                transition: 'width 0.3s ease',
                            }}></div>
                        </div>
                        <div style={{
                            marginTop: '10px',
                            fontSize: '0.9rem',
                            color: '#aaa',
                        }}>{loadingProgress}%</div>
                    </div>
                    <div className="status-log" style={{
                        marginTop: '15px',
                        padding: '10px',
                        background: 'rgba(0,0,0,0.5)',
                        borderRadius: '8px',
                        fontFamily: 'monospace',
                        color: '#00ff00',
                        maxWidth: '80%',
                        wordBreak: 'break-all',
                        fontSize: '0.9rem',
                    }}>
                        {statusMessage}
                    </div>
                </div>
            </div>
        )}

        {gameState === GAME_STATES.WAITING_FOR_HANDS && (
            <div className="guide-overlay">
                <div className="guide-icon">👋</div>
                <h2>准备好了吗？</h2>
                <p>请在摄像头前举起你的手</p>
            </div>
        )}

        <main className="word-area">
           {/* Target Slots */}
           {currentWord && (
             <div className={`target-word ${wrongMessage ? 'wrong-shake' : ''}`} style={{ gap: SLOT_GAP }}>
                {placedLetters.map((char, i) => (
                   <div
                     key={i}
                     className={`letter-slot ${char ? 'filled' : ''} ${lockedCorrectSlots[i] ? 'locked-correct' : ''} ${gameState === GAME_STATES.SUCCESS ? 'correct' : ''}`}
                     style={{ width: SLOT_WIDTH, height: SLOT_WIDTH, fontSize: isMobile ? '1.75rem' : '3rem' }}
                   >
                      {char}
                   </div>
                ))}
             </div>
           )}
           {currentWord && showTranslationHint && (
             <p className="translation-hint">中文：{currentWord.translation}</p>
           )}
           
           {/* Success Overlay */}
           {gameState === GAME_STATES.SUCCESS && currentWord && (
               <div className="feedback-overlay">
                  <div className="celebration-icon">🎉</div>
                  <h1 className="feedback-word">{currentWord.word}</h1>
                  <p className="feedback-translation">{currentWord.translation}</p>
                  <p className="feedback-phonetic">{currentWord.phonetic}</p>
                  <p className="next-hint">捏合手指或点击按钮下一题</p>
                  <button type="button" className="next-btn" onClick={handleNextWord}>下一题</button>
               </div>
           )}
        </main>

        {/* Draggable Tiles Area */}
        {gameState === GAME_STATES.PLAYING && (
           <div className="tile-container">
              {tiles.map(tile => !tile.placed && (
                 <div 
                    key={tile.id} 
                    className={`letter-tile ${draggedTileId === tile.id ? 'dragging' : ''} ${wrongTileIds.has(tile.id) ? 'flash-red' : ''}`}
                    style={{ 
                        left: tile.x, 
                        top: tile.y,
                        position: 'absolute',
                        width: TILE_SIZE,
                        height: TILE_SIZE,
                        fontSize: isMobile ? '1.6rem' : '2.5rem',
                        transform: `rotate(${tile.rotation ?? 0}deg)`
                    }}
                 >
                    {tile.char}
                 </div>
              ))}
           </div>
        )}
        
        {/* 右下角提示：翻译 + 读音，支持手势捏合或鼠标点击 */}
        {gameState === GAME_STATES.PLAYING && currentWord && (
          <div className="hint-btn-wrap">
            <button
              ref={translationBtnRef}
              type="button"
              className="hint-btn"
              onClick={() => setShowTranslationHint(s => !s)}
            >
              💡 翻译
            </button>
            <button
              ref={pronunciationBtnRef}
              type="button"
              className="hint-btn hint-btn-pronounce"
              onClick={playWordPronunciation}
            >
              🔊 读音
            </button>
          </div>
        )}

        {/* Hand Cursor Visualization */}
        {handPresence && (
            <div 
                className={`hand-cursor ${isPinching ? 'pinching' : ''}`}
                style={{ 
                    left: cursorPosition.x, 
                    top: cursorPosition.y 
                }}
            />
        )}
      </div>
    </div>
  );
}

export default App;
