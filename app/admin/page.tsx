'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Layers, MapPin, Navigation, Compass, Plus, Info, Upload, FileImage, Loader2, Link2, Zap } from 'lucide-react';

type LandmarkType = 'corridor' | 'staircase' | 'elevator' | 'double-door';

interface VisualNodePosition {
  id: string;
  label: string;
  x: number;
  y: number;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'floors' | 'nodes' | 'destinations' | 'connections'>('floors');
  
  // Real-time data streams
  const data = useQuery(api.admin.listAllData);
  
  // Wire mutation hooks
  const insertFloor = useMutation(api.admin.addFloor);
  const insertNode = useMutation(api.admin.addNode);
  const insertDestination = useMutation(api.admin.addDestination);
  const insertConnection = useMutation(api.admin.addConnection);
  const getUploadUrl = useMutation(api.admin.generateUploadUrl);

  // Form states
  const [floorForm, setFloorForm] = useState({ level: 0, name: '' });
  const [nodeForm, setNodeForm] = useState({ floorId: '', label: '', isLandmark: false, landmarkType: 'corridor' as LandmarkType });
  const [destForm, setDestForm] = useState({ name: '', aliasesRaw: '', floorId: '', description: '', targetNodeId: '' });
  
  // Refactored Interactive Connection state mapping
  const [connForm, setConnForm] = useState({ 
    fromNodeId: '', 
    toNodeId: '', 
    videoSegmentUrl: '', 
    textDirection: '', 
    audioDescription: '', 
    estimatedWalkingTime: 30 
  });

  // Interactive Node Workspace States
  const canvasWorkspaceRef = useRef<HTMLDivElement>(null);
  const [nodeCoordinates, setNodeCoordinates] = useState<VisualNodePosition[]>([]);
  const [draggingFromNodeId, setDraggingFromNodeId] = useState<string | null>(null);
  const [dragMousePos, setDragMousePos] = useState({ x: 0, y: 0 });
  const [activeConnectionDraft, setActiveConnectionDraft] = useState<boolean>(false);

  // File states & input references
  const [floorFile, setFloorFile] = useState<File | null>(null);
  const [connectionFile, setConnectionFile] = useState<File | null>(null);
  const floorFileInputRef = useRef<HTMLInputElement>(null);
  const connFileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Shared function to handle file upload directly to Convex Storage
  const uploadToConvex = async (file: File): Promise<string> => {
    setUploadingFile(true);
    try {
      const uploadUrl = await getUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error("Network upload failure");
      const { storageId } = await result.json();
      return storageId;
    } finally {
      setUploadingFile(false);
    }
  };

  // --- SUBMIT HANDLERS ---
  const handleFloorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let finalFileUrl = undefined;
      if (floorFile) {
        finalFileUrl = await uploadToConvex(floorFile);
      }
      await insertFloor({
        level: Number(floorForm.level),
        name: floorForm.name,
        floorPlanUrl: finalFileUrl,
      });
      setFloorForm({ level: 0, name: '' });
      setFloorFile(null);
      if (floorFileInputRef.current) floorFileInputRef.current.value = '';
      alert('Floor registered successfully.');
    } catch (err) { 
      console.error(err);
      alert('Error saving floor record.'); 
    }
    setLoading(false);
  };

  const handleNodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeForm.floorId) return alert('Select a parent floor layer');
    setLoading(true);
    try {
      await insertNode({
        floorId: nodeForm.floorId as Id<"floors">,
        label: nodeForm.label,
        isLandmark: nodeForm.isLandmark,
        landmarkType: nodeForm.isLandmark ? nodeForm.landmarkType : undefined,
      });
      setNodeForm({ floorId: '', label: '', isLandmark: false, landmarkType: 'corridor' });
      alert('Spatial node anchored successfully.');
    } catch (err) { 
      console.error(err);
      alert('Error inserting node.'); 
    }
    setLoading(false);
  };

  const handleDestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destForm.floorId || !destForm.targetNodeId) return alert('Fill required relational properties.');
    setLoading(true);
    try {
      const parsedAliases = destForm.aliasesRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      await insertDestination({
        name: destForm.name,
        aliases: parsedAliases,
        floorId: destForm.floorId as Id<"floors">,
        description: destForm.description,
        targetNodeId: destForm.targetNodeId as Id<"nodes">,
      });
      setDestForm({ name: '', aliasesRaw: '', floorId: '', description: '', targetNodeId: '' });
      alert('Destination endpoint locked in.');
    } catch (err) { 
      console.error(err);
      alert('Error building destination mapping.'); 
    }
    setLoading(false);
  };

  const handleConnectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connForm.fromNodeId || !connForm.toNodeId) return alert('Requires valid start and end waypoints.');
    if (connForm.fromNodeId === connForm.toNodeId) return alert('Source and Target nodes cannot be identical.');
    if (!connectionFile) return alert('Pathway routes require a landmark helper image asset file uploaded.');
    
    setLoading(true);
    try {
      // FIX: Cleaned up duplicate/broken syntax parameters here
      const fileIdStr = await uploadToConvex(connectionFile);
      
      await insertConnection({
        fromNodeId: connForm.fromNodeId as Id<"nodes">,
        toNodeId: connForm.toNodeId as Id<"nodes">,
        imageUrl: fileIdStr,
        videoSegmentUrl: connForm.videoSegmentUrl || undefined,
        textDirection: connForm.textDirection,
        audioDescription: connForm.audioDescription,
        estimatedWalkingTime: Number(connForm.estimatedWalkingTime),
      });

      setConnForm({ fromNodeId: '', toNodeId: '', videoSegmentUrl: '', textDirection: '', audioDescription: '', estimatedWalkingTime: 30 });
      setConnectionFile(null);
      if (connFileInputRef.current) connFileInputRef.current.value = '';
      setActiveConnectionDraft(false);
      alert('Visual path mapping stored successfully.');
    } catch (err) { 
      console.error(err);
      alert('Failed updating spatial architecture paths.'); 
    }
    setLoading(false);
  };

  // Drag Event Handlers
  const initiateNodeDrag = (nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!canvasWorkspaceRef.current) return;
    const rect = canvasWorkspaceRef.current.getBoundingClientRect();
    setDraggingFromNodeId(nodeId);
    setDragMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const resolveNodeDrop = (targetNodeId: string) => {
    if (!draggingFromNodeId) return;
    if (draggingFromNodeId === targetNodeId) return;

    // Set connection nodes visually from drag interaction
    setConnForm({
      ...connForm,
      fromNodeId: draggingFromNodeId,
      toNodeId: targetNodeId
    });
    setActiveConnectionDraft(true);
    setDraggingFromNodeId(null);
  };

  const activeOriginNodeObject = nodeCoordinates.find(n => n.id === draggingFromNodeId);

  // Helper resolvers to render names instead of raw IDs in list viewer views
  const getFloorName = (floorId: string) => data?.floors?.find(f => f._id === floorId)?.name || 'Unknown Floor';
  const getNodeLabel = (nodeId: string) => data?.nodes?.find(n => n._id === nodeId)?.label || 'Unknown Waypoint';

  // Distribute nodes randomly or mathematically inside the graph workspace on data streams
  useEffect(() => {
    if (data?.nodes) {
      const positions = data.nodes.map((node, index) => {
        const totalNodes = data.nodes.length;
        const radius = Math.min(200, totalNodes * 20);
        const angle = (index / totalNodes) * 2 * Math.PI;
        
        return {
          id: node._id,
          label: node.label,
          x: 240 + radius * Math.cos(angle),
          y: 220 + radius * Math.sin(angle)
        };
      });
      setNodeCoordinates(positions);
    }
  }, [data?.nodes]);

  // Track global canvas tracking events during node linking sequences
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggingFromNodeId || !canvasWorkspaceRef.current) return;
      const rect = canvasWorkspaceRef.current.getBoundingClientRect();
      setDragMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    };

    const handleGlobalMouseUp = () => {
      setDraggingFromNodeId(null);
    };

    if (draggingFromNodeId) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggingFromNodeId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 p-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">ODeL Wayfinding CMS Dashboard</h1>
          <p className="text-xs text-zinc-400 mt-1">Populate spatial topology graphs, multimedia vectors, and landmarks.</p>
        </div>
        <div className="bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded text-xs font-mono text-cyan-400 font-bold flex items-center gap-2">
          <Zap className="size-3.5 fill-cyan-400 animate-pulse" /> INTERACTIVE GRAPH CANVAS EMBEDDED
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-zinc-800 bg-zinc-900/20 p-4 flex flex-col gap-1">
          <button onClick={() => setActiveTab('floors')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl font-medium text-xs tracking-wide transition-all ${activeTab === 'floors' ? 'bg-cyan-600 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
            <Layers className="size-4" /> Floors ({data?.floors?.length || 0})
          </button>
          <button onClick={() => setActiveTab('nodes')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl font-medium text-xs tracking-wide transition-all ${activeTab === 'nodes' ? 'bg-cyan-600 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
            <MapPin className="size-4" /> Waypoint Nodes ({data?.nodes?.length || 0})
          </button>
          <button onClick={() => setActiveTab('destinations')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl font-medium text-xs tracking-wide transition-all ${activeTab === 'destinations' ? 'bg-cyan-600 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
            <Compass className="size-4" /> Search Destinations ({data?.destinations?.length || 0})
          </button>
          <button onClick={() => setActiveTab('connections')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl font-medium text-xs tracking-wide transition-all ${activeTab === 'connections' ? 'bg-cyan-600 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
            <Navigation className="size-4" /> Path Edges ({data?.connections?.length || 0})
          </button>
        </aside>

        {/* Main Work Space Container */}
        <main className="flex-1 p-6 overflow-y-auto bg-zinc-950/40">
          <div className="max-w-7xl mx-auto">
            
            {activeTab === 'connections' ? (
              /* --- INTERACTIVE CANVAS ENGINE FOR NODE CONNECTIONS --- */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                      <Link2 className="size-4" /> Visual Graph Relationship Modeler
                    </h2>
                    <p className="text-zinc-400 text-xs mt-0.5">Drag lines directly out of an Origin Node bubble and drop them onto a target checkpoint to bind data frames.</p>
                  </div>
                  {activeConnectionDraft && (
                    <button onClick={() => setActiveConnectionDraft(false)} className="px-3 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white">
                      Clear Selection
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                  {/* Interactive Dynamic SVG Layer Workspace */}
                  <div className="xl:col-span-8 bg-zinc-950 border border-zinc-800 rounded-2xl relative h-[520px] overflow-hidden select-none shadow-2xl" ref={canvasWorkspaceRef}>
                    <div className="absolute top-3 left-3 px-3 py-1 bg-zinc-900/80 backdrop-blur-md rounded border border-zinc-800/80 text-[10px] font-mono text-zinc-400 z-20 pointer-events-none">
                      Drag active connection handles to build adjacency lists
                    </div>

                    {/* SVG Vector Drawing Canvas for Route Vectors */}
                    <svg className="absolute inset-0 size-full pointer-events-none z-10">
                      <defs>
                        <marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
                        </marker>
                        <marker id="existing-arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                          <path d="M 0 1 L 10 5 L 0 9 z" fill="#3f3f46" />
                        </marker>
                      </defs>

                      {/* Render established connection paths in background layers */}
                      {data?.connections?.map((conn) => {
                        const sourceNode = nodeCoordinates.find(n => n.id === conn.fromNodeId);
                        const targetNode = nodeCoordinates.find(n => n.id === conn.toNodeId);
                        if (!sourceNode || !targetNode) return null;
                        return (
                          <line
                            key={conn._id}
                            x1={sourceNode.x}
                            y1={sourceNode.y}
                            x2={targetNode.x}
                            y2={targetNode.y}
                            stroke="#27272a"
                            strokeWidth="2"
                            markerEnd="url(#existing-arrow)"
                          />
                        );
                      })}

                      {/* Live Rendering dragging lines vectors */}
                      {draggingFromNodeId && activeOriginNodeObject && (
                        <line
                          x1={activeOriginNodeObject.x}
                          y1={activeOriginNodeObject.y}
                          x2={dragMousePos.x}
                          y2={dragMousePos.y}
                          stroke="#06b6d4"
                          strokeWidth="3"
                          strokeDasharray="4,4"
                          markerEnd="url(#arrow)"
                        />
                      )}
                    </svg>

                    {/* Rendering physical Interactive Spatial Node components inside canvas space */}
                    {nodeCoordinates.map((node) => {
                      const isTargetDraftSelected = connForm.fromNodeId === node.id || connForm.toNodeId === node.id;
                      return (
                        <div
                          key={node.id}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 p-3 rounded-xl border text-center transition-all cursor-pointer z-20 min-w-[110px] max-w-[160px] group ${
                            isTargetDraftSelected 
                              ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.15)]' 
                              : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900'
                          }`}
                          style={{ left: `${node.x}px`, top: `${node.y}px` }}
                          onMouseUp={() => resolveNodeDrop(node.id)}
                        >
                          <div className="text-[10px] font-bold font-sans truncate">{node.label}</div>
                          
                          {/* Connection handle trigger node component pin elements */}
                          <div 
                            className="size-3.5 rounded-full bg-zinc-800 border border-zinc-700 mx-auto mt-2 flex items-center justify-center hover:bg-cyan-500 hover:border-cyan-400 transition-colors shadow-inner"
                            onMouseDown={(e) => initiateNodeDrag(node.id, e)}
                          >
                            <div className="size-1.5 rounded-full bg-zinc-500 group-hover:bg-white" />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Left Dynamic Metadata overlay capture forms block context */}
                  <div className="xl:col-span-4">
                    {activeConnectionDraft ? (
                      <div className="bg-zinc-900 rounded-2xl border border-cyan-500/30 p-5 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="border-b border-zinc-800 pb-3">
                          <span className="text-[9px] bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-400 font-mono font-bold tracking-wider">
                            VECTOR CONNECTION RECOGNIZED
                          </span>
                          <div className="text-xs text-zinc-300 font-mono space-y-0.5 mt-2">
                            <div>From: <strong className="text-white">{getNodeLabel(connForm.fromNodeId)}</strong></div>
                            <div>To: <strong className="text-cyan-400">{getNodeLabel(connForm.toNodeId)}</strong></div>
                          </div>
                        </div>

                        <form onSubmit={handleConnectionSubmit} className="space-y-3 text-xs font-mono">
                          <div>
                            <label className="block text-zinc-400 font-bold mb-1 uppercase">Landmark Traversal Image Asset File</label>
                            <div className="relative flex items-center justify-center w-full border border-dashed border-zinc-800 bg-zinc-950/50 hover:bg-zinc-950 rounded-xl p-4 transition-all group cursor-pointer">
                              <input type="file" accept="image/*" ref={connFileInputRef} onChange={e => setConnectionFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" required />
                              <div className="text-center space-y-1 pointer-events-none">
                                {connectionFile ? (
                                  <div className="text-cyan-400 flex items-center gap-2">
                                    <FileImage className="size-5" />
                                    <span className="text-[11px] font-sans truncate max-w-[180px]">{connectionFile.name}</span>
                                  </div>
                                ) : (
                                  <div className="text-zinc-500 flex items-center gap-2 group-hover:text-zinc-400">
                                    <Upload className="size-5 text-zinc-600 group-hover:text-cyan-500" />
                                    <span className="text-[11px] font-sans">Upload turn checkpoint scene photo</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-zinc-400 font-bold mb-1 uppercase">Walking Video Link (Optional URL)</label>
                            <input type="text" placeholder="https://..." value={connForm.videoSegmentUrl} onChange={e => setConnForm({...connForm, videoSegmentUrl: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-zinc-400 font-bold mb-1 uppercase">On-Screen Text Instructions</label>
                            <input type="text" placeholder="e.g., Turn right at the reception desk." value={connForm.textDirection} onChange={e => setConnForm({...connForm, textDirection: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none font-sans" required />
                          </div>
                          <div>
                            <label className="block text-zinc-400 font-bold mb-1 uppercase">Audio TTS Speech Description</label>
                            <textarea rows={2} placeholder="Speech engine readout phrase..." value={connForm.audioDescription} onChange={e => setConnForm({...connForm, audioDescription: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none font-sans" required />
                          </div>
                          <div>
                            <label className="block text-zinc-400 font-bold mb-1 uppercase">Estimated Step Traversal Speed (Seconds)</label>
                            <input type="number" value={connForm.estimatedWalkingTime} onChange={e => setConnForm({...connForm, estimatedWalkingTime: parseInt(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none" required />
                          </div>
                          <button type="submit" disabled={loading || uploadingFile} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-sans font-bold py-3 px-4 rounded-lg mt-2 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                            {(loading || uploadingFile) && <Loader2 className="size-4 animate-spin" />}
                            {uploadingFile ? 'Uploading Asset Binary...' : loading ? 'Mapping Route...' : 'Commit Path Framework'}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="border border-dashed border-zinc-800 bg-zinc-900/10 rounded-2xl p-8 text-center text-xs font-sans text-zinc-500 h-full flex flex-col items-center justify-center">
                        <Navigation className="size-8 text-zinc-700 mb-3 animate-pulse" />
                        Awaiting graph canvas edge interaction selection to map metadata configurations.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* --- STANDARD CMS DATABASE MANAGER PANELS --- */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Dynamic Form Workspace */}
                <div className="lg:col-span-5 bg-zinc-900/60 rounded-2xl border border-zinc-800 p-6 shadow-xl h-fit">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2 mb-6">
                    <Plus className="size-4" /> Register New Data Entry
                  </h2>

                  {/* FLOORS FORM */}
                  {activeTab === 'floors' && (
                    <form onSubmit={handleFloorSubmit} className="space-y-4 text-xs font-mono">
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Level Number Index</label>
                        <input type="number" value={floorForm.level} onChange={e => setFloorForm({...floorForm, level: parseInt(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500" required />
                      </div>
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Floor Common Name</label>
                        <input type="text" placeholder="e.g., Ground Floor" value={floorForm.name} onChange={e => setFloorForm({...floorForm, name: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500" required />
                      </div>
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Floor Blueprint Image File</label>
                        <div className="relative flex items-center justify-center w-full border border-dashed border-zinc-800 bg-zinc-950/50 hover:bg-zinc-950 rounded-xl p-6 transition-all group cursor-pointer">
                          <input type="file" accept="image/*" ref={floorFileInputRef} onChange={e => setFloorFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                          <div className="text-center space-y-2">
                            {floorFile ? (
                              <div className="text-cyan-400 flex flex-col items-center gap-1">
                                <FileImage className="size-8" />
                                <span className="text-[11px] font-sans truncate max-w-[200px]">{floorFile.name}</span>
                              </div>
                            ) : (
                              <div className="text-zinc-500 flex flex-col items-center gap-1 group-hover:text-zinc-400">
                                <Upload className="size-8 text-zinc-600 group-hover:text-cyan-500 transition-colors" />
                                <span className="text-[11px] font-sans">Select map blueprint image</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <button type="submit" disabled={loading || uploadingFile} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-sans font-bold py-3 px-4 rounded-lg mt-2 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                        {(loading || uploadingFile) && <Loader2 className="size-4 animate-spin" />}
                        {uploadingFile ? 'Uploading Asset Binary...' : loading ? 'Saving Core Record...' : 'Commit Floor Data'}
                      </button>
                    </form>
                  )}

                  {/* NODES FORM */}
                  {activeTab === 'nodes' && (
                    <form onSubmit={handleNodeSubmit} className="space-y-4 text-xs font-mono">
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Parent Building Level Map</label>
                        <select value={nodeForm.floorId} onChange={e => setNodeForm({...nodeForm, floorId: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500" required>
                          <option value="">-- Choose Floor Array Location --</option>
                          {data?.floors?.map(f => <option key={f._id} value={f._id}>{f.name} (Lvl {f.level})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Unique Waypoint Text Descriptor Label</label>
                        <input type="text" placeholder="e.g., Main Entrance Reception" value={nodeForm.label} onChange={e => setNodeForm({...nodeForm, label: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500" required />
                      </div>
                      <div className="flex items-center gap-3 py-2">
                        <input type="checkbox" id="isLandmark" checked={nodeForm.isLandmark} onChange={e => setNodeForm({...nodeForm, isLandmark: e.target.checked})} className="size-4 accent-cyan-500 rounded" />
                        <label htmlFor="isLandmark" className="text-zinc-300 font-bold uppercase select-none cursor-pointer">Qualifies as a visual landmark</label>
                      </div>
                      {nodeForm.isLandmark && (
                        <div>
                          <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Landmark Architecture Type</label>
                          <select value={nodeForm.landmarkType} onChange={e => setNodeForm({...nodeForm, landmarkType: e.target.value as LandmarkType})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500">
                            <option value="corridor">Corridor Wing Intersection</option>
                            <option value="staircase">Staircase Framework Assembly</option>
                            <option value="elevator">Elevator Core Box</option>
                            <option value="double-door">Main Entrance Double Doors</option>
                          </select>
                        </div>
                      )}
                      <button type="submit" disabled={loading} className="w-full bg-cyan-600 hover:bg-cyan-500 font-sans font-bold py-3 px-4 rounded-lg mt-2 transition-all disabled:opacity-40">
                        {loading ? 'Anchoring Node Vector...' : 'Commit Spatial Node'}
                      </button>
                    </form>
                  )}

                  {/* DESTINATIONS FORM */}
                  {activeTab === 'destinations' && (
                    <form onSubmit={handleDestSubmit} className="space-y-4 text-xs font-mono">
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Primary Name Designation</label>
                        <input type="text" placeholder="e.g., ICT Lab" value={destForm.name} onChange={e => setDestForm({...destForm, name: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500" required />
                      </div>
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">NLP Engine Search Aliases (Comma-separated)</label>
                        <input type="text" placeholder="e.g., computer lab, terminal room" value={destForm.aliasesRaw} onChange={e => setDestForm({...destForm, aliasesRaw: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500" />
                      </div>
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Floor Layer Assignment</label>
                        <select value={destForm.floorId} onChange={e => setDestForm({...destForm, floorId: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500" required>
                          <option value="">-- Choose Target Floor --</option>
                          {data?.floors?.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Anchor Waypoint Target Node Connection</label>
                        <select value={destForm.targetNodeId} onChange={e => setDestForm({...destForm, targetNodeId: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500" required>
                          <option value="">-- Choose Corresponding Proximity Node --</option>
                          {data?.nodes?.map(n => <option key={n._id} value={n._id}>{n.label} ({getFloorName(n.floorId)})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Short Purpose Summary Description</label>
                        <textarea rows={3} placeholder="Information displayed upon arrival..." value={destForm.description} onChange={e => setDestForm({...destForm, description: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500 font-sans" required />
                      </div>
                      <button type="submit" disabled={loading} className="w-full bg-cyan-600 hover:bg-cyan-500 font-sans font-bold py-3 px-4 rounded-lg mt-2 transition-all disabled:opacity-40">
                        {loading ? 'Locking target coordinates...' : 'Commit Target Endpoint'}
                      </button>
                    </form>
                  )}
                </div>

                {/* Right Column Database Feed Records View */}
                <div className="lg:col-span-7 space-y-4">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                    <Info className="size-4 text-zinc-500" /> Live Environment Database Records
                  </h2>

                  {!data ? (
                    <div className="border border-zinc-800/80 bg-zinc-900/10 rounded-2xl p-12 text-center text-xs font-mono text-zinc-500 animate-pulse">
                      Querying Convex real-time streams...
                    </div>
                  ) : (
                    <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm max-h-[640px] overflow-y-auto p-4 space-y-2">
                      {activeTab === 'floors' && (data.floors.length === 0 ? <p className="text-xs font-mono text-zinc-500 p-4">No floors defined.</p> : data.floors.map(f => (
                        <div key={f._id} className="border border-zinc-800 bg-zinc-950 p-4 rounded-xl flex justify-between items-center text-xs font-mono">
                          <div>
                            <div className="text-cyan-400 font-bold">Level {f.level}: {f.name}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">ID: {f._id}</div>
                          </div>
                          {f.floorPlanUrl && (
                            <span className="text-[10px] px-2 py-0.5 bg-cyan-950 border border-cyan-800 text-cyan-400 rounded-md font-sans">
                              File Hosted ID
                            </span>
                          )}
                        </div>
                      )))}

                      {activeTab === 'nodes' && (data.nodes.length === 0 ? <p className="text-xs font-mono text-zinc-500 p-4">No spatial nodes defined.</p> : data.nodes.map(n => (
                        <div key={n._id} className="border border-zinc-800 bg-zinc-950 p-4 rounded-xl text-xs font-mono space-y-1">
                          <div className="text-white font-bold">{n.label}</div>
                          <div className="text-[10px] text-zinc-400 flex flex-col gap-0.5">
                            <span>Floor context: <strong className="text-zinc-300">{getFloorName(n.floorId)}</strong></span>
                            {n.isLandmark && <span className="text-emerald-400 font-bold">★ LANDMARK METRIC ({n.landmarkType})</span>}
                          </div>
                        </div>
                      )))}

                      {activeTab === 'destinations' && (data.destinations.length === 0 ? <p className="text-xs font-mono text-zinc-500 p-4">No final destinations defined.</p> : data.destinations.map(d => (
                        <div key={d._id} className="border border-zinc-800 bg-zinc-950 p-4 rounded-xl text-xs space-y-2 font-mono">
                          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-start">
                            <div className="text-cyan-400 font-bold text-sm font-sans">{d.name}</div>
                            <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 truncate max-w-full">
                              Target Anchor: {getNodeLabel(d.targetNodeId)}
                            </span>
                          </div>
                          <p className="text-zinc-300 font-sans text-xs">{d.description}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {d.aliases.map((a, i) => <span key={i} className="text-[9px] bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">"{a}"</span>)}
                          </div>
                        </div>
                      )))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}