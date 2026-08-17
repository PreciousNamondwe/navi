'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { ArrowRight, Camera, MapPin, Navigation, Sparkles } from 'lucide-react';

function getQueryParam(name: string) {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || '';
}

export default function ContinueRoutePage() {
  const [mounted, setMounted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState('Scanning white QR markers...');
  const [scannerReady, setScannerReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeDetectorRef = useRef<any>(null);

  const entityType = getQueryParam('entityType');
  const entityId = getQueryParam('entityId');
  const label = getQueryParam('label');

  const buildingContext = useQuery(api.routes.getBuildingContext);
  const destinationName = useMemo(() => {
    if (!buildingContext) return label || 'Destination';
    if (entityType === 'destination' && entityId) {
      const match = buildingContext.destinations.find((destination: any) => destination._id === entityId);
      if (match) return match.name;
    }
    if (entityType === 'node' && entityId) {
      const match = buildingContext.nodes.find((node: any) => node._id === entityId);
      if (match) return match.label;
    }
    return label || 'Destination';
  }, [buildingContext, entityId, entityType, label]);

  const route = useQuery(api.routes.getWayfindingSequence, {
    transcriptInput: destinationName || label || 'destination',
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof navigator === 'undefined') return;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const BarcodeDetectorCtor = (window as any).BarcodeDetector || (window as any).barcodeDetector;
        if (BarcodeDetectorCtor) {
          try {
            barcodeDetectorRef.current = new BarcodeDetectorCtor({ formats: ['qr_code'] });
            setScannerReady(true);
            setScanStatus('QR anchor detected. Preparing route guidance...');
          } catch (detectorError) {
            console.warn('BarcodeDetector init failed:', detectorError);
            setScannerReady(false);
            setScanStatus('Camera ready. Route guidance is available while the QR marker is detected.');
          }
        } else {
          setScannerReady(false);
          setScanStatus('Camera ready. Route guidance is available while the QR marker is detected.');
        }
      } catch (error) {
        console.error('Camera access failed:', error);
        setCameraError('Camera permission is blocked. Please allow camera access to continue.');
      }
    };

    startCamera();

    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [mounted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !scannerReady || !barcodeDetectorRef.current) return;

    let cancelled = false;

    const detectQr = async () => {
      if (cancelled || !video.videoWidth || !video.videoHeight) return;

      try {
        const codes = await barcodeDetectorRef.current.detect(video);
        if (!codes?.length) return;

        const code = codes[0];
        const raw = String(code.rawValue || '');
        if (!raw) return;

        const params = new URL(raw).searchParams;
        const detectedEntityType = params.get('entityType');
        const detectedEntityId = params.get('entityId');
        const detectedLabel = params.get('label');

        if (detectedEntityType && detectedEntityId) {
          setScanStatus(`QR matched: ${detectedLabel || 'destination'}`);
          if (detectedLabel && detectedLabel !== destinationName) {
            console.log('[QR Scan] detected destination from live camera:', detectedLabel);
          }
        }
      } catch (error) {
        console.warn('Barcode detection failed in browser:', error);
      }
    };

    const intervalId = window.setInterval(detectQr, 1400);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [destinationName, scannerReady]);

  const nextStep = route?.slides?.[0];
  const progressText = route?.slides?.length
    ? `Route ready · ${route.slides.length} steps`
    : 'Calculating best path...';

  const arrowRotation = nextStep?.textDirection?.toLowerCase().includes('left')
    ? '-45deg'
    : nextStep?.textDirection?.toLowerCase().includes('right')
      ? '45deg'
      : '0deg';

  if (!mounted) {
    return <div className="min-h-screen bg-zinc-950" />;
  }

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-slate-950 to-black" />

      <div className="relative z-10 flex h-screen w-full flex-col lg:flex-row">
        <div className="relative flex-1 overflow-hidden bg-zinc-900">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {!cameraError && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(0,0,0,0)_0%,_rgba(0,0,0,0.35)_55%,_rgba(0,0,0,0.75)_100%)]" />
              <div className="absolute left-1/2 top-1/2 h-[44vh] w-[44vh] max-h-[420px] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border-2 border-cyan-400/80 bg-cyan-400/5 shadow-[0_0_20px_rgba(34,211,238,0.35)]" />
              <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
                  <div className="h-8 w-8 rounded-full border-4 border-cyan-400/80" />
                </div>
              </div>
            </div>
          )}

          <div className="absolute left-4 top-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-300">
              <Camera className="h-3.5 w-3.5" />
              Live QR View
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="rounded-2xl border border-white/10 bg-black/50 p-4 backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-[0.26em] text-zinc-400">
                <span>{entityType === 'destination' ? 'Destination' : 'Waypoint'}</span>
                <span>{progressText}</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
                  <MapPin className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-2xl font-black text-white">{destinationName}</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {nextStep ? `Next: ${nextStep.targetNodeLabel}` : 'Route is being calculated'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md border-t border-zinc-800 bg-zinc-950/95 p-5 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" />
            Guided path
          </div>

          <div className="mb-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono uppercase tracking-[0.26em] text-cyan-300">AR cue</p>
              <Navigation className="h-4 w-4 text-cyan-300" />
            </div>
            <div className="mt-4 flex items-center justify-center">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <div className="absolute h-20 w-20 rounded-full border border-cyan-500/40 bg-cyan-500/10" />
                <div
                  className="absolute h-16 w-4 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.8)]"
                  style={{ transform: `rotate(${arrowRotation})` }}
                />
                <div
                  className="absolute h-10 w-10 border-l-4 border-b-4 border-cyan-400"
                  style={{ transform: `rotate(${arrowRotation}) translateY(-4px)` }}
                />
                <div
                  className="absolute h-6 w-6 border-b-4 border-cyan-300"
                  style={{ transform: `rotate(${arrowRotation})` }}
                />
              </div>
            </div>
            <p className="mt-3 text-center text-sm text-zinc-200">
              {nextStep
                ? `${nextStep.textDirection || nextStep.description || 'Follow the highlighted route.'}`
                : 'Hold your phone steady, then follow the on-screen route guidance.'}
            </p>
          </div>

          <div className="mb-4 rounded-xl border border-cyan-500/20 bg-zinc-900/80 p-3">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300">
              <span>Scanner</span>
              <span>{scannerReady ? 'Live' : 'Waiting'}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-200">{scanStatus}</p>
          </div>

          {route?.slides?.length ? (
            <div className="space-y-3">
              {route.slides.slice(0, 3).map((step: any, index: number) => (
                <div key={step.id || index} className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
                    <span>Step {index + 1}</span>
                    <span>{step.walkingTime}s</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white">
                    <ArrowRight className="h-4 w-4 text-cyan-300" />
                    <span>{step.textDirection || step.description}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-sm text-zinc-400">
              Calculating the best route to {destinationName}...
            </div>
          )}

          {cameraError && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              {cameraError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
