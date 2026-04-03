import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from './lib/supabase';
import { getDeviceFingerprint, getPartyColor, cn } from './lib/utils';
import { Locate, X, Search, ChevronRight, ChevronLeft, Coffee, TrendingUp } from 'lucide-react';
import confetti from 'canvas-confetti';

interface Stats {
  constituency_id: number;
  ldf_votes: number;
  udf_votes: number;
  nda_votes: number;
  other_votes: number;
  total_votes: number;
  leading_party: string;
}

interface ConstituencyProps {
  id: number;
  name: string;
  district: string;
}

interface SimDelta {
  ldf: number;
  udf: number;
  nda: number;
  oth: number;
}

interface AdminConstituencySetting {
  constituency_id: number;
  sim_enabled: boolean;
  epoch: string;
  inc_ldf: number;
  inc_udf: number;
  inc_nda: number;
  inc_oth: number;
}

// ──────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────

const KERALA_BOUNDS: L.LatLngBoundsExpression = [[8.0, 74.7], [13.0, 77.6]];
const KERALA_FIT_BOUNDS: L.LatLngBoundsExpression = [[8.28, 74.85], [12.8, 77.4]];
const POLL_INTERVAL_MS = 10_000;
const SIM_TICK_MS = 250;

const VOTE_GROUPS = [
  { id: 'LDF', label: 'LDF', color: 'bg-red-600', hex: '#dc2626', active: 'hover:bg-red-500' },
  { id: 'UDF', label: 'UDF', color: 'bg-green-600', hex: '#16a34a', active: 'hover:bg-green-500' },
  { id: 'NDA', label: 'NDA', color: 'bg-orange-500', hex: '#f97316', active: 'hover:bg-orange-400' },
  { id: 'OTHER', label: 'OTHER', color: 'bg-slate-500', hex: '#64748b', active: 'hover:bg-slate-400' },
];

const GEOJSON_DEFAULT_STYLE: L.PathOptions = {
  fillColor: 'transparent',
  fillOpacity: 0.1,
  color: '#334155',
  weight: 1,
};

// ──────────────────────────────────────────────
// MAP SETUP
// ──────────────────────────────────────────────

function MapSetup() {
  const map = useMap();
  useEffect(() => {
    if (map) map.fitBounds(KERALA_FIT_BOUNDS, { padding: [10, 10] });
  }, [map]);
  return null;
}

function MapContent({
  stats,
  simulatedDelta,
  selectedId,
  onSelect,
  onGeoLoaded,
}: {
  stats: Record<number, Stats>;
  simulatedDelta: Record<number, SimDelta>;
  selectedId: number | null;
  onSelect: (id: number | null, bounds?: L.LatLngBounds, props?: ConstituencyProps) => void;
  onGeoLoaded: (data: any, layerRef: React.RefObject<L.GeoJSON | null>) => void;
}) {
  const map = useMap();
  const [geoData, setGeoData] = useState<any>(null);
  const layerRef = useRef<L.GeoJSON>(null);

  useEffect(() => {
    fetch('/Kerala_140_AC_Geo_Data.json')
      .then((res) => res.json())
      .then((data) => {
        setGeoData({
          type: 'FeatureCollection',
          features: data.map((item: any) => ({
            type: 'Feature',
            properties: { id: item.AC_NO, name: item.AC_NAME || `AC ${item.AC_NO}`, district: item.DISTRICT || 'Kerala' },
            geometry: item.geometry,
          })),
        });
      }).catch(console.error);
  }, []);

  useEffect(() => {
    if (geoData && layerRef.current) onGeoLoaded(geoData, layerRef);
  }, [geoData, onGeoLoaded]);

  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom());
    map.on('zoomend', handleZoom);
    return () => { map.off('zoomend', handleZoom); };
  }, [map]);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.eachLayer((layer: any) => {
      const id = layer.feature.properties.id;
      const baseStat = stats[id];
      const delta = simulatedDelta[id] || { ldf: 0, udf: 0, nda: 0, oth: 0 };

      if (baseStat && layer.setStyle) {
        const ldf = baseStat.ldf_votes + delta.ldf;
        const udf = baseStat.udf_votes + delta.udf;
        const nda = baseStat.nda_votes + delta.nda;
        const oth = baseStat.other_votes + delta.oth;
        const total = ldf + udf + nda + oth;

        let leader = baseStat.leading_party;
        if (total > 0) {
          const max = Math.max(ldf, udf, nda, oth);
          if (max === ldf) leader = 'LDF';
          else if (max === udf) leader = 'UDF';
          else if (max === nda) leader = 'NDA';
          else leader = 'OTHER';
        }

        const color = total > 0 ? getPartyColor(leader, 1) : 'transparent';

        layer.setStyle({
          fillColor: color,
          fillOpacity: total > 0 ? 1 : 0.1,
          color: selectedId === id ? '#ffffff' : '#334155',
          weight: selectedId === id ? 2.5 : 1,
        });
      } else if (layer.setStyle) {
        layer.setStyle({ fillColor: 'transparent', fillOpacity: 0.1, color: selectedId === id ? '#ffffff' : '#334155', weight: selectedId === id ? 2.5 : 1 });
      }

      // Dynamic Tooltips for Mobile (permanent when zoomed in >= 10)
      const props = layer.feature.properties;
      const isZoomedIn = zoom >= 10;
      const tt = layer.getTooltip();
      
      if (tt && tt.options.permanent !== isZoomedIn) {
        layer.unbindTooltip();
        if (isZoomedIn) {
          layer.bindTooltip(props.name, { permanent: true, direction: 'center', className: 'font-bold text-[8px] sm:text-[10px] text-white/70 drop-shadow-md bg-transparent border-none shadow-none text-center pointer-events-none' });
        } else {
          layer.bindTooltip(props.name, { permanent: false, sticky: true, className: 'constituency-tooltip bg-slate-800 text-white border border-slate-700 px-2 py-1 rounded text-xs pointer-events-none' });
        }
      }

    });
  }, [stats, simulatedDelta, selectedId, zoom]);

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const props = feature.properties;
    // Initial tooltip binding
    (layer as any).bindTooltip(props.name, { permanent: false, sticky: true, className: 'constituency-tooltip bg-slate-800 text-white border border-slate-700 px-2 py-1 rounded text-xs pointer-events-none' });
    
    layer.on({
      click: () => {
        const id = props.id;
        const bounds = (layer as L.Polygon).getBounds();
        map.flyToBounds(bounds, { padding: [50, 50], duration: 1 });
        onSelect(id, bounds, props);
      },
      mouseover: (e: any) => { e.target.setStyle({ weight: 2.5, color: '#94a3b8' }); e.target.bringToFront(); },
      mouseout: (e: any) => { e.target.setStyle({ weight: selectedId === props.id ? 2.5 : 1, color: selectedId === props.id ? '#ffffff' : '#334155' }); },
    });
  }, [map, onSelect, selectedId]);

  return geoData ? <><MapSetup /><GeoJSON ref={layerRef} data={geoData} style={GEOJSON_DEFAULT_STYLE} onEachFeature={onEachFeature} /></> : null;
}

// ──────────────────────────────────────────────
// MAIN APP
// ──────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState<any>(null);
  const [constituencySettings, setConstituencySettings] = useState<Record<number, AdminConstituencySetting>>({});
  const [stats, setStats] = useState<Record<number, Stats>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedProps, setSelectedProps] = useState<ConstituencyProps | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteMessage, setVoteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(true);
  const [posterDismissed, setPosterDismissed] = useState(false);
  const [tipJarOpen, setTipJarOpen] = useState(false);

  const [simulatedDelta, setSimulatedDelta] = useState<Record<number, SimDelta>>({});

  const [hasVotedGlobally, setHasVotedGlobally] = useState<boolean>(() => localStorage.getItem('voted') === 'true');
  const [allConstituencies, setAllConstituencies] = useState<ConstituencyProps[]>([]);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
       setTimeout(() => { searchInputRef.current?.focus(); }, 150);
    }
  }, [searchOpen]);

  // ── HARDWARE BACK BUTTON (UX) ───────
  const overlayState = useRef({ tipJarOpen, posterDismissed, posterEnabled: settings?.poster_enabled, searchOpen, selectedId });
  useEffect(() => {
    overlayState.current = { tipJarOpen, posterDismissed, posterEnabled: settings?.poster_enabled, searchOpen, selectedId };
  }, [tipJarOpen, posterDismissed, settings?.poster_enabled, searchOpen, selectedId]);

  useEffect(() => {
    window.history.pushState({ isApp: true }, '', window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      const cur = overlayState.current;
      let closedSomething = false;

      if (cur.tipJarOpen) {
        setTipJarOpen(false);
        closedSomething = true;
      } else if (!cur.posterDismissed && cur.posterEnabled) {
        setPosterDismissed(true);
        closedSomething = true;
      } else if (cur.searchOpen) {
        setSearchOpen(false);
        closedSomething = true;
      } else if (cur.selectedId !== null) {
        setSelectedId(null);
        closedSomething = true;
      }

      if (closedSomething) {
        window.history.pushState({ isApp: true }, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ── FETCH CONFIG & STATS ───────
  const fetchAllData = useCallback(async () => {
    try {
      const [{ data: sData }, { data: stData }, { data: csData }] = await Promise.all([
        supabase.from('admin_settings').select('*').eq('id', 1).single(),
        supabase.from('constituency_stats').select('*'),
        supabase.from('admin_constituency_settings').select('*')
      ]);

      if (sData) setSettings(sData);

      if (csData) {
        const cMap: Record<number, AdminConstituencySetting> = {};
        csData.forEach(c => cMap[c.constituency_id] = c);
        setConstituencySettings(cMap);
      }

      if (stData) {
        setStats((prev) => {
          const merged: Record<number, Stats> = {};
          stData.forEach((d) => {
            const prevStat = prev[d.constituency_id];
            if (prevStat) {
              merged[d.constituency_id] = {
                ...d,
                ldf_votes: Math.max(d.ldf_votes, prevStat.ldf_votes),
                udf_votes: Math.max(d.udf_votes, prevStat.udf_votes),
                nda_votes: Math.max(d.nda_votes, prevStat.nda_votes),
                other_votes: Math.max(d.other_votes, prevStat.other_votes),
                total_votes: Math.max(d.total_votes, prevStat.total_votes),
              };
            } else { merged[d.constituency_id] = d; }
          });
          return merged;
        });
      }
    } catch (err) { console.warn('Silent polling error:', err); }
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // ── DETERMINISTIC SIMULATION ENGINE (Per-Constituency Local Time-Based) ────
  useEffect(() => {
    if (Object.keys(constituencySettings).length === 0) return;

    const simInterval = setInterval(() => {
      setSimulatedDelta(() => {
        const next: Record<number, SimDelta> = {};
        const now = Date.now();
        
        const ids = Object.keys(stats);
        for (let i = 0; i < ids.length; i++) {
          const id = Number(ids[i]);
          const cfg = constituencySettings[id];
          
          if (!cfg || !cfg.sim_enabled) {
            next[id] = { ldf: 0, udf: 0, nda: 0, oth: 0 };
            continue;
          }
          
          const ep = new Date(cfg.epoch).getTime();
          const t = Math.max(0, (now - ep) / 60000); // Elapsed minutes since this constituency was last explicitly updated

          // Exact granular rates set by Admin! No random multiplier. 
          next[id] = {
            ldf: t * cfg.inc_ldf,
            udf: t * cfg.inc_udf,
            nda: t * cfg.inc_nda,
            oth: t * cfg.inc_oth,
          };
        }
        return next;
      });
    }, SIM_TICK_MS);

    return () => clearInterval(simInterval);
  }, [constituencySettings, stats]);

  // ── GLOBAL STATE TICKER COMPUTATION ────
  const globalState = useMemo(() => {
    let l = 0, u = 0, n = 0, o = 0;
    Object.values(stats).forEach(s => {
      const delta = simulatedDelta[s.constituency_id] || { ldf: 0, udf: 0, nda: 0, oth: 0 };
      l += s.ldf_votes + delta.ldf;
      u += s.udf_votes + delta.udf;
      n += s.nda_votes + delta.nda;
      o += s.other_votes + delta.oth;
    });
    
    const total = l + u + n + o;
    const max = Math.max(l, u, n, o);
    let leader = 'TIE';
    if (total > 0) {
      if (max === l) leader = 'LDF';
      else if (max === u) leader = 'UDF';
      else if (max === n) leader = 'NDA';
      else leader = 'OTHER';
    }
    
    return { 
      ldf: Math.floor(l), udf: Math.floor(u), nda: Math.floor(n), oth: Math.floor(o), 
      total: Math.floor(total), leader
    };
  }, [stats, simulatedDelta]);

  const curStatUnified = useMemo(() => {
    if (!selectedId) return null;
    const base = stats[selectedId];
    if (!base) return null;
    const delta = simulatedDelta[selectedId] || { ldf: 0, udf: 0, nda: 0, oth: 0 };

    const ldf = Math.floor(base.ldf_votes + delta.ldf);
    const udf = Math.floor(base.udf_votes + delta.udf);
    const nda = Math.floor(base.nda_votes + delta.nda);
    const oth = Math.floor(base.other_votes + delta.oth);
    const total = ldf + udf + nda + oth;

    let leader = base.leading_party;
    if (total > 0) {
      const max = Math.max(ldf, udf, nda, oth);
      if (max === ldf) leader = 'LDF';
      else if (max === udf) leader = 'UDF';
      else if (max === nda) leader = 'NDA';
      else leader = 'OTHER';
    }
    return { ldf, udf, nda, oth, total, leader };
  }, [selectedId, stats, simulatedDelta]);

  // ── VOTING ──────────────────────────────────
  const handleVote = useCallback(async (party: string) => {
    if (!selectedId || isVoting || hasVotedGlobally) return;
    setIsVoting(true); setVoteMessage(null);
    const dh = await getDeviceFingerprint();

    // Fire Confetti!
    const group = VOTE_GROUPS.find(g => g.id === party);
    if (group) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.8 },
        colors: [group.hex, '#ffffff']
      });
    }

    const prevStat = stats[selectedId];
    const baseStat = prevStat || { constituency_id: selectedId, ldf_votes: 0, udf_votes: 0, nda_votes: 0, other_votes: 0, total_votes: 0, leading_party: party };
    const optimistic = { ...baseStat, total_votes: baseStat.total_votes + 1 };
    if (party === 'LDF') optimistic.ldf_votes++;
    if (party === 'UDF') optimistic.udf_votes++;
    if (party === 'NDA') optimistic.nda_votes++;
    if (party === 'OTHER') optimistic.other_votes++;
    
    setStats((prev) => ({ ...prev, [selectedId]: optimistic }));

    const { error } = await supabase.from('votes').insert([{ constituency_id: selectedId, vote_group: party, device_hash: dh }]);
    setIsVoting(false);

    if (error) {
      setStats((prev) => ({ ...prev, [selectedId]: prevStat || baseStat }));
      setVoteMessage({ type: 'error', text: 'You have already voted!' });
      setTimeout(() => setVoteMessage(null), 4000);
      setHasVotedGlobally(true);
      localStorage.setItem('voted', 'true');
    } else {
      setHasVotedGlobally(true);
      localStorage.setItem('voted', 'true');
      setVoteMessage({ type: 'success', text: 'Vote recorded securely!' });
      setTimeout(() => setVoteMessage(null), 3000);
    }
  }, [selectedId, isVoting, hasVotedGlobally, stats]);

  const handleGeoLoaded = useCallback((data: any, lRef: React.RefObject<L.GeoJSON | null>) => {
    geoLayerRef.current = lRef.current;
    if (data?.features) setAllConstituencies(data.features.map((f: any) => f.properties));
  }, []);

  const gotoMyConstituency = useCallback(() => {
    if (!navigator.geolocation || !geoLayerRef.current) { alert('Geolocation not available.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt = L.latLng(pos.coords.latitude, pos.coords.longitude);
        let bestId: number | null = null; let minDist = Infinity; let bestBounds: L.LatLngBounds | undefined; let bestProps: ConstituencyProps | undefined;
        geoLayerRef.current!.eachLayer((layer: any) => {
          if (layer.getBounds) {
            const center = layer.getBounds().getCenter();
            const dist = center.distanceTo(pt);
            if (dist < minDist) { minDist = dist; bestId = layer.feature.properties.id; bestBounds = layer.getBounds(); bestProps = layer.feature.properties; }
          }
        });
        if (bestId && bestBounds) {
          mapRef.current?.flyToBounds(bestBounds, { padding: [50, 50], duration: 1.5 });
          setSelectedId(bestId); if (bestProps) setSelectedProps(bestProps);
        } else alert('Could not locate within Kerala.');
      }, () => alert('Location access denied.')
    );
  }, []);

  const navigateConstituency = useCallback((offset: number) => {
    if (!selectedId || !allConstituencies.length) return;
    const nextId = selectedId + offset;
    if (nextId < 1 || nextId > 140) return;
    
    const targetProps = allConstituencies.find(c => c.id === nextId);
    if (!targetProps || !geoLayerRef.current) return;
    
    geoLayerRef.current.eachLayer((layer: any) => {
      if (layer.feature?.properties?.id === targetProps.id) {
        const bounds = (layer as L.Polygon).getBounds();
        mapRef.current?.flyToBounds(bounds, { padding: [50, 50], duration: 1.2 });
        setSelectedId(targetProps.id);
        setSelectedProps(targetProps);
      }
    });
  }, [selectedId, allConstituencies]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allConstituencies.filter(c => c.name.toLowerCase().includes(q) || c.district.toLowerCase().includes(q)).slice(0, 8);
  }, [searchQuery, allConstituencies]);

  const handleSearchSelect = useCallback((props: ConstituencyProps) => {
    if (!geoLayerRef.current) return;
    geoLayerRef.current.eachLayer((layer: any) => {
      if (layer.feature?.properties?.id === props.id) {
        const bounds = (layer as L.Polygon).getBounds();
        mapRef.current?.flyToBounds(bounds, { padding: [50, 50], duration: 1 });
        setSelectedId(props.id); setSelectedProps(props);
      }
    });
    setSearchQuery(''); setSearchOpen(false);
  }, []);

  const overlayContainer = document.getElementById('ui-overlay');
  if (!settings) return <div className="h-screen w-full bg-slate-950 flex items-center justify-center text-white font-mono animate-pulse">Initializing Global Matrix...</div>;

  return (
    <>
      <div className="w-full h-screen bg-slate-950 relative">
        <MapContainer ref={mapRef as any} center={[10.85, 76.27]} zoom={8} minZoom={7} maxZoom={14} maxBounds={KERALA_BOUNDS} maxBoundsViscosity={1.0} scrollWheelZoom={true} zoomControl={false} className="w-full h-full bg-slate-900">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap &copy; CARTO' />
          <MapContent stats={stats} simulatedDelta={simulatedDelta} selectedId={selectedId} onSelect={(id, b, p) => { setSelectedId(id); if (p) setSelectedProps(p); setVoteMessage(null); }} onGeoLoaded={handleGeoLoaded} />
        </MapContainer>
        
        {/* GLOBAL TICKER REMOVED FROM HERE, MOVED TO PORTAL */}
      </div>

      {overlayContainer && createPortal(
        <>
          {/* SEARCH BACKGROUND OVERLAY (click away to close) */}
          {searchOpen && (
             <div className="fixed inset-0 z-[9999] pointer-events-auto bg-black/10 backdrop-blur-[1px]" onClick={() => setSearchOpen(false)}></div>
          )}

          {/* TOP LEFT HEADER & SEARCH (Combined Area) */}
          <div className="fixed top-3 sm:top-4 left-3 flex items-center pointer-events-none gap-3 sm:gap-4 z-[10000]">
            
            {/* Search Icon / Expanded Menu Trigger */}
            <div className="relative">
              {!searchOpen ? (
                <button 
                  onClick={() => {
                    setSearchOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }} 
                  className="glass-panel p-3 rounded-2xl pointer-events-auto hover:bg-slate-800/80 transition-all border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.15)] group active:scale-95 shrink-0 z-[10010] hover:shadow-[0_0_25px_rgba(99,102,241,0.3)]"
                >
                  <Search className="w-5 h-5 text-indigo-300 group-hover:text-white" />
                </button>
              ) : (
                <button onClick={() => setSearchOpen(false)} className="glass-panel p-3 rounded-2xl pointer-events-auto hover:bg-slate-800/80 transition-all border border-slate-700/50 shadow-xl group active:scale-95 shrink-0 bg-indigo-600/50 outline outline-2 outline-indigo-500 z-[10100]">
                   <X className="w-5 h-5 text-white" />
                </button>
              )}
              
              {/* Expanded Menu Drawer (Pops strictly below the icon row) */}
              {searchOpen && (
                 <div className="absolute top-[calc(100%+0.5rem)] left-0 glass-panel p-3 sm:p-4 rounded-3xl pointer-events-auto w-[240px] sm:w-[300px] animate-in slide-in-from-top-4 fade-in duration-200 shadow-2xl z-[10100]">
                    <div className="flex justify-between items-center mb-3 px-1">
                      <div className="text-[10px] sm:text-xs text-slate-400 flex items-center gap-1.5 font-bold uppercase tracking-wider">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]"></span>
                        Enter constituency or district
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center bg-slate-800/80 rounded-2xl px-3 py-3 gap-2 border border-slate-700/50 shadow-inner">
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                        <input ref={searchInputRef} type="text" placeholder="Search..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); }} autoFocus className="bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none w-full" />
                        {searchQuery && <button onClick={() => { setSearchQuery(''); }} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>}
                      </div>
                    </div>

                    {searchResults.length > 0 && (
                      <div className="mt-2 rounded-2xl overflow-hidden border border-slate-700/50 max-h-[200px] overflow-y-auto bg-slate-900/90">
                        {searchResults.map((c) => (
                          <button key={c.id} onClick={() => handleSearchSelect(c)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700 transition border-b border-slate-800 last:border-0 text-left group">
                            <div>
                               <div className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">{c.name}</div>
                               <div className="text-[10px] text-slate-400 uppercase tracking-widest">{c.district} · AC {c.id}</div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                          </button>
                        ))}
                      </div>
                    )}

                    <button onClick={gotoMyConstituency} className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600/90 hover:bg-indigo-500 transition-colors rounded-2xl font-bold text-xs shadow-lg active:scale-95 text-white backdrop-blur-sm">
                      <Locate className="w-3.5 h-3.5" /> Locate Me
                    </button>
                </div>
              )}
            </div>
            
            {/* Application Title (Beside Search Icon, never gets covered) */}
            <div className="pointer-events-none z-[10010] flex flex-col">
               <h1 className="text-lg sm:text-2xl font-black tracking-tight uppercase truncate whitespace-nowrap" style={{ background: 'linear-gradient(135deg, #a5b4fc 0%, #e0e7ff 40%, #ffffff 60%, #c7d2fe 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 12px rgba(129,140,248,0.5)) drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }}>GENZ VOTE 2026</h1>
               <div className="text-[8px] sm:text-[9px] font-bold tracking-[0.3em] uppercase text-indigo-400/60 -mt-0.5 ml-0.5">Kerala Election Sim</div>
            </div>
          </div>

          {/* TOP RIGHT - LIVE STATS & MINIMAL LEGEND */}
          <div className="fixed top-3 sm:top-4 right-3 pointer-events-none z-[10000]">
             <div className="glass-panel px-3 sm:px-4 py-1.5 sm:py-2.5 rounded-2xl pointer-events-auto border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.1),0_8px_32px_rgba(0,0,0,0.4)] flex flex-col items-end gap-1.5 min-w-[120px] sm:min-w-[160px]">
                
                {/* Live Head */}
                <div className="flex items-center gap-2 mb-0.5">
                   <div className="text-[9px] sm:text-[10px] font-black tracking-widest text-white uppercase flex items-center gap-1.5 text-right w-full justify-end">
                      LIVE
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                   </div>
                </div>

                 {/* Total Counter + Leader */}
                 <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-3 mt-1 sm:mt-0">
                   <div className="text-right">
                       <div className="text-[7px] sm:text-[8px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Total Votes</div>
                       <div className="text-lg sm:text-2xl font-black text-white tabular-nums tracking-tighter leading-none">
                          {globalState.total.toLocaleString()}
                       </div>
                   </div>
                   {globalState.total > 0 && (
                     <>
                     <div className="hidden sm:block h-6 sm:h-8 w-px bg-slate-700"></div>
                     <div className={`flex sm:flex-col items-center sm:items-start gap-1.5 sm:gap-0 ${
                        globalState.leader === 'LDF' ? 'text-red-500' : 
                        globalState.leader === 'UDF' ? 'text-green-500' : 
                        globalState.leader === 'NDA' ? 'text-orange-500' : 'text-slate-300'
                     }`}>
                        <div className="text-[7px] sm:text-[8px] font-bold uppercase tracking-widest sm:mb-0.5 text-inherit opacity-70">Leading</div>
                        <div className="text-base sm:text-lg font-black tracking-tighter flex items-center gap-0.5 sm:gap-1 leading-none">
                           {globalState.leader}
                           <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 -mt-0.5 animate-bounce" />
                        </div>
                     </div>
                     </>
                   )}
                 </div>

                 {/* Minimal Legend - vertical on mobile, horizontal on desktop */}
                 <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-3 gap-y-0.5 sm:gap-2.5 mt-1 border-t border-slate-700/50 pt-1.5 w-full justify-end">
                    {[
                      { id: 'LDF', hex: 'bg-red-500' },
                      { id: 'UDF', hex: 'bg-green-500' },
                      { id: 'NDA', hex: 'bg-orange-500' },
                      { id: 'OTH', hex: 'bg-slate-500' }
                    ].map(g => (
                      <div key={g.id} className="flex items-center gap-1 justify-end">
                        <div className={`w-1.5 h-1.5 rounded-full outline outline-1 outline-black/20 ${g.hex}`}></div>
                        <span className="text-[7px] sm:text-[8px] font-bold text-slate-300 tracking-wider">{g.id}</span>
                      </div>
                    ))}
                 </div>
             </div>
          </div>

          {/* SPLASH POSTER */}
          {settings.poster_enabled && !posterDismissed && (
             <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4 pointer-events-auto">
               <div className="bg-slate-900 border border-slate-700 max-w-lg w-full rounded-3xl overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300">
                  <button 
                    onClick={() => {
                      setPosterDismissed(true);
                      if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
                    }} 
                    className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full hover:bg-black/80 backdrop-blur-md transition"
                  >
                     <X className="w-5 h-5" />
                  </button>
                  {settings.poster_url && <img src={settings.poster_url} className="w-full h-auto max-h-[400px] object-cover" />}
                  {settings.poster_message && (
                     <div className="p-6 text-center">
                        <h2 className="text-xl font-bold text-white mb-2">Notice</h2>
                        <p className="text-slate-300 text-sm whitespace-pre-wrap">{settings.poster_message}</p>
                     </div>
                  )}
               </div>
             </div>
          )}

          {/* FLOATING COFFEE / TIP JAR BUTTON */}
          <div className="fixed bottom-24 left-3 sm:bottom-6 sm:left-4 pointer-events-auto z-[10000]">
            <button 
              onClick={() => setTipJarOpen(true)}
              className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-slate-900 border border-slate-700 text-amber-500 shadow-[0_0_20px_rgba(0,0,0,0.8)] hover:bg-slate-800 hover:border-amber-500/50 hover:text-amber-400 transition-all active:scale-90 flex items-center justify-center group"
              style={{ animation: searchOpen ? 'none' : 'coffeeShake 3s ease-in-out infinite' }}
            >
              <Coffee className="w-5 h-5 sm:w-6 sm:h-6 drop-shadow-md" />
            </button>
          </div>

          {/* TIP JAR POPUP */}
          {tipJarOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4 pointer-events-auto" onClick={() => setTipJarOpen(false)}>
              <div className="bg-slate-900 border border-slate-700 max-w-sm w-full rounded-3xl overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300 p-6" onClick={e => e.stopPropagation()}>
                <button onClick={() => setTipJarOpen(false)} className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-slate-800 text-white rounded-full hover:bg-slate-700 transition">
                  <X className="w-4 h-4" />
                </button>
                
                <div className="text-center mb-8 mt-2">
                  <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <Coffee className="w-8 h-8 text-indigo-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight mb-1">Support the Developer</h2>
                  <p className="text-slate-400 text-xs">Choose a tier to fuel the midnight coding sessions.</p>
                </div>

                <div className="space-y-3">
                  {[
                    { label: 'Buy me a Coffee', amount: 20, icon: '☕' },
                    { label: 'Buy me a Samosa', amount: 50, icon: '🥟' },
                    { label: 'Buy me a Pizza', amount: 100, icon: '🍕' },
                  ].map(tier => (
                    <a
                      key={tier.label}
                      href={`upi://pay?pa=hariramachandran252003@oksbi&pn=Hari&am=${tier.amount}&cu=INR&tn=GenzVote%20Support%20-%20${tier.label}`}
                      className="flex items-center gap-4 w-full p-4 rounded-2xl bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-indigo-500/30 transition-all active:scale-95 group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-2xl shadow-inner border border-slate-800/80 group-hover:scale-110 transition-transform">
                        {tier.icon}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-slate-200 font-semibold text-sm group-hover:text-white transition-colors">{tier.label}</div>
                      </div>
                      <div className="text-white font-black text-lg bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-800">
                        ₹{tier.amount}
                      </div>
                    </a>
                  ))}
                </div>

                <p className="text-center text-slate-500 text-[10px] mt-4">Made with ❤️ in Kerala</p>
              </div>
            </div>
          )}

          {/* FLOATING VOTE PANEL */}
          <div className={cn('fixed bottom-0 left-0 right-0 p-2 sm:p-4 transition-transform duration-500 ease-in-out pointer-events-none', selectedId ? 'translate-y-0' : 'translate-y-full')} style={{ zIndex: 10000 }}>
            <div className="max-w-md mx-auto glass-panel p-3 sm:p-5 rounded-t-3xl pointer-events-auto border-b-0 sm:border-b shadow-[0_-10px_40px_rgba(0,0,0,0.5)] relative overflow-hidden backdrop-blur-xl bg-slate-900/85">
              
              {/* Top Navigation Row */}
              <div className="flex items-center justify-between mb-3 px-1">
                <button 
                  onClick={() => navigateConstituency(-1)}
                  disabled={!selectedId || selectedId <= 1}
                  className="p-2 sm:p-2 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-full transition-all active:scale-90 disabled:opacity-20 shrink-0 z-10"
                >
                  <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                
                <div className="text-center flex-1 px-2 overflow-hidden flex flex-col justify-center min-w-0">
                  <h2 className="text-lg sm:text-2xl font-black text-white uppercase tracking-tight leading-none truncate">{selectedProps?.name || 'Constituency'}</h2>
                  <p className="text-emerald-400 font-bold text-[10px] sm:text-xs uppercase tracking-widest mt-1 truncate">
                    {selectedProps?.district || 'Kerala'} {selectedProps?.id ? ` · AC ${selectedProps.id}` : ''}
                  </p>
                </div>

                <div className="relative shrink-0 flex items-center pr-8 sm:pr-10 z-10">
                  <button 
                    onClick={() => navigateConstituency(1)}
                    disabled={!selectedId || selectedId >= 140}
                    className="p-2 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-full transition-all active:scale-90 disabled:opacity-20 flex"
                  >
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>

              {/* Close Button pushed absolutely to corner */}
              <button className="absolute top-2.5 right-2 sm:top-4 sm:right-4 p-1.5 sm:p-2 bg-slate-800/80 rounded-full hover:bg-slate-700 transition active:scale-90 shadow-md z-20" onClick={() => setSelectedId(null)}>
                <X className="w-4 h-4 sm:w-4 sm:h-4 text-slate-300" />
              </button>

              {/* Compact Rolling Counter Stats */}
              <div className="bg-slate-800/60 rounded-2xl p-2.5 sm:p-3 flex gap-4 overflow-hidden relative border border-slate-700/50 shadow-inner mx-1">
                <div className="flex-1 text-center">
                  <div className="text-xl sm:text-2xl font-black text-white tabular-nums tracking-tighter leading-none">
                    {curStatUnified?.total?.toLocaleString() || 0}
                  </div>
                  <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">Total Cast</div>
                </div>
                <div className="w-px bg-slate-700/80"></div>
                <div className="flex-1 text-center">
                  <div className={`text-xl sm:text-2xl font-black tabular-nums tracking-tighter leading-none ${
                     curStatUnified?.leader === 'LDF' ? 'text-red-500' :
                     curStatUnified?.leader === 'UDF' ? 'text-green-500' :
                     curStatUnified?.leader === 'NDA' ? 'text-orange-500' : 'text-slate-300'
                  }`}>
                    {curStatUnified?.leader && curStatUnified.leader !== 'OTHER' ? curStatUnified.leader : curStatUnified?.total ? 'TIE' : '-'}
                  </div>
                  <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">Projected</div>
                </div>
              </div>

              {/* Progress Bar (Compact) */}
              {curStatUnified && curStatUnified.total > 0 && (
                <div className="w-full h-1.5 rounded-full bg-slate-900 mt-3 overflow-hidden flex shadow-inner opacity-80">
                  <div style={{ width: `${(curStatUnified.ldf / curStatUnified.total) * 100}%` }} className="bg-red-500 transition-all duration-300"></div>
                  <div style={{ width: `${(curStatUnified.udf / curStatUnified.total) * 100}%` }} className="bg-green-500 transition-all duration-300"></div>
                  <div style={{ width: `${(curStatUnified.nda / curStatUnified.total) * 100}%` }} className="bg-orange-500 transition-all duration-300"></div>
                  <div style={{ width: `${(curStatUnified.oth / curStatUnified.total) * 100}%` }} className="bg-slate-500 transition-all duration-300"></div>
                </div>
              )}

              {/* Vote Actions & Minimal Grid Combined */}
              <div className="mt-4 space-y-2">
                {voteMessage && (
                  <div className={cn('py-2 text-center rounded-xl font-bold text-xs shadow-lg animate-in fade-in', voteMessage.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white')}>{voteMessage.text}</div>
                )}

                {!hasVotedGlobally ? (
                  <div className="grid grid-cols-4 gap-2">
                    {VOTE_GROUPS.map((party) => {
                       const pVal = curStatUnified ? curStatUnified[party.id.toLowerCase() as keyof typeof curStatUnified] as number : 0;
                       return (
                        <button key={party.id} onClick={() => handleVote(party.id)} disabled={isVoting} className={cn('flex flex-col items-center justify-center p-2 rounded-xl font-black uppercase transition-all shadow-[0_4px_10px_rgba(0,0,0,0.3)] active:scale-95 disabled:opacity-50 text-white border border-white/10 group', party.color, party.active)}>
                          <span className="text-[10px] tracking-wider mb-1 opacity-80 group-hover:opacity-100">VOTE</span>
                          <span className="text-sm tracking-tight">{party.id}</span>
                          <span className="text-[9px] mt-1 opacity-60 font-medium tabular-nums">{pVal > 0 ? pVal.toLocaleString() : '0'}</span>
                        </button>
                       );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] sm:text-xs text-center p-2 rounded-xl">
                      You have already casted your vote. Try voting from a different device.
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: 'LDF', val: curStatUnified?.ldf || 0, color: 'text-red-400', bg: 'bg-red-950/30' },
                        { label: 'UDF', val: curStatUnified?.udf || 0, color: 'text-green-400', bg: 'bg-green-950/30' },
                        { label: 'NDA', val: curStatUnified?.nda || 0, color: 'text-orange-400', bg: 'bg-orange-950/30' },
                        { label: 'OTH', val: curStatUnified?.oth || 0, color: 'text-slate-400', bg: 'bg-slate-800/30' },
                      ].map((p) => (
                        <div key={p.label} className={cn('rounded-xl py-2 px-1 border border-slate-700/50', p.bg)}>
                          <div className={cn('text-[11px] sm:text-xs font-black tabular-nums', p.color)}>{p.val.toLocaleString()}</div>
                          <div className="text-[8px] sm:text-[9px] text-slate-400 font-bold tracking-widest mt-0.5">{p.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>,
        overlayContainer
      )}
    </>
  );
}
