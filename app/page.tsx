'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';

export default function CleanAgentUI() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [agentState, setAgentState] = useState<'offline' | 'idle' | 'connecting'>('offline');
  const [hasCamera, setHasCamera] = useState(false);
  
  // Real-time single point transcription text layer (No history tracked)
  const [currentText, setCurrentText] = useState<string>('');

  // Core Media Stream References
  const localStreamRef = useRef<MediaStream | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Deepgram Live Streaming WebSocket and Recorder References
  const dgSocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const explicitDisconnectRef = useRef<boolean>(false);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const imageCaptureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const connectionAttemptsRef = useRef<number>(0);

  // Set mounted flag to guarantee hydration match
  useEffect(() => {
    setHasMounted(true);
    logAction('NaviSense HCI Multi-Input Agent Core initialized.');
    
    return () => {
      explicitDisconnectRef.current = true;
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
      if (imageCaptureIntervalRef.current) clearInterval(imageCaptureIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch(e){}
      }
      if (dgSocketRef.current) {
        try { dgSocketRef.current.close(); } catch(e){}
      }
    };
  }, []);

  // Helper to log actions exclusively to the browser console
  const logAction = (actionName: string, details: any = '') => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + `.${String(now.getMilliseconds()).padStart(3, '0')}`;
    console.log(`%c[${timeStr}] [Deepgram Agent Action]: ${actionName}`, 'color: #22d3ee; font-weight: bold;', details);
  };

  // Automated background screenshot snapshot generator (HCI Context Gathering)
  const captureBackgroundSnapshot = () => {
    if (!videoElementRef.current || !isStreaming) return;
    
    try {
      const video = videoElementRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        logAction('Background Picture Captured Automatically 📸', { 
          resolution: `${canvas.width}x${canvas.height}`,
          stringLength: dataUrl.length 
        });
      }
    } catch (err) {
      logAction('Background Capture Exception caught', err);
    }
  };

  // Background socket connector loop with routing redundancy protection and IP failovers
  const connectToDeepgram = (stream: MediaStream) => {
    if (dgSocketRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || "";
    if (!apiKey || apiKey === "YOUR_DEEPGRAM_API_KEY") {
      logAction('CRITICAL', 'Deepgram API Key is missing! Check your .env.local file.');
      alert('API Key Error: Please make sure NEXT_PUBLIC_DEEPGRAM_API_KEY is defined.');
      return;
    }

    setAgentState('connecting');
    
    // Kept strictly to reliable core address endpoints to avoid domain routing resolution drops (1006 ERR_NAME_NOT_RESOLVED)
    const targetDomain = 'api.deepgram.com';

    logAction(`Opening secure Deepgram Real-Time WebSocket Channel on [${targetDomain}] (Attempt #${connectionAttemptsRef.current + 1})...`);
    
    // Explicit parameter construction utilizing URLSearchParams to prevent string format corruption
    const queryParams = new URLSearchParams({
      model: 'nova-2',
      interim_results: 'true',
      smart_format: 'true',
      timeout: '300',
      endpointing: 'false',            // Disables automated end-of-speech segment tracking
      vad_turn_start_timeout: '0'      // Stops silence window connection drops
    });

    const dgUrl = `wss://${targetDomain}/v1/listen?${queryParams.toString()}`;
    
    try {
      const dgSocket = new WebSocket(dgUrl, ['token', apiKey.trim()]);
      dgSocketRef.current = dgSocket;

      dgSocket.onopen = () => {
        logAction(`Deepgram live engine pipe opened successfully on ${targetDomain}.`);
        setAgentState('idle');
        isReconnectingRef.current = false;
        connectionAttemptsRef.current = 0;
        
        keepAliveIntervalRef.current = setInterval(() => {
          if (dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
            dgSocketRef.current.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 10000);

        try {
          if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
            const audioOnlyStream = new MediaStream(stream.getAudioTracks());

            let options = { mimeType: 'audio/webm;codecs=opus' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              options = { mimeType: 'audio/ogg;codecs=opus' };
            }
            
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              mediaRecorderRef.current = new MediaRecorder(audioOnlyStream);
            } else {
              mediaRecorderRef.current = new MediaRecorder(audioOnlyStream, options);
            }

            mediaRecorderRef.current.ondataavailable = (event) => {
              if (event.data && event.data.size > 0 && dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
                dgSocketRef.current.send(event.data);
              }
            };

            mediaRecorderRef.current.start(250);
            logAction('Microphone binary slice engine started successfully.');
          }
        } catch (recorderErr) {
          logAction('MediaRecorder Exception caught', recorderErr);
        }
      };

      dgSocket.onmessage = (message) => {
        try {
          const receivedData = JSON.parse(message.data);
          const transcript = receivedData.channel?.alternatives[0]?.transcript;

          if (transcript && transcript.trim() !== "") {
            // Overwrite directly into the single point text holder
            setCurrentText(transcript.trim());
            logAction('Live Audio Stream Text Mutation', { text: transcript.trim() });
          }
        } catch (parseErr) {
          // Safe protection fallback
        }
      };

      dgSocket.onerror = (err) => {
        logAction('Deepgram WebSocket Error Caught.', err);
      };

      dgSocket.onclose = (event) => {
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current);
          keepAliveIntervalRef.current = null;
        }
        dgSocketRef.current = null;

        if (!explicitDisconnectRef.current) {
          connectionAttemptsRef.current += 1;
          logAction(`Deepgram link dropped (Code: ${event.code}). Retrying standard core pipeline mapping...`);
          setAgentState('offline');
          
          if (!isReconnectingRef.current) {
            isReconnectingRef.current = true;
            setTimeout(() => {
              if (!explicitDisconnectRef.current && localStreamRef.current) {
                connectToDeepgram(localStreamRef.current);
              }
            }, 3000);
          }
        } else {
          logAction('Deepgram engine detached cleanly.');
        }
      };
    } catch (e) {
      logAction('WebSocket immediate exception intercepted', e);
    }
  };

  const startWebRtcStream = async () => {
    try {
      explicitDisconnectRef.current = false;
      setIsStreaming(true);
      setCurrentText('');
      logAction('Requesting native multimedia hardware access (Audio + Video)...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: true 
      });
      
      localStreamRef.current = stream;
      logAction('Microphone and Camera streams secured permanently.');

      setTimeout(() => {
        if (videoElementRef.current) {
          videoElementRef.current.srcObject = stream;
          setHasCamera(true);
        }
      }, 50);

      imageCaptureIntervalRef.current = setInterval(() => {
        captureBackgroundSnapshot();
      }, 10000);

      connectToDeepgram(stream);

    } catch (err) {
      console.error('Explicit device access request faulted:', err);
      logAction('CRITICAL', 'Multimedia pipeline blocked.');
      setIsStreaming(false);
      setAgentState('offline');
      setHasCamera(false);
    }
  };

  const stopWebRtcStream = () => {
    explicitDisconnectRef.current = true;
    isReconnectingRef.current = false;
    connectionAttemptsRef.current = 0;

    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }

    if (imageCaptureIntervalRef.current) {
      clearInterval(imageCaptureIntervalRef.current);
      imageCaptureIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch(e){}
      mediaRecorderRef.current = null;
    }

    if (dgSocketRef.current) {
      try { dgSocketRef.current.close(); } catch(e){}
      dgSocketRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setAgentState('offline');
    setHasCamera(false);
    setCurrentText('');
    logAction('Call manually terminated by user. UI Disarmed.');
  };

  if (!hasMounted) {
    return <div className="min-h-screen w-full bg-zinc-950" />;
  }

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-white font-sans overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes sweep-clockwise { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes sweep-counter { 0% { transform: rotate(360deg); } 100% { transform: rotate(0deg); } }
        @keyframes pulse-lucid { 0%, 100% { transform: scale(1); opacity: 0.2; } 50% { transform: scale(1.05); opacity: 0.5; } }
        .animate-sweep-clockwise { animation: sweep-clockwise 10s linear infinite; }
        .animate-sweep-counter { animation: sweep-counter 7s linear infinite; }
        .animate-pulse-lucid { animation: pulse-lucid 4s ease-in-out infinite; }
      `}} />

      {/* LEFT HALF (50%): Control Panel */}
      <div className="w-1/2 h-full flex flex-col items-center justify-between p-12 bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900/40 border-r border-zinc-900 relative">
        <header className="w-full text-left z-20">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight uppercase">NaviSense</span>
          </div>
        </header>

        {/* Core Rotating Orb */}
        <div className="relative flex items-center justify-center w-full my-auto z-10">
          <div className="absolute rounded-full pointer-events-none blur-3xl opacity-20 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 w-[240px] h-[240px]" />
          
          <div 
            className="absolute rounded-full pointer-events-none transition-all duration-300 animate-sweep-clockwise bg-gradient-to-tr from-blue-600 via-violet-600 via-purple-500 to-cyan-400 w-[210px] h-[210px]"
            style={{ opacity: isStreaming ? 0.75 : 0.15, boxShadow: isStreaming ? '0 0 25px rgba(6, 182, 212, 0.3)' : 'none' }}
          />
          <div 
            className="absolute rounded-full pointer-events-none transition-all duration-300 animate-sweep-counter bg-gradient-to-bl from-cyan-400 via-emerald-500 via-indigo-500 to-fuchsia-500 mix-blend-screen w-[200px] h-[200px]"
            style={{ opacity: isStreaming ? 0.65 : 0.15 }}
          />

          <div className="absolute size-[160px] rounded-full bg-zinc-950 flex flex-col items-center justify-center overflow-hidden shadow-[inset_0_4px_20px_rgba(0,0,0,0.95)] border border-zinc-900">
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
              <svg width="100%" height="100%" className="absolute inset-0 p-6 animate-pulse-lucid" viewBox="0 0 200 200" fill="none" stroke="currentColor">
                <circle cx="40" cy="40" r="3.5" className="fill-cyan-500 stroke-cyan-500" />
                <circle cx="160" cy="40" r="3.5" className="fill-blue-500 stroke-blue-500" />
                <circle cx="100" cy="165" r="4" className="fill-purple-500 stroke-purple-500" />
                <line x1="40" y1="40" x2="100" y2="165" strokeWidth="0.75" className="stroke-zinc-800" strokeDasharray="4,4" />
                <line x1="160" y1="40" x2="100" y2="165" strokeWidth="0.75" className="stroke-zinc-800" strokeDasharray="4,4" />
              </svg>
            </div>

            <div className="relative flex flex-col items-center justify-center mt-1">
              <div className="w-24 flex justify-between items-center px-1">
                {agentState === 'offline' ? (
                  <>
                    <div className="size-2.5 rounded-full border border-zinc-800 bg-zinc-900 opacity-40" />
                    <div className="size-2.5 rounded-full border border-zinc-800 bg-zinc-900 opacity-40" />
                  </>
                ) : (
                  <>
                    <div className="size-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
                    <div className="size-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
                  </>
                )}
              </div>
              <div className="h-10 w-16 mt-4 flex items-center justify-center">
                {agentState === 'offline' ? (
                  <div className="w-6 h-[2px] bg-zinc-800 rounded-full" />
                ) : (
                  <div className="w-6 h-[2.5px] bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.6)] animate-pulse" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Control Bar Area */}
        <div className="w-full relative min-h-[160px] flex flex-col items-center justify-end z-20 gap-2">
          
          {/* Direct Text Layer (Elevated slightly higher with pb-8 to remain clearly visible above buttons) */}
          {isStreaming && currentText && (
            <div className="w-full max-w-md px-4 pb-8 text-center font-mono text-[13px] text-cyan-400 font-medium tracking-wide select-none pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
              {currentText}
            </div>
          )}

          <div className="w-full flex items-center justify-center relative min-h-[56px]">
            {/* Bottom-Left Corner Camera Feed Box */}
            {isStreaming && (
              <div className="absolute left-0 bottom-0 w-36 h-28">
                <div className="w-full h-full bg-zinc-900/60 rounded-xl border border-zinc-800/80 overflow-hidden shadow-xl backdrop-blur-md transition-all duration-300 hover:border-zinc-700/60 animate-in fade-in zoom-in-95 duration-200">
                  <video 
                    ref={videoElementRef}
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover scale-x-[-1] transition-opacity duration-300"
                    style={{ opacity: hasCamera ? 1 : 0 }}
                  />
                  
                  {!hasCamera && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-zinc-600 font-mono text-[9px] tracking-wider text-center p-2 select-none">
                      <VideoOff className="size-4 text-zinc-700 animate-pulse" />
                      <span>CAM MUTED</span>
                    </div>
                  )}

                  {hasCamera && (
                    <div className="absolute top-2 left-2 bg-emerald-500/20 border border-emerald-500/30 rounded px-1 py-0.5 text-[7px] font-mono font-bold text-emerald-400 tracking-widest uppercase flex items-center gap-1">
                      <span className="size-1 rounded-full bg-emerald-400 animate-ping" />
                      LIVE LOOP
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Centered Trigger Button */}
            <div className="flex items-center justify-center h-20 pb-1 z-30">
              {!isStreaming ? (
                <button
                  onClick={startWebRtcStream}
                  className="group p-4 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700/80 rounded-full transition-all duration-300 active:scale-90 shadow-md shadow-black/40 relative pointer-events-auto"
                >
                  <MicOff className="size-5 text-zinc-500 group-hover:text-zinc-300 transition-colors duration-200" />
                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-wider text-zinc-600 font-mono font-bold uppercase transition-colors group-hover:text-zinc-400">
                    UNARMED
                  </span>
                </button>
              ) : (
                <button
                  onClick={stopWebRtcStream}
                  className="group p-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-full transition-all duration-300 active:scale-90 shadow-lg shadow-cyan-500/20 relative pointer-events-auto"
                >
                  <Mic className="size-5 text-white" />
                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-widest text-cyan-400 font-mono font-bold uppercase">
                    ARMED
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT HALF (50%): Radiant Full-Color Design Viewport */}
      <div className="w-1/2 h-full bg-zinc-950 relative flex items-center justify-center p-8 overflow-hidden group">
        <div className="w-full h-full rounded-2xl border border-zinc-900 bg-zinc-950/80 overflow-hidden flex items-center justify-center relative shadow-2xl">
          <div className="absolute inset-0 opacity-[0.015] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
          <img 
            src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200" 
            alt="Showcase" 
            className="w-full h-full object-cover transition-all duration-1000 opacity-80 group-hover:scale-105 group-hover:opacity-100"
          />
          <div className="absolute bottom-4 right-4 bg-zinc-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-900 font-mono text-[9px] tracking-widest text-zinc-400 uppercase">
            Display Context Image Window
          </div>
        </div>
      </div>
    </div>
  );
}