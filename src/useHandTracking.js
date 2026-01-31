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
        // 0. 检查 MediaPipe 脚本是否加载（电脑/网络慢时 CDN 可能未就绪，稍等再试一次）
        if (typeof window === 'undefined') return;
        if (!window.Hands || !window.Camera) {
          await new Promise(r => setTimeout(r, 800));
          if (!isMounted) return;
          if (!window.Hands || !window.Camera) {
            setStatusMessage('MediaPipe 未加载：请检查网络后刷新；电脑建议用 Chrome/Edge，手机建议用 Chrome 或 Safari 最新版');
            return;
          }
        }
        if (window.location.protocol === 'http:' && !window.location.hostname.includes('localhost')) {
          setStatusMessage('请使用 HTTPS 打开（摄像头需要安全连接），或本地运行 npm run dev');
          return;
        }

        // 1. 立即启动摄像头 (让用户先看到画面)
        setStatusMessage("正在启动摄像头...");
        const isNarrow = window.innerWidth < 768;
        camera = new window.Camera(videoElement, {
          onFrame: async () => {
            if (hands && modelLoadedRef.current) {
              await hands.send({ image: videoElement });
            }
          },
          width: isNarrow ? 480 : 640,
          height: isNarrow ? 270 : 360
        });

        try {
          await camera.start();
        } catch (camErr) {
          if (!isMounted) return;
          const name = camErr?.name || '';
          if (name === 'NotAllowedError') setStatusMessage('请允许摄像头权限后刷新');
          else if (name === 'NotFoundError') setStatusMessage('未检测到摄像头');
          else if (name === 'NotReadableError') setStatusMessage('摄像头被占用，请关闭其他应用后重试');
          else setStatusMessage(`摄像头错误: ${camErr?.message || camErr}`);
          return;
        }
        if (!isMounted) return;
        setIsCameraActive(true);
        console.log("Camera started successfully");

        const base = import.meta.env.BASE_URL || '/';
        // 手机/平板用轻量模型 (modelComplexity 0)，加载更快、体积更小
        const useLiteModel = isNarrow;

        hands = new window.Hands({
          locateFile: (file) => {
            const url = `${window.location.origin}${base}mediapipe/${file}`;
            console.log(`LocateFile requesting: ${url}`);
            return url;
          }
        });

        hands.setOptions({
          maxNumHands: handMode === 'one' ? 1 : 2,
          modelComplexity: useLiteModel ? 0 : 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        hands.onResults(onResults);

        // 加载进度：显示已等待秒数，避免用户误以为卡死
        let loadingSeconds = 0;
        const loadingTimer = setInterval(() => {
          if (!isMounted || modelLoadedRef.current) return;
          loadingSeconds += 3;
          setStatusMessage(`正在加载 AI 模型... (已等待 ${loadingSeconds} 秒，请勿关闭)`);
        }, 3000);
        setStatusMessage("正在加载 AI 模型... (请稍候，首次约 10–30 秒)");

        const LOAD_TIMEOUT_MS = 55000;
        const initPromise = hands.initialize();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('LOAD_TIMEOUT')), LOAD_TIMEOUT_MS)
        );

        try {
          await Promise.race([initPromise, timeoutPromise]);
        } catch (initErr) {
          clearInterval(loadingTimer);
          if (!isMounted) return;
          if (initErr?.message === 'LOAD_TIMEOUT') {
            setStatusMessage('加载超时，请检查网络后刷新；或稍后重试');
            return;
          }
          const msg = initErr?.message || String(initErr);
          const isWasm = /wasm|abort|simd|module/i.test(msg);
          setStatusMessage(isWasm ? '当前浏览器可能不支持，请尝试 Chrome 或 Edge 最新版（手机建议用 Chrome）' : `模型加载失败: ${msg}`);
          return;
        }
        clearInterval(loadingTimer);
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
