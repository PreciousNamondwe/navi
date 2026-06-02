'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Mic, MicOff, Play, RotateCcw, ArrowRight, Database, Volume2, Eye, MapPin, Landmark } from 'lucide-react';

export default function AutoWayfindingUI() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [agentState, setAgentState] = useState<'offline' | 'listening' | 'processing' | 'speaking'>('offline');
  
  const [currentText, setCurrentText] = useState<string>('');
  const [voiceIntentQuery, setVoiceIntentQuery] = useState<string>("");

  // Live Convex Graph Pathway Query Hook matching the relational BFS handler
  const liveConvexRoute = useQuery(api.routes.getWayfindingSequence, {
    transcriptInput: voiceIntentQuery
  });

  const [currentNodeIndex, setCurrentNodeIndex] = useState<number>(-1);
  const [isOrbSpeaking, setIsOrbSpeaking] = useState<boolean>(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const dgSocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const explicitDisconnectRef = useRef<boolean>(false);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedSpeechRef = useRef<string>("");

  // Deepgram Audio API Elements
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // CRITICAL: Safety gate keeping track of speech states inside the raw socket event listener
  const blockAudioProcessingRef = useRef<boolean>(false);
  const isStreamingRef = useRef(isStreaming);

  useEffect(() => {
    setHasMounted(true);
    console.log('%c[System Ready]: Fixed-Origin Wayfinding Active. Anchored to Main Entrance Reception.', 'color: #06b6d4; font-weight: bold;');
    
    // Initialize Web Audio Context cleanly upon client-side load
    if (typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    return () => {
      explicitDisconnectRef.current = true;
      clearSilenceTimer();
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
      if (mediaRecorderRef.current?.state !== 'inactive') {
        try { mediaRecorderRef.current?.stop(); } catch(e){}
      }
      dgSocketRef.current?.close();
      stopDeepgramTTS();
    };
  }, []);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Triggers automated slide playback once the database traces a valid route
  useEffect(() => {
    if (voiceIntentQuery.trim() === "") {
      if (!blockAudioProcessingRef.current) {
        setAgentState(isStreamingRef.current ? 'listening' : 'offline');
      }
      setCurrentNodeIndex(-1);
      return;
    }

    if (liveConvexRoute && liveConvexRoute.slides && liveConvexRoute.slides.length > 0) {
      console.log(`%c[Route Found]: ${liveConvexRoute.slides.length} edge segments linked from Reception.`, 'color: #10b981; font-weight: bold;');
      setAgentState('speaking');
      setCurrentNodeIndex(0); 
    } else if (liveConvexRoute === null && voiceIntentQuery !== "") {
      console.log('%c[Route Lookup Failed]: No matched path vector found in database.', 'color: #ef4444; font-weight: bold;');
      setAgentState(isStreamingRef.current ? 'listening' : 'offline');
      setCurrentNodeIndex(-1);
    }
  }, [liveConvexRoute, voiceIntentQuery]);

  // Processes each sequential node instruction through Deepgram Aura TTS
  useEffect(() => {
    if (currentNodeIndex >= 0 && liveConvexRoute?.slides) {
      const activeSlide = liveConvexRoute.slides[currentNodeIndex];
      if (activeSlide) {
        console.log(`%c[Traversing Step ${currentNodeIndex + 1}]: ${activeSlide.stepTitle}`, 'color: #22d3ee; font-weight: bold;');
        speakNodeInstruction(activeSlide.description);
      }
    } else {
      setIsOrbSpeaking(false);
    }
  }, [currentNodeIndex, liveConvexRoute]);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const handleUserSilenceEndpoint = () => {
    if (blockAudioProcessingRef.current) return;

    let finalSpeechText = accumulatedSpeechRef.current.trim();
    if (!finalSpeechText || finalSpeechText.length < 2 || finalSpeechText === "." || finalSpeechText.toLowerCase() === "a.") return;

    finalSpeechText = finalSpeechText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    finalSpeechText = finalSpeechText.replace(/\s+/g, " ").trim();
    finalSpeechText = finalSpeechText.toLowerCase();

    console.log(`%c[Target Destination Spoken & Sanitized]: "${finalSpeechText}"`, 'color: #a855f7; font-weight: bold;');
    setAgentState('processing');
    setVoiceIntentQuery(finalSpeechText);
  };

  const stopDeepgramTTS = () => {
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
      } catch (e) {}
      currentAudioSourceRef.current.disconnect();
      currentAudioSourceRef.current = null;
    }
  };

  const speakNodeInstruction = async (text: string) => {
    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || "";
    if (!apiKey || apiKey === "YOUR_DEEPGRAM_API_KEY") {
      console.error("Deepgram API Key is missing.");
      return;
    }

    stopDeepgramTTS();

    try {
      blockAudioProcessingRef.current = true; // LOCK OUT MICROPHONE TRANSCRIPTS
      setIsOrbSpeaking(true);
      setAgentState('speaking');
      clearSilenceTimer();

      // Pause MediaRecorder tracking during system vocalizations to keep the WebSocket pipe clean
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.pause();
      }

      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) throw new Error("Deepgram TTS API error.");

      const audioBuffer = await response.arrayBuffer();
      if (!audioContextRef.current) return;

      audioContextRef.current.decodeAudioData(audioBuffer, (decodedBuffer) => {
        const source = audioContextRef.current!.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(audioContextRef.current!.destination);
        currentAudioSourceRef.current = source;

        source.onended = () => {
          handleSpeechSegmentPlaybackEnded();
        };

        source.start(0);
      }, (err) => {
        console.error("Failed to decode raw Deepgram audio stream format:", err);
        handleSpeechErrorFallback();
      });

    } catch (err) {
      console.error("Deepgram TTS Generation Pipeline error:", err);
      handleSpeechErrorFallback();
    }
  };

  const handleSpeechSegmentPlaybackEnded = () => {
    // Resume listening capabilities cleanly right as the system closes its voice node
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
    }

    if (liveConvexRoute?.slides) {
      const totalSlides = liveConvexRoute.slides.length;
      if (currentNodeIndex < totalSlides - 1) {
        setTimeout(() => {
          setCurrentNodeIndex(prev => prev + 1);
        }, 1200);
      } else {
        console.log('%c[Destination Arrived]: Wayfinding map sequence finished processing.', 'color: #10b981; font-weight: bold;');
        
        stopDeepgramTTS();
        
        // Clean state flush
        setCurrentText("");
        setCurrentNodeIndex(-1);
        setVoiceIntentQuery("");
        accumulatedSpeechRef.current = "";
        
        // Release audio blocks and shift back to active listening state safely
        blockAudioProcessingRef.current = false;
        setIsOrbSpeaking(false);
        
        if (isStreamingRef.current) {
          setAgentState('listening');
          console.log("🎤 Kiosk mic reopened. Ready for next destination query...");
        } else {
          setAgentState('offline');
        }
      }
    }
  };

  const handleSpeechErrorFallback = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
    }
    blockAudioProcessingRef.current = false;
    setIsOrbSpeaking(false);
    setAgentState(isStreamingRef.current ? 'listening' : 'offline');
  };

  const connectToDeepgram = (stream: MediaStream) => {
    if (dgSocketRef.current) return;
    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || "";
    if (!apiKey || apiKey === "YOUR_DEEPGRAM_API_KEY") return;

    setAgentState('listening');

    try {
      const dgSocket = new WebSocket(`wss://api.deepgram.com/v1/listen?model=nova-2&interim_results=true&smart_format=true`, ['token', apiKey.trim()]);
      dgSocketRef.current = dgSocket;

      dgSocket.onopen = () => {
        if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = setInterval(() => {
          if (dgSocketRef.current?.readyState === WebSocket.OPEN) {
            dgSocketRef.current.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 7000); // Tightened keepalive to prevent dead sockets during long speech playbacks

        const audioOnlyStream = new MediaStream(stream.getAudioTracks());
        mediaRecorderRef.current = new MediaRecorder(audioOnlyStream);
        mediaRecorderRef.current.ondataavailable = (event) => {
          // Drop silent processing or empty blocks when system speech blocks are enabled
          if (blockAudioProcessingRef.current) return;

          if (event.data?.size > 0 && dgSocketRef.current?.readyState === WebSocket.OPEN) {
            dgSocketRef.current.send(event.data);
          }
        };
        mediaRecorderRef.current.start(250);
      };

      dgSocket.onmessage = (message) => {
        if (blockAudioProcessingRef.current) return; 

        try {
          const receivedData = JSON.parse(message.data);
          const transcript = receivedData.channel?.alternatives[0]?.transcript;

          if (transcript?.trim()) {
            setCurrentText(transcript.trim());
            accumulatedSpeechRef.current = transcript.trim();
            
            clearSilenceTimer();
            silenceTimerRef.current = setTimeout(() => {
              handleUserSilenceEndpoint();
            }, 1400);
          }
        } catch (parseErr) {}
      };

      dgSocket.onclose = () => {
        if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
        dgSocketRef.current = null;
        
        if (!explicitDisconnectRef.current) {
          setAgentState('offline');
          
          if (typeof window !== 'undefined' && !navigator.onLine) {
            console.warn("⚠️ Network offline. Pausing Deepgram reconnect loop.");
            
            const handleOnline = () => {
              console.log("📶 Network restored. Re-establishing audio stream...");
              if (!explicitDisconnectRef.current && localStreamRef.current) {
                connectToDeepgram(localStreamRef.current);
              }
              window.removeEventListener('online', handleOnline);
            };
            window.addEventListener('online', handleOnline);
            return;
          }

          setTimeout(() => {
            if (!explicitDisconnectRef.current && localStreamRef.current) {
              connectToDeepgram(localStreamRef.current);
            }
          }, 2000); // Shorter cooldown window for faster audio recovery
        }
      };
    } catch (e) {}
  };

  const startWebRtcStream = async () => {
    try {
      explicitDisconnectRef.current = false;
      setIsStreaming(true);
      setCurrentText('');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: true 
      });
      localStreamRef.current = stream;
      setTimeout(() => {
        if (videoElementRef.current) videoElementRef.current.srcObject = stream;
      }, 50);
      connectToDeepgram(stream);
    } catch (err) {
      setIsStreaming(false);
      setAgentState('offline');
    }
  };

  const stopWebRtcStream = () => {
    explicitDisconnectRef.current = true;
    clearSilenceTimer();
    if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      try { mediaRecorderRef.current?.stop(); } catch(e){}
    }
    dgSocketRef.current?.close();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    if (videoElementRef.current) videoElementRef.current.srcObject = null;
    
    stopDeepgramTTS();

    setIsStreaming(false);
    setAgentState('offline');
    setCurrentText('');
    setCurrentNodeIndex(-1);
    setVoiceIntentQuery("");
    setIsOrbSpeaking(false);
    blockAudioProcessingRef.current = false;
    accumulatedSpeechRef.current = "";
  };

  const clearActiveSequence = () => {
    clearSilenceTimer();
    setCurrentNodeIndex(-1);
    setVoiceIntentQuery("");
    setIsOrbSpeaking(false);
    blockAudioProcessingRef.current = false;
    setCurrentText("");
    accumulatedSpeechRef.current = "";
    setAgentState(isStreamingRef.current ? 'listening' : 'offline');
    stopDeepgramTTS();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
    }
  };

  if (!hasMounted) return <div className="min-h-screen w-full bg-zinc-950" />;
  
  const activeSlideNode = (liveConvexRoute && liveConvexRoute.slides && currentNodeIndex >= 0) 
    ? liveConvexRoute.slides[currentNodeIndex] 
    : null;

  const getCleanAssetUrl = (urlStr: string) => {
    if (!urlStr) return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200";
    if (urlStr.startsWith("http://") || urlStr.startsWith("https://") || urlStr.startsWith("data:")) return urlStr;
    
    let baseUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    
    const cleanStorageId = urlStr.startsWith("/") ? urlStr.slice(1) : urlStr;
    return `${baseUrl}/api/storage/${cleanStorageId}`;
  };

  const isCurrentlyComputing = voiceIntentQuery.trim() !== "" && liveConvexRoute === undefined;
  const rawImageUrl = activeSlideNode?.image;
  const cleanImgSrc = rawImageUrl ? getCleanAssetUrl(rawImageUrl) : null;
  const fallbackPlaceholder = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200";

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-white font-sans overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes sweep-clockwise { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes speaking-vocal-ball { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); filter: brightness(1.25); } }
        .animate-sweep-clockwise { animation: sweep-clockwise 12s linear infinite; }
        .animate-speaking-ball { animation: speaking-vocal-ball 0.35s ease-in-out infinite; }
      `}} />

      {/* LEFT CONTROL AND SPEECH COLUMN */}
      <div className="w-1/2 h-full flex flex-col items-center justify-between p-12 bg-gradient-to-b from-zinc-950 to-zinc-900/40 border-r border-zinc-900 relative">
        <header className="w-full flex items-center justify-between z-20">
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight uppercase flex items-center gap-2">
              NaviSense Kiosk <span className="text-[9px] bg-cyan-500/10 text-cyan-400 font-mono tracking-widest px-1.5 py-0.5 rounded border border-cyan-500/20 flex items-center gap-1"><Database className="size-2"/> CONNECTED</span>
            </span>
            <span className="text-[10px] text-zinc-500 font-mono tracking-wider">MUBAS ODeL Wayfinding System • Fixed Origin Path Tracking</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                clearSilenceTimer();
                setAgentState('processing');
                setVoiceIntentQuery("auditorium");
              }}
              className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-md text-[11px] font-mono hover:border-cyan-500/50 transition-all flex items-center gap-1.5"
            >
              <Play className="size-3 text-cyan-400" /> Simulate Target "Auditorium"
            </button>
            {currentNodeIndex >= 0 && (
              <button onClick={clearActiveSequence} className="p-1 bg-zinc-900 border border-zinc-800 rounded-md hover:border-red-500/50 transition-all">
                <RotateCcw className="size-3.5 text-zinc-400" />
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Voice Core Visualizer */}
        <div className="relative flex items-center justify-center w-full my-auto z-10">
          <div className="absolute rounded-full pointer-events-none blur-3xl opacity-20 bg-gradient-to-r from-blue-600 to-cyan-500 w-[240px] h-[240px]" />
          <div className={`absolute rounded-full pointer-events-none transition-all duration-300 animate-sweep-clockwise bg-gradient-to-tr from-blue-600 via-purple-500 to-cyan-400 w-[210px] h-[210px] ${isOrbSpeaking ? 'animate-speaking-ball' : ''}`} style={{ opacity: isStreaming || isOrbSpeaking ? 0.85 : 0.15 }} />

          <div className="absolute size-[160px] rounded-full bg-zinc-950 flex flex-col items-center justify-center border border-zinc-900 shadow-[inset_0_4px_20px_rgba(0,0,0,0.95)]">
            <div className="relative flex flex-col items-center justify-center">
              <div className="w-24 flex justify-between items-center px-2">
                <div className={`size-2.5 rounded-full bg-cyan-400 ${agentState === 'listening' ? 'animate-pulse' : isOrbSpeaking ? 'animate-bounce' : ''}`} />
                <div className={`size-2.5 rounded-full bg-cyan-400 ${agentState === 'listening' ? 'animate-pulse [animation-delay:0.2s]' : isOrbSpeaking ? 'animate-bounce [animation-delay:0.12s]' : ''}`} />
              </div>
              <div className="h-10 mt-4 flex items-center justify-center">
                {agentState === 'processing' || isCurrentlyComputing ? (
                  <div className="size-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                ) : isOrbSpeaking ? (
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1 bg-cyan-400 rounded-full h-4 animate-pulse" />
                    <span className="w-1 bg-indigo-400 rounded-full h-6 animate-pulse [animation-delay:0.1s]" />
                    <span className="w-1 bg-purple-400 rounded-full h-3 animate-pulse [animation-delay:0.2s]" />
                  </div>
                ) : (
                  <div className="w-6 h-[2.5px] bg-cyan-400/80 rounded-full animate-pulse" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* STATUS AND ON-SCREEN TEXT PANEL */}
        <div className="w-full relative min-h-[180px] flex flex-col items-center justify-end z-20 gap-2">
          <span className={`text-[9px] font-mono tracking-widest font-bold px-2 py-0.5 rounded-full border uppercase ${
            agentState === 'speaking' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
          }`}>
            {agentState === 'listening' ? '● State Destination' : (agentState === 'processing' || isCurrentlyComputing) ? 'Computing Shortest Path Matrix...' : agentState === 'speaking' ? 'Auto-Advancing Slideshow Active' : 'Offline'}
          </span>

          {activeSlideNode ? (
            <div className="w-full max-w-lg px-4 pb-4 font-sans text-sm text-cyan-100 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 backdrop-blur-sm flex items-start gap-3">
              <Volume2 className="size-4 mt-1 text-cyan-400 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-1">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest block">
                    Segment Layer {currentNodeIndex + 1} of {liveConvexRoute?.slides.length}
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono font-bold bg-cyan-950/40 border border-cyan-900 px-1.5 py-0.5 rounded">
                    {activeSlideNode.walkingTime}s walk
                  </span>
                </div>
                
                <span className="text-zinc-400 text-xs block font-mono bg-zinc-950 p-2 rounded border border-zinc-900 text-center font-bold">
                  From: {activeSlideNode.originNodeLabel} ➔ To: {activeSlideNode.targetNodeLabel}
                </span>

                <p className="text-white text-[13px] leading-relaxed font-medium pt-1">
                  "{activeSlideNode.textDirection}"
                </p>

                {activeSlideNode.isLandmark && (
                  <span className="mt-1 inline-flex items-center gap-1.5 text-[9px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded">
                    <Eye className="size-3" /> Landmark Detected: {activeSlideNode.landmarkType || "Structural Junction"}
                  </span>
                )}
              </div>
            </div>
          ) : isStreaming && currentText && (
            <div className="w-full max-w-md px-4 pb-6 text-center font-mono text-[13px] text-cyan-400 font-medium tracking-wide">
              "{currentText}"
            </div>
          )}

          <div className="w-full flex items-center justify-center relative min-h-[56px]">
            {isStreaming && (
              <div className="absolute left-0 bottom-0 w-36 h-28 opacity-40">
                <video ref={videoElementRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1] rounded-xl border border-zinc-800" />
              </div>
            )}
            <div className="flex items-center justify-center h-20 z-30">
              {!isStreaming ? (
                <button onClick={startWebRtcStream} className="p-4 bg-zinc-900 border border-zinc-800 rounded-full transition-all hover:border-cyan-500">
                  <MicOff className="size-5 text-zinc-500" />
                </button>
              ) : (
                <button onClick={stopWebRtcStream} className="p-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-full transition-all">
                  <Mic className="size-5 text-white" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT DISPLAY VIEWPORT PANEL */}
      <div className="w-1/2 h-full bg-zinc-950 relative flex items-center justify-center p-8 overflow-hidden">
        <div className="w-full h-full rounded-2xl border border-zinc-900 bg-zinc-950/80 overflow-hidden flex flex-col relative shadow-2xl">
          
          <div className="w-full flex-1 bg-zinc-900/40 relative overflow-hidden flex items-center justify-center">
            {isCurrentlyComputing ? (
              <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-3">
                <div className="size-8 rounded-full border-4 border-cyan-500/30 border-t-cyan-400 animate-spin" />
                <span className="text-xs font-mono text-zinc-400 tracking-wider">Tracing Graph Edges...</span>
              </div>
            ) : (
              <img 
                src={cleanImgSrc || fallbackPlaceholder} 
                alt="Wayfinding Landmark View" 
                className="w-full h-full object-cover transition-all duration-500 opacity-90"
                onError={(e) => {
                  console.warn("Convex asset URL failed to resolve or load. Defaulting to placeholder graphic.");
                  e.currentTarget.src = fallbackPlaceholder;
                }}
                key={`slide-frame-${currentNodeIndex}`}
              />
            )}

            {/* Strict Structural Dynamic Label Overlay */}
            <div className="absolute top-4 left-4 right-4 bg-zinc-950/90 backdrop-blur-md p-3 rounded-xl border border-zinc-800 flex items-center justify-between gap-4 shadow-xl">
              <div className="flex flex-col gap-0.5 truncate">
                <span className="text-[9px] font-mono tracking-widest text-cyan-400 uppercase flex items-center gap-1.5 font-bold">
                  <MapPin className="size-2.5 text-cyan-400 animate-pulse" /> Active Path Vector Frame
                </span>
                <span className="text-xs font-bold font-sans text-white truncate">
                  {activeSlideNode ? activeSlideNode.stepTitle : (liveConvexRoute && liveConvexRoute.destination) ? `Target: ${liveConvexRoute.destination}` : "Awaiting Spoken Destination Phrase..."}
                </span>
              </div>
              
              {activeSlideNode?.isLandmark && (
                <div className="bg-purple-500/10 border border-purple-500/30 text-purple-400 text-[10px] px-2.5 py-1 rounded-lg font-mono flex items-center gap-1 shrink-0">
                  <Landmark className="size-3" /> {activeSlideNode.landmarkType?.toUpperCase() || "LANDMARK"}
                </div>
              )}
            </div>

            {currentNodeIndex === -1 && !isCurrentlyComputing && (!liveConvexRoute || voiceIntentQuery === "") && (
              <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                <p className="text-sm font-medium max-w-sm text-zinc-400 leading-relaxed font-sans">
                  Please say your destination (e.g., <span className="text-cyan-400 font-semibold font-mono">"Take me to Auditorium"</span>). The system will search from the Main Entrance Reception and auto-advance through the path segments.
                </p>
              </div>
            )}
          </div>

          {/* Sequential Path Nodes Progression Indicator */}
          {liveConvexRoute && liveConvexRoute.slides && currentNodeIndex >= 0 && (
            <div className="w-full border-t border-zinc-900 bg-zinc-950 px-6 py-4 flex items-center justify-between shadow-2xl">
              <div className="flex flex-col max-w-[40%] truncate">
                <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase font-bold">Destination Target</span>
                <span className="text-xs font-bold text-zinc-300 truncate">{liveConvexRoute.destination}</span>
              </div>
              
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-[60%] py-1 pl-2">
                {liveConvexRoute.slides.map((slide, idx) => (
                  <div key={slide.id || idx} className="flex items-center shrink-0">
                    <div 
                      title={slide.stepTitle}
                      className={`size-3 rounded-full transition-all duration-300 cursor-help ${
                        idx === currentNodeIndex ? 'bg-cyan-400 ring-4 ring-cyan-500/20 scale-125' : 
                        idx < currentNodeIndex ? 'bg-emerald-500' : 'bg-zinc-800'
                      }`} 
                    />
                    {idx < liveConvexRoute.slides.length - 1 && <ArrowRight className="size-3 mx-1 text-zinc-700 shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}