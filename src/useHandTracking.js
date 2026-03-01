import React, { useEffect, useRef, useState, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Hand connections for drawing
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

export const useHandTracking = (videoRef, canvasRef, onHandDetected, handMode = 'two') => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [handPresence, setHandPresence] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [isPinching, setIsPinching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("正在初始化...");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const modelLoadedRef = useRef(false);
  const onHandDetectedRef = useRef(onHandDetected);
  const handLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    onHandDetectedRef.current = onHandDetected;
  }, [onHandDetected]);

  const drawHandLandmarks = useCallback((ctx, landmarks) => {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 5;
    for (const [start, end] of HAND_CONNECTIONS) {
      const startPoint = landmarks[start];
      const endPoint = landmarks[end];
      ctx.beginPath();
      ctx.moveTo(startPoint.x * ctx.canvas.width, startPoint.y * ctx.canvas.height);
      ctx.lineTo(endPoint.x * ctx.canvas.width, endPoint.y * ctx.canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = '#FF0000';
    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc(point.x * ctx.canvas.width, point.y * ctx.canvas.height, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const handLandmarker = handLandmarkerRef.current;

    if (!video || !canvas || !handLandmarker || !modelLoadedRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const results = handLandmarker.detectForVideo(video, performance.now());

    if (results.landmarks && results.landmarks.length > 0) {
      setHandPresence(true);

      for (const landmarks of results.landmarks) {
        drawHandLandmarks(ctx, landmarks);

        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];

        const x = (1 - indexTip.x) * window.innerWidth;
        const y = indexTip.y * window.innerHeight;

        setCursorPosition({ x, y });

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

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [drawHandLandmarks]);

  useEffect(() => {
    setIsModelLoaded(false);
    modelLoadedRef.current = false;
    const videoElement = videoRef.current;
    if (!videoElement) return;

    let stream = null;
    let isMounted = true;

    const startSystem = async () => {
      try {
        if (typeof window === 'undefined') return;

        if (window.location.protocol === 'http:' && !window.location.hostname.includes('localhost')) {
          setStatusMessage('请使用 HTTPS 打开（摄像头需要安全连接），或本地运行 npm run dev');
          return;
        }

        // Step 1: Load WASM 从本站（不依赖国外 CDN），带超时
        setStatusMessage("正在加载 WASM 运行时...");
        setLoadingProgress(10);
        const base = import.meta.env.BASE_URL || '/';
        const wasmBase = `${window.location.origin}${base.replace(/\/?$/, '/')}wasm`;
        const visionPromise = FilesetResolver.forVisionTasks(wasmBase);
        const timeoutMs = 45000;
        const vision = await Promise.race([
          visionPromise,
          new Promise((_, rej) => setTimeout(() => rej(new Error('WASM_LOAD_TIMEOUT')), timeoutMs))
        ]).catch((e) => {
          if (e?.message === 'WASM_LOAD_TIMEOUT') throw new Error('加载超时，请检查网络后刷新；或稍后重试');
          throw e;
        });

        if (!isMounted) return;

        // Step 2: 模型优先本站，失败则用官方 CDN（文档中的 hand_landmarker.task）
        setStatusMessage("正在加载手势识别模型...");
        setLoadingProgress(40);
        const basePath = base.replace(/\/?$/, '/');
        const origin = window.location.origin;
        const modelUrls = [
          `${origin}${basePath}models/hand_landmarker_lite.task`,
          `${origin}${basePath}models/hand_landmarker.task`,
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
        ];
        const opts = {
          runningMode: 'VIDEO',
          numHands: handMode === 'one' ? 1 : 2,
          minHandPresenceConfidence: 0.5,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        };
        let handLandmarker = null;
        for (const modelAssetPath of modelUrls) {
          if (!isMounted) break;
          try {
            handLandmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath, delegate: 'GPU' },
              ...opts
            });
            break;
          } catch (e) {
            continue;
          }
        }
        if (!handLandmarker) {
          throw new Error('无法加载手势模型，请检查网络后刷新；若部署在 GitHub Pages 请确认已提交 public/models 下的 .task 文件');
        }

        if (!isMounted) {
          handLandmarker.close();
          return;
        }

        handLandmarkerRef.current = handLandmarker;
        modelLoadedRef.current = true;
        setIsModelLoaded(true);
        setLoadingProgress(70);
        console.log("HandLandmarker initialized");

        // Step 3: Start camera
        setStatusMessage("正在启动摄像头...");
        const isNarrowDevice = window.innerWidth < 768;
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: isNarrowDevice ? 480 : 640,
            height: isNarrowDevice ? 270 : 360,
            facingMode: 'user'
          }
        });

        if (!isMounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        videoElement.srcObject = stream;
        await videoElement.play();

        setIsCameraActive(true);
        setLoadingProgress(100);
        setStatusMessage("识别已激活！请展示手掌。");

        processFrame();

      } catch (err) {
        console.error("System startup error:", err);
        if (!isMounted) return;

        const name = err?.name || '';
        if (name === 'NotAllowedError') setStatusMessage('请允许摄像头权限后刷新');
        else if (name === 'NotFoundError') setStatusMessage('未检测到摄像头');
        else if (name === 'NotReadableError') setStatusMessage('摄像头被占用，请关闭其他应用后重试');
        else setStatusMessage(`启动错误: ${err?.message || err}`);
      }
    };

    startSystem();

    return () => {
      isMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }
    };
  }, [handMode, processFrame]);

  return { isCameraActive, isModelLoaded, handPresence, cursorPosition, isPinching, statusMessage, loadingProgress };
};
