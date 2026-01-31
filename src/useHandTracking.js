import React, { useEffect, useRef, useState, useCallback } from 'react';

export const useHandTracking = (videoRef, canvasRef, onHandDetected, handMode = 'two') => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [handPresence, setHandPresence] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [isPinching, setIsPinching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("正在初始化...");
  const modelLoadedRef = useRef(false);
  const onHandDetectedRef = useRef(onHandDetected);

  useEffect(() => {
    onHandDetectedRef.current = onHandDetected;
  }, [onHandDetected]);

  const onResults = useCallback((results) => {
    if (!modelLoadedRef.current) {
      modelLoadedRef.current = true;
      setIsModelLoaded(true);
      setStatusMessage("识别已激活！请展示手掌。");
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 不再在 canvas 内镜像，由 .camera-layer 的 scaleX(-1) 统一镜像，与视频一致

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      setHandPresence(true);
      
      for (const landmarks of results.multiHandLandmarks) {
        // 使用 window.drawConnectors 和 window.HAND_CONNECTIONS
        if (window.drawConnectors && window.HAND_CONNECTIONS) {
             window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
        }
        if (window.drawLandmarks) {
             window.drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2 });
        }
        
        // --- 光标逻辑 ---
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];
        
        // 计算屏幕坐标
        const x = (1 - indexTip.x) * window.innerWidth;
        const y = indexTip.y * window.innerHeight;
        
        setCursorPosition({ x, y });
        
        // --- 捏合检测 ---
        const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
        const PINCH_THRESHOLD = 0.05; 
        
        const pinching = distance < PINCH_THRESHOLD;
        setIsPinching(pinching);
        
        const cb = onHandDetectedRef.current;
        if (cb) cb({ x, y, pinching });
      }
    } else {
      setHandPresence(false);
      setIsPinching(false);
    }
    
    ctx.restore();
  }, []);

  useEffect(() => {
    setIsModelLoaded(false);
    modelLoadedRef.current = false;
    const videoElement = videoRef.current;
    if (!videoElement) return;

    let hands = null;
    let camera = null;
    let isMounted = true;

    const startSystem = async () => {
      try {
        // 1. 立即启动摄像头 (让用户先看到画面)
        setStatusMessage("正在启动摄像头...");
        const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768;
        camera = new Camera(videoElement, {
          onFrame: async () => {
            if (hands && modelLoadedRef.current) {
              await hands.send({ image: videoElement });
            }
          },
          width: isNarrow ? 480 : 640,
          height: isNarrow ? 270 : 360
        });

        await camera.start();
        if (!isMounted) return;
        setIsCameraActive(true);
        console.log("Camera started successfully");

        // 2. 检查模型文件是否可访问 (Pre-check)，使用 Vite base 以支持 GitHub Pages 子路径
        setStatusMessage("正在检查模型文件...");
        const base = import.meta.env.BASE_URL || '/';
        const wasmUrl = `${window.location.origin}${base}mediapipe/hands_solution_simd_wasm_bin.wasm`;
        try {
            const response = await fetch(wasmUrl, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error(`无法访问 WASM 文件 (Status: ${response.status})`);
            }
            console.log("WASM file is accessible:", wasmUrl);
        } catch (fetchErr) {
            console.error("Asset check failed:", fetchErr);
            setStatusMessage(`模型文件丢失: ${fetchErr.message}`);
            return;
        }

        // 3. 初始化 MediaPipe Hands
        setStatusMessage("正在加载 AI 模型 (可能需要 10-20 秒)...");
        
        if (!window.Hands) {
             throw new Error("MediaPipe Hands 库未加载 (window.Hands is undefined)");
        }

        hands = new window.Hands({
          locateFile: (file) => {
            const url = `${window.location.origin}${base}mediapipe/${file}`;
            console.log(`LocateFile requesting: ${url}`);
            return url;
          }
        });

        hands.setOptions({
          maxNumHands: handMode === 'one' ? 1 : 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        hands.onResults(onResults);

        // 4. 显式初始化并预热
        await hands.initialize();
        if (!isMounted) return;
        
        console.log("Hands initialized");
        setStatusMessage("模型加载完成！正在预热...");
        
        // 发送一帧进行预热
        await hands.send({ image: videoElement });
        
        if (isMounted) {
            modelLoadedRef.current = true;
            setIsModelLoaded(true);
            setStatusMessage("系统就绪！");
        }

      } catch (err) {
        console.error("System startup error:", err);
        if (isMounted) {
            setStatusMessage(`启动错误: ${err.message}`);
        }
      }
    };

    startSystem();

    return () => {
       isMounted = false;
       if (videoElement.srcObject) {
         const tracks = videoElement.srcObject.getTracks();
         tracks.forEach(track => track.stop());
         videoElement.srcObject = null;
       }
       if (hands) {
           hands.close();
       }
    };
  }, [handMode]);

  return { isCameraActive, isModelLoaded, handPresence, cursorPosition, isPinching, statusMessage };
};
