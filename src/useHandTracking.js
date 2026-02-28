import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import * as tf from '@tensorflow/tfjs';

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
  const detectorRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    onHandDetectedRef.current = onHandDetected;
  }, [onHandDetected]);

  const drawHandLandmarks = useCallback((ctx, keypoints, videoWidth, videoHeight) => {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 5;
    for (const [start, end] of HAND_CONNECTIONS) {
      const startPoint = keypoints[start];
      const endPoint = keypoints[end];
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(endPoint.x, endPoint.y);
      ctx.stroke();
    }
    ctx.fillStyle = '#FF0000';
    for (const point of keypoints) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;

    if (!video || !canvas || !detector || !modelLoadedRef.current || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Match canvas size to video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detector.estimateHands(video)
      .then(hands => {
        if (!modelLoadedRef.current) return;
        
        if (hands && hands.length > 0) {
          setHandPresence(true);

          for (const hand of hands) {
            const keypoints = hand.keypoints;
            
            // Draw landmarks
            drawHandLandmarks(ctx, keypoints, video.videoWidth, video.videoHeight);

            const indexTip = keypoints[8];
            const thumbTip = keypoints[4];

            // Convert to normalized coordinates then to screen coordinates
            const normalizedX = indexTip.x / video.videoWidth;
            const normalizedY = indexTip.y / video.videoHeight;
            
            const x = (1 - normalizedX) * window.innerWidth;
            const y = normalizedY * window.innerHeight;

            setCursorPosition({ x, y });

            // Pinch detection
            const thumbNormX = thumbTip.x / video.videoWidth;
            const thumbNormY = thumbTip.y / video.videoHeight;
            const distance = Math.hypot(normalizedX - thumbNormX, normalizedY - thumbNormY);
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
      })
      .catch(e => console.error('Hand detection error:', e));

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

        // Step 1: Initialize TensorFlow.js
        setStatusMessage("正在初始化 TensorFlow.js...");
        setLoadingProgress(10);
        await tf.ready();
        if (!isMounted) return;

        // Step 2: Create detector with MediaPipe Hands model
        setStatusMessage("正在加载手势识别模型...");
        setLoadingProgress(30);
        
        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
          modelType: 'lite',
          maxHands: handMode === 'one' ? 1 : 2,
        };
        
        const detector = await handPoseDetection.createDetector(model, detectorConfig);
        
        if (!isMounted) {
          detector.dispose();
          return;
        }

        detectorRef.current = detector;
        modelLoadedRef.current = true;
        setIsModelLoaded(true);
        setLoadingProgress(70);
        console.log("Hand detector initialized");

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
      if (detectorRef.current) {
        detectorRef.current.dispose();
        detectorRef.current = null;
      }
    };
  }, [handMode, processFrame]);

  return { isCameraActive, isModelLoaded, handPresence, cursorPosition, isPinching, statusMessage, loadingProgress };
};
