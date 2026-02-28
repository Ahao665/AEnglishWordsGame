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
  const modelLoadedRef = useRef(false);
  const onHandDetectedRef = useRef(onHandDetected);
  const handLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    onHandDetectedRef.current = onHandDetected;
  }, [onHandDetected]);

  const drawHandLandmarks = useCallback((ctx, landmarks) => {
    // Draw connections
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
    // Draw landmarks
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

        // Calculate screen coordinates (mirrored for natural interaction)
        const x = (1 - indexTip.x) * window.innerWidth;
        const y = indexTip.y * window.innerHeight;

        setCursorPosition({ x, y });

        // Pinch detection
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

        // Load MediaPipe Vision tasks
        setStatusMessage("正在加载 AI 模型...");
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        if (!isMounted) return;

        const isNarrow = window.innerWidth < 768;
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: isNarrow
              ? 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker_lite/float16/1/hand_landmarker_lite.task'
              : 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker_full/float16/1/hand_landmarker_full.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: handMode === 'one' ? 1 : 2,
          minHandPresenceConfidence: 0.5,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        if (!isMounted) {
          handLandmarker.close();
          return;
        }

        handLandmarkerRef.current = handLandmarker;
        modelLoadedRef.current = true;
        setIsModelLoaded(true);
        console.log("HandLandmarker initialized");

        // Start camera
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
        setStatusMessage("识别已激活！请展示手掌。");

        // Start processing frames
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

  return { isCameraActive, isModelLoaded, handPresence, cursorPosition, isPinching, statusMessage };
};
