"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Cell = { x: number; y: number };
type GameStatus = "ready" | "playing" | "game-over";

const GRID_SIZE = 12;
const INITIAL_SNAKE: Cell[] = [
  { x: 5, y: 6 },
  { x: 4, y: 6 },
  { x: 3, y: 6 },
];

const DIRECTION_VECTORS: Record<Direction, Cell> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const isSameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

const randomFood = (snake: Cell[]) => {
  let candidate: Cell;

  do {
    candidate = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (snake.some((segment) => isSameCell(segment, candidate)));

  return candidate;
};

const getOppositeDirection = (direction: Direction): Direction => {
  switch (direction) {
    case "UP":
      return "DOWN";
    case "DOWN":
      return "UP";
    case "LEFT":
      return "RIGHT";
    default:
      return "LEFT";
  }
};

export default function Home() {
  const [snake, setSnake] = useState<Cell[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Cell>({ x: 8, y: 6 });
  const [direction, setDirection] = useState<Direction>("RIGHT");
  const [nextDirection, setNextDirection] = useState<Direction>("RIGHT");
  const [status, setStatus] = useState<GameStatus>("ready");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const musicIntervalRef = useRef<number | null>(null);

  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }

    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const playTone = useCallback(
    (frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.06, sweepTo?: number) => {
      const ctx = ensureAudioContext();
      if (!ctx) {
        return;
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const now = ctx.currentTime;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);

      if (sweepTo) {
        oscillator.frequency.exponentialRampToValueAtTime(sweepTo, now + duration);
      }

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + duration);
    },
    [ensureAudioContext],
  );

  const playEatSound = useCallback(() => {
    playTone(660, 0.08, "triangle", 0.08, 820);
    window.setTimeout(() => playTone(990, 0.1, "square", 0.06, 1040), 70);
  }, [playTone]);

  const playDeathSound = useCallback(() => {
    playTone(240, 0.16, "sawtooth", 0.09, 80);
    window.setTimeout(() => playTone(120, 0.22, "sawtooth", 0.08, 50), 120);
  }, [playTone]);

  const stopMusic = useCallback(() => {
    if (musicIntervalRef.current) {
      window.clearInterval(musicIntervalRef.current);
      musicIntervalRef.current = null;
    }
  }, []);

  const startMusic = useCallback(() => {
    ensureAudioContext();
    stopMusic();

    const melody = [261.63, 329.63, 392.0, 329.63, 349.23, 440.0, 392.0, 329.63];
    let index = 0;

    musicIntervalRef.current = window.setInterval(() => {
      const note = melody[index % melody.length];
      playTone(note, 0.12, "triangle", 0.025);
      index += 1;
    }, 220);
  }, [ensureAudioContext, playTone, stopMusic]);

  useEffect(() => {
    const initializeClientState = () => {
      const savedBest = window.localStorage.getItem("snake-best-score");
      if (savedBest) {
        const parsedBest = Number(savedBest);
        if (!Number.isNaN(parsedBest)) {
          setBestScore(parsedBest);
        }
      }

      setFood(randomFood(INITIAL_SNAKE));
    };

    const frameId = window.requestAnimationFrame(initializeClientState);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (status === "playing") {
      startMusic();
    } else {
      stopMusic();
    }
  }, [startMusic, status, stopMusic]);

  useEffect(() => {
    if (status === "game-over") {
      playDeathSound();
    }
  }, [playDeathSound, status]);

  useEffect(() => {
    window.localStorage.setItem("snake-best-score", String(bestScore));
  }, [bestScore]);

  const resetGame = useCallback(() => {
    const freshSnake = INITIAL_SNAKE.map((cell) => ({ ...cell }));

    setSnake(freshSnake);
    setFood(randomFood(freshSnake));
    setDirection("RIGHT");
    setNextDirection("RIGHT");
    setScore(0);
    setStatus("playing");
    ensureAudioContext();
  }, [ensureAudioContext]);

  const changeDirection = useCallback(
    (newDirection: Direction) => {
      setNextDirection((currentDirection) => {
        if (currentDirection === newDirection) {
          return currentDirection;
        }

        if (getOppositeDirection(currentDirection) === newDirection) {
          return currentDirection;
        }

        return newDirection;
      });

      if (status === "ready") {
        setStatus("playing");
        ensureAudioContext();
      }
    },
    [ensureAudioContext, status],
  );

  const tick = useCallback(() => {
    setSnake((currentSnake) => {
      const activeDirection = nextDirection;
      const head = currentSnake[0];
      const moveVector = DIRECTION_VECTORS[activeDirection];
      const nextHead = {
        x: head.x + moveVector.x,
        y: head.y + moveVector.y,
      };

      const hitWall =
        nextHead.x < 0 ||
        nextHead.x >= GRID_SIZE ||
        nextHead.y < 0 ||
        nextHead.y >= GRID_SIZE;

      const willEatFood = isSameCell(nextHead, food);
      const collidingWithBody = (willEatFood ? currentSnake : currentSnake.slice(0, -1)).some(
        (segment) => isSameCell(segment, nextHead),
      );

      if (hitWall || collidingWithBody) {
        setStatus("game-over");
        setBestScore((currentBest) => Math.max(currentBest, score));
        return currentSnake;
      }

      const updatedSnake = [nextHead, ...currentSnake];

      if (!willEatFood) {
        updatedSnake.pop();
      }

      setDirection(activeDirection);

      if (willEatFood) {
        const nextScore = score + 10;
        setScore(nextScore);
        setBestScore((currentBest) => Math.max(currentBest, nextScore));
        setFood(randomFood(updatedSnake));
        playEatSound();
      }

      return updatedSnake;
    });
  }, [food, nextDirection, playEatSound, score]);

  useEffect(() => {
    if (status !== "playing") {
      return;
    }

    const timer = window.setInterval(() => {
      tick();
    }, 180);

    return () => window.clearInterval(timer);
  }, [status, tick]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const directionMap: Record<string, Direction> = {
        arrowup: "UP",
        w: "UP",
        arrowdown: "DOWN",
        s: "DOWN",
        arrowleft: "LEFT",
        a: "LEFT",
        arrowright: "RIGHT",
        d: "RIGHT",
      };

      if (key === " " || key === "spacebar") {
        event.preventDefault();
        if (status !== "playing") {
          resetGame();
        }
        return;
      }

      const mappedDirection = directionMap[key];
      if (!mappedDirection) {
        return;
      }

      event.preventDefault();
      changeDirection(mappedDirection);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeDirection, resetGame, status]);

  const boardCells = useMemo(
    () =>
      Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
        const x = index % GRID_SIZE;
        const y = Math.floor(index / GRID_SIZE);

        const isHead = snake[0] && snake[0].x === x && snake[0].y === y;
        const isBody = snake.slice(1).some((segment) => segment.x === x && segment.y === y);
        const isFoodCell = isSameCell(food, { x, y });

        return { x, y, isHead, isBody, isFoodCell };
      }),
    [food, snake],
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#1e293b,_#0f172a_48%,_#020617)] p-4 text-slate-100">
      <div className="w-full max-w-xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.45em] text-emerald-300">
              Mini Game
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Snake</h1>
          </div>

          <div className="flex gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center shadow-lg shadow-emerald-500/10">
              <div className="text-[9px] uppercase tracking-[0.25em] text-slate-400">Score</div>
              <div className="mt-1 text-2xl font-bold text-emerald-300">{score}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center shadow-lg shadow-cyan-500/10">
              <div className="text-[9px] uppercase tracking-[0.25em] text-slate-400">Best</div>
              <div className="mt-1 text-2xl font-bold text-cyan-300">{bestScore}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-slate-950/60 p-3 shadow-2xl shadow-emerald-500/10 backdrop-blur-sm">
          <div className="grid grid-cols-12 gap-1 rounded-2xl bg-slate-900 p-2">
            {boardCells.map((cell) => {
              const classes = [
                "aspect-square rounded-[6px] border border-slate-700/70 transition-all duration-75",
                cell.isHead
                  ? "bg-gradient-to-br from-emerald-300 via-emerald-400 to-green-500 shadow-[0_0_14px_rgba(52,211,153,0.7)]"
                  : cell.isBody
                    ? "bg-gradient-to-br from-lime-300 via-emerald-400 to-green-500"
                    : cell.isFoodCell
                      ? "bg-gradient-to-br from-rose-400 via-orange-400 to-yellow-300 shadow-[0_0_12px_rgba(251,146,60,0.7)]"
                      : "bg-slate-800/80",
              ].join(" ");

              return <div key={`${cell.x}-${cell.y}`} className={classes} />;
            })}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="text-sm text-slate-300">
            {status === "ready" && "按方向鍵或空白鍵開始遊戲"}
            {status === "playing" && `目前方向：${direction}`}
            {status === "game-over" && "遊戲結束，按重新開始再挑戰一次"}
          </div>

          <button
            type="button"
            onClick={resetGame}
            className="rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:opacity-90"
          >
            {status === "playing" ? "重新開始" : status === "game-over" ? "再玩一次" : "開始遊戲"}
          </button>
        </div>
      </div>
    </main>
  );
}
