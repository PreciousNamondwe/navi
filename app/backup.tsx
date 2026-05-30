'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';

export default function CleanAgentUI() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [agentState, setAgentState] = useState<'offline' | 'idle' | 'connecting'>('offline');

  // Core Media Stream Reference (Kept alive during reconnects)
  const localStreamRef = useRef<MediaStream | null>(null);

  // Deepgram Live Streaming WebSocket and Recorder References
  const dgSocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const explicitDisconnectRef = useRef<boolean>(false);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isReconnectingRef = useRef<boolean>(false);

  // Helper to log actions exclusively to the browser console
  const logAction = (actionName: string, details: any = '') => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + `.${String(now.getMilliseconds()).padStart(3, '0')}`;
    console.log(`%c[${timeStr}] [Deepgram Agent Action]: ${actionName}`, 'color: #22d3ee; font-weight: bold;', details);
  };

  // Background socket connector loop
  const connectToDeepgram = (stream: MediaStream) => {
    if (dgSocketRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || "";
    if (!apiKey || apiKey === "YOUR_DEEPGRAM_API_KEY") {
      logAction('CRITICAL', 'Deepgram API Key is missing! Check your .env.local file.');
      alert('API Key Error: Please make sure NEXT_PUBLIC_DEEPGRAM_API_KEY is defined.');
      return;
    }

    setAgentState('connecting');
    logAction('Opening secure Deepgram Real-Time WebSocket Channel...');
    
    const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&interim_results=true&smart_format=true&timeout=300`;
    const dgSocket = new WebSocket(dgUrl, ['token', apiKey.trim()]);
    dgSocketRef.current = dgSocket;

    dgSocket.onopen = () => {
      logAction('Deepgram live engine pipe opened successfully.');
      setAgentState('idle');
      isReconnectingRef.current = false;
      
      // Ping socket setup to handle silence frame gaps
      keepAliveIntervalRef.current = setInterval(() => {
        if (dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
          dgSocketRef.current.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, 10000);

      try {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
          let options = { mimeType: 'audio/webm;codecs=opus' };
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'audio/ogg;codecs=opus' };
          }
          
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            mediaRecorderRef.current = new MediaRecorder(stream);
          } else {
            mediaRecorderRef.current = new MediaRecorder(stream, options);
          }

          mediaRecorderRef.current.ondataavailable = (event) => {
            if (event.data && event.data.size > 0 && dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
              dgSocketRef.current.send(event.data);
            }
          };

          mediaRecorderRef.current.start(250);
          logAction('Microphone binary slice engine started.');
        }
      } catch (recorderErr) {
        logAction('MediaRecorder Exception caught', recorderErr);
      }
    };

    dgSocket.onmessage = (message) => {
      try {
        const receivedData = JSON.parse(message.data);
        const transcript = receivedData.channel?.alternatives[0]?.transcript;
        const isFinal = receivedData.is_final;

        if (transcript && transcript.trim() !== "") {
          if (isFinal) {
            logAction('Final Transcription Confirmed 📢', { text: transcript.trim() });
          } else {
            logAction('Streaming Text (Interim Draft) ⏳', { text: transcript.trim() });
          }
        }
      } catch (parseErr) {
        // Drop metadata checks safely
      }
    };

    dgSocket.onerror = (err) => {
      logAction('Deepgram WebSocket Error Caught:', err);
    };

    dgSocket.onclose = (event) => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      dgSocketRef.current = null;

      // Handle the call fallback auto-reconnect if it wasn't a manual click
      if (!explicitDisconnectRef.current) {
        logAction(`Deepgram link dropped (Code: ${event.code}). Retrying link channel connection in background...`);
        setAgentState('offline');
        
        if (!isReconnectingRef.current) {
          isReconnectingRef.current = true;
          setTimeout(() => {
            if (!explicitDisconnectRef.current && localStreamRef.current) {
              connectToDeepgram(localStreamRef.current);
            }
          }, 2000);
        }
      } else {
        logAction('Deepgram engine detached cleanly.');
      }
    };
  };

  const startWebRtcStream = async () => {
    try {
      explicitDisconnectRef.current = false;
      setIsStreaming(true);
      logAction('Requesting native microphone hardware access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      logAction('Microphone stream secured permanently for this session.');

      connectToDeepgram(stream);

    } catch (err) {
      console.error('Failed to initialize call infrastructure:', err);
      logAction('CRITICAL: Microphone access denied or pipeline failure.');
      setIsStreaming(false);
      setAgentState('offline');
    }
  };

  const stopWebRtcStream = () => {
    explicitDisconnectRef.current = true;
    isReconnectingRef.current = false;

    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
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

    setIsStreaming(false);
    setAgentState('offline');
    logAction('Call manually terminated by user. UI Disarmed.');
  };

  useEffect(() => {
    logAction('NaviSense Agent Core Engine booted via Deepgram Integration.');
    return () => {
      explicitDisconnectRef.current = true;
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch(e){}
      }
      if (dgSocketRef.current) {
        try { dgSocketRef.current.close(); } catch(e){}
      }
    };
  }, []);

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

      {/* LEFT HALF (50%): Original Face Canvas Setup */}
      <div className="w-1/2 h-full flex flex-col items-center justify-between p-12 bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900/40 border-r border-zinc-900">
        <header className="w-full text-left">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight uppercase">NaviSense</span>
            <span className="text-[9px] bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded text-cyan-400 font-mono font-bold tracking-wider">DEEPGRAM MATRIX ENGINE</span>
          </div>
        </header>

        <div className="relative flex items-center justify-center w-full my-auto">
          <div className="absolute rounded-full pointer-events-none blur-3xl opacity-20 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 w-[370px] h-[370px]" />
          
          {/* Your original ring structure, glowing as long as mic capture is active */}
          <div 
            className="absolute rounded-full pointer-events-none transition-all duration-300 animate-sweep-clockwise bg-gradient-to-tr from-blue-600 via-violet-600 via-purple-500 to-cyan-400 w-[340px] h-[340px]"
            style={{ opacity: isStreaming ? 0.75 : 0.15, boxShadow: isStreaming ? '0 0 35px rgba(6, 182, 212, 0.3)' : 'none' }}
          />
          <div 
            className="absolute rounded-full pointer-events-none transition-all duration-300 animate-sweep-counter bg-gradient-to-bl from-cyan-400 via-emerald-500 via-indigo-500 to-fuchsia-500 mix-blend-screen w-[325px] h-[325px]"
            style={{ opacity: isStreaming ? 0.65 : 0.15 }}
          />

          <div className="absolute size-[265px] rounded-full bg-zinc-950 z-10 flex flex-col items-center justify-center overflow-hidden shadow-[inset_0_4px_30px_rgba(0,0,0,0.95)] border border-zinc-900">
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
              <svg width="100%" height="100%" className="absolute inset-0 p-8 animate-pulse-lucid" viewBox="0 0 200 200" fill="none" stroke="currentColor">
                <circle cx="40" cy="40" r="3.5" className="fill-cyan-500 stroke-cyan-500" />
                <circle cx="160" cy="40" r="3.5" className="fill-blue-500 stroke-blue-500" />
                <circle cx="100" cy="165" r="4" className="fill-purple-500 stroke-purple-500" />
                <line x1="40" y1="40" x2="100" y2="165" strokeWidth="0.75" className="stroke-zinc-800" strokeDasharray="4,4" />
                <line x1="160" y1="40" x2="100" y2="165" strokeWidth="0.75" className="stroke-zinc-800" strokeDasharray="4,4" />
                <line x1="40" y1="40" x2="160" y2="40" strokeWidth="0.75" className="stroke-zinc-800" />
              </svg>
            </div>

            <div className="relative flex flex-col items-center justify-center z-20 mt-2">
              <div className="w-40 flex justify-between items-center px-2">
                {agentState === 'offline' ? (
                  <>
                    <div className="size-4 rounded-full border-2 border-zinc-800 bg-zinc-900 opacity-40" />
                    <div className="size-4 rounded-full border-2 border-zinc-800 bg-zinc-900 opacity-40" />
                  </>
                ) : (
                  <>
                    <div className="size-4 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.7)]" />
                    <div className="size-4 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.7)]" />
                  </>
                )}
              </div>
              <div className="h-16 w-20 mt-8 flex items-center justify-center">
                {agentState === 'offline' ? (
                  <div className="w-8 h-[2px] bg-zinc-800 rounded-full" />
                ) : (
                  <div className="w-8 h-[3px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.6)] animate-pulse" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Your Original Button Layout styling matching UNARMED / ARMED state exactly */}
        <div className="flex items-center justify-center h-20 w-full">
          {!isStreaming ? (
            <button
              onClick={startWebRtcStream}
              className="group p-4 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700/80 rounded-full transition-all duration-300 active:scale-90 shadow-md shadow-black/40 relative"
            >
              <MicOff className="size-5 text-zinc-500 group-hover:text-zinc-300 transition-colors duration-200" />
              <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-wider text-zinc-600 font-mono font-bold uppercase transition-colors group-hover:text-zinc-400">
                UNARMED
              </span>
            </button>
          ) : (
            <button
              onClick={stopWebRtcStream}
              className="group p-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-full transition-all duration-300 active:scale-90 shadow-lg shadow-cyan-500/20 relative"
            >
              <Mic className="size-5 text-white" />
              <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-widest text-cyan-400 font-mono font-bold uppercase">
                ARMED
              </span>
            </button>
          )}
        </div>
      </div>

      {/* RIGHT HALF (50%): Design Frame Viewport */}
      <div className="w-1/2 h-full bg-zinc-950 relative flex items-center justify-center p-8 overflow-hidden group">
        <div className="w-full h-full rounded-2xl border border-zinc-900 bg-zinc-950/80 overflow-hidden flex items-center justify-center relative shadow-2xl">
          <div className="absolute inset-0 opacity-[0.015] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
          <img 
            src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200" 
            alt="Showcase" 
            className="w-full h-full object-cover transition-all duration-1000 opacity-40 group-hover:scale-105 group-hover:opacity-50 mix-blend-luminosity"
          />
          <div className="absolute bottom-4 right-4 bg-zinc-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-900 font-mono text-[9px] tracking-widest text-zinc-600 uppercase">
            Display Context Image Window
          </div>
        </div>
      </div>
    </div>
  );
}