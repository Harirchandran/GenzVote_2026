import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { cn } from './lib/utils';
import { Settings, Save, RefreshCw, Power, Image as ImageIcon, LogOut, Check, Search, ShieldAlert, Cpu, Bomb } from 'lucide-react';

interface AdminSettings {
  id: number;
  poster_enabled: boolean;
  poster_url: string;
  poster_message: string;
}

interface ConstituencyData {
  id: number;
  name: string;
  district: string;
  db_ldf: number;
  db_udf: number;
  db_nda: number;
  db_oth: number;
  db_total: number;
  sim_enabled: boolean;
  epoch: string;
  inc_ldf: number;
  inc_udf: number;
  inc_nda: number;
  inc_oth: number;
}

export default function Admin() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [globalSettings, setGlobalSettings] = useState<AdminSettings | null>(null);
  const [constituencies, setConstituencies] = useState<Record<number, ConstituencyData>>({});
  const [searchQuery, setSearchQuery] = useState('');
  
  // Track which rows are currently saving
  const [savingRows, setSavingRows] = useState<Record<number, boolean>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchAllData();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchAllData();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Global Settings (Posters)
      const { data: globalData } = await supabase.from('admin_settings').select('*').eq('id', 1).single();
      if (globalData) setGlobalSettings(globalData);

      // 2. Fetch GeoJSON for Names & Districts
      const geoRes = await fetch('/Kerala_140_AC_Geo_Data.json');
      const geoData = await geoRes.json();
      
      const geoMap: Record<number, {name: string, district: string}> = {};
      geoData.forEach((item: any) => {
        geoMap[item.AC_NO] = { name: item.AC_NAME || `AC ${item.AC_NO}`, district: item.DISTRICT || 'Kerala' };
      });

      // 3. Fetch DB Stats & Sim Settings
      const [{ data: statsData }, { data: simData }] = await Promise.all([
        supabase.from('constituency_stats').select('*'),
        supabase.from('admin_constituency_settings').select('*')
      ]);

      const merged: Record<number, ConstituencyData> = {};

      if (statsData && simData) {
        for (let i = 1; i <= 140; i++) {
           const sRecord = statsData.find(s => s.constituency_id === i) || { ldf_votes: 0, udf_votes: 0, nda_votes: 0, other_votes: 0, total_votes: 0 };
           const cRecord = simData.find(s => s.constituency_id === i) || { sim_enabled: false, epoch: new Date().toISOString(), inc_ldf: 0, inc_udf: 0, inc_nda: 0, inc_oth: 0 };
           const geo = geoMap[i] || { name: `AC ${i}`, district: 'Unknown' };

           merged[i] = {
             id: i,
             name: geo.name,
             district: geo.district,
             db_ldf: sRecord.ldf_votes,
             db_udf: sRecord.udf_votes,
             db_nda: sRecord.nda_votes,
             db_oth: sRecord.other_votes,
             db_total: sRecord.total_votes,
             sim_enabled: cRecord.sim_enabled,
             epoch: cRecord.epoch,
             inc_ldf: cRecord.inc_ldf,
             inc_udf: cRecord.inc_udf,
             inc_nda: cRecord.inc_nda,
             inc_oth: cRecord.inc_oth,
           };
        }
      }
      setConstituencies(merged);
    } catch (err) {
      console.error(err);
      setError('Failed to load comprehensive data map.');
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleLogout = () => supabase.auth.signOut();

  const handleSaveGlobal = async () => {
    if (!globalSettings) return;
    setLoading(true);
    await supabase.from('admin_settings').update({
       poster_enabled: globalSettings.poster_enabled,
       poster_url: globalSettings.poster_url,
       poster_message: globalSettings.poster_message,
    }).eq('id', 1);
    setLoading(false);
  };

  const handleBakeAndSaveRow = async (id: number) => {
    const row = constituencies[id];
    if (!row) return;

    setSavingRows(prev => ({ ...prev, [id]: true }));

    // 1. Calculate projected fake votes up to *RIGHT NOW* to prevent backward jumping
    const now = Date.now();
    const ep = new Date(row.epoch).getTime();
    const t = Math.max(0, (now - ep) / 60000); // elapsed minutes

    if (row.sim_enabled) {
      // Add the projected fake votes to the editable input values
      // (This means if the admin edited the DB values, they are also adding the fake accumulated since last epoch)
      row.db_ldf = Math.floor(row.db_ldf + (t * row.inc_ldf));
      row.db_udf = Math.floor(row.db_udf + (t * row.inc_udf));
      row.db_nda = Math.floor(row.db_nda + (t * row.inc_nda));
      row.db_oth = Math.floor(row.db_oth + (t * row.inc_oth));
    }

    try {
      // Call secure RPC
      const { error } = await supabase.rpc('admin_save_constituency', {
        p_id: row.id,
        f_ldf: row.db_ldf,
        f_udf: row.db_udf,
        f_nda: row.db_nda,
        f_oth: row.db_oth,
        s_on: row.sim_enabled,
        i_ldf: row.inc_ldf,
        i_udf: row.inc_udf,
        i_nda: row.inc_nda,
        i_oth: row.inc_oth
      });

      if (error) throw error;
      
      // Update local epoch to reflect the bake
      setConstituencies(prev => ({
        ...prev,
        [id]: { ...row, epoch: new Date().toISOString() }
      }));
    } catch(err: any) {
      alert("Error saving row " + id + ": " + err.message);
    }
    
    setSavingRows(prev => ({ ...prev, [id]: false }));
  };

  const handleResetFakeVotes = async () => {
    if (!window.confirm("Are you sure you want to reset all fake simulation votes globally? This will completely overwrite the statistics table back to the true organic votes from the database and wipe all baked numbers!")) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('admin_nuke_fake_votes');
      if (error) throw error;
      alert("All Fake Votes Reset to 0 Globally! Organic votes successfully restored.");
      await fetchAllData();
    } catch (err: any) {
      alert("Nuke Failed. Have you run the updated schema.sql in Supabase? Error: " + err.message);
    }
    setLoading(false);
  };

  const isMasterSimOn = useMemo(() => {
    return Object.values(constituencies).some(c => c.sim_enabled);
  }, [constituencies]);

  const handleMasterToggle = async () => {
    const turningOn = !isMasterSimOn;
    const msg = turningOn 
      ? "GLOBAL START: Are you sure you want to turn ON the simulation for all 140 constituencies instantly?" 
      : "GLOBAL STOP: Are you sure you want to stop all simulations? This will safely Bake all currently generated votes permanently into the database so no data is lost.";
    if (!window.confirm(msg)) return;

    setLoading(true);
    try {
      if (!turningOn) {
         // Pause: We MUST bake all currently active simulations to the DB.
         const now = Date.now();
         const activeNodes = Object.values(constituencies).filter(r => r.sim_enabled);
         
         for (const row of activeNodes) {
            const ep = new Date(row.epoch).getTime();
            const t = Math.max(0, (now - ep) / 60000);
            const r_ldf = Math.floor(row.db_ldf + (t * row.inc_ldf));
            const r_udf = Math.floor(row.db_udf + (t * row.inc_udf));
            const r_nda = Math.floor(row.db_nda + (t * row.inc_nda));
            const r_oth = Math.floor(row.db_oth + (t * row.inc_oth));

            const { error: rpcErr } = await supabase.rpc('admin_save_constituency', {
               p_id: row.id,
               f_ldf: r_ldf,
               f_udf: r_udf,
               f_nda: r_nda,
               f_oth: r_oth,
               s_on: false, // Master toggle off
               i_ldf: row.inc_ldf,
               i_udf: row.inc_udf,
               i_nda: row.inc_nda,
               i_oth: row.inc_oth
            });
            if (rpcErr) throw rpcErr;
         }
      } else {
         // Resume: Ensure epochs are right now so no jumping occurs.
         const { error } = await supabase.from('admin_constituency_settings')
            .update({ sim_enabled: true, epoch: new Date().toISOString() })
            .neq('constituency_id', 0);
         if (error) throw error;
      }
      
      await fetchAllData();
    } catch(err: any) {
      alert("Master Toggle Failed: " + err.message);
    }
    setLoading(false);
  };


  const handleChange = (id: number, field: keyof ConstituencyData, value: number | boolean) => {
    setConstituencies(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const sortedRows = useMemo(() => {
    let arr = Object.values(constituencies);
    if (searchQuery) {
       const q = searchQuery.toLowerCase();
       arr = arr.filter(c => c.name.toLowerCase().includes(q) || c.district.toLowerCase().includes(q));
    }
    // Sort by District then ID
    return arr.sort((a, b) => a.district.localeCompare(b.district) || a.id - b.id);
  }, [constituencies, searchQuery]);

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel p-8 rounded-3xl border border-slate-800">
          <div className="flex justify-center mb-6"><div className="p-3 bg-indigo-500/10 rounded-full border border-indigo-500/20"><Settings className="w-8 h-8 text-indigo-400" /></div></div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">Admin God Mode</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none" /></div>
            <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Master Key</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none" /></div>
            {error && <div className="text-red-400 text-sm p-3 bg-red-400/10 rounded-xl border border-red-400/20">{error}</div>}
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg mt-4 disabled:opacity-50">Authenticate</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-slate-200 flex flex-col font-mono text-sm relative overflow-hidden">
      
      {/* HEADER */}
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800 p-4 shrink-0 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Granular God-Mode Control</h1>
            <p className="text-[10px] text-slate-400">Direct Database Manipulation</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Search District/Name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 outline-none focus:border-indigo-500" />
          </div>
          <button onClick={handleResetFakeVotes} disabled={loading} className="p-2 sm:px-4 sm:py-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 hover:border-red-600 rounded-lg transition text-xs font-bold flex items-center gap-2 shadow-lg disabled:opacity-50" title="Wipe all Fake Generated Votes globally">
             <Bomb className="w-4 h-4" /> <span className="hidden sm:inline">Nuke Fake Votes</span>
          </button>
          <button onClick={fetchAllData} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition" title="Refresh Latest Live Data"><RefreshCw className="w-5 h-5 text-indigo-400" /></button>
          <button onClick={handleLogout} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition"><LogOut className="w-5 h-5 text-rose-400" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4 flex flex-col xl:flex-row gap-6">
         
         {/* GLOBAL SETTINGS SIDEBAR */}
         {globalSettings && (
            <div className="w-full xl:w-80 shrink-0 overflow-y-auto custom-scrollbar pr-2 space-y-4">
               
               {/* MASTER SIMULATION TOGGLE */}
               <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none"></div>
                 <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4 uppercase tracking-widest"><Cpu className="w-4 h-4 text-indigo-400" /> Master Control</h2>
                 
                 <div className="flex flex-col gap-3">
                   <div className="text-xs text-slate-400 mb-2 leading-relaxed">
                     {isMasterSimOn 
                        ? "Simulation is actively generating votes. Stop it to permanently bake all votes and view strict DB numbers."
                        : "Simulation is offline. Real DB votes are shown. Turn on to resume localized simulated velocity."}
                   </div>
                   
                   <button 
                     onClick={handleMasterToggle} 
                     disabled={loading}
                     className={cn(
                       "w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest flex flex-col items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50 border-2",
                       isMasterSimOn 
                         ? "bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500 hover:text-white" 
                         : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500 hover:text-white"
                     )}
                   >
                     <Power className={cn("w-8 h-8", isMasterSimOn && "animate-pulse")} />
                     {isMasterSimOn ? "Halt & Bake Simulation" : "Start Global Simulation"}
                   </button>
                 </div>
               </div>

               {/* POSTER MODAL COONTROLS */}
               <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                 <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4 uppercase tracking-widest"><ImageIcon className="w-4 h-4 text-purple-400" /> Poster Modal</h2>
                 <div className="space-y-4">
                   <label className="flex items-center gap-3 cursor-pointer">
                     <input type="checkbox" checked={globalSettings.poster_enabled} onChange={e => setGlobalSettings({...globalSettings, poster_enabled: e.target.checked})} className="w-4 h-4 accent-purple-500" />
                     <span className="text-xs font-bold text-slate-300">Enable Poster</span>
                   </label>
                   <div><label className="block text-[10px] text-slate-500 mb-1">Image URL</label><input type="text" value={globalSettings.poster_url} onChange={e => setGlobalSettings({...globalSettings, poster_url: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded py-1.5 px-3 text-xs" /></div>
                   <div><label className="block text-[10px] text-slate-500 mb-1">Message</label><textarea value={globalSettings.poster_message} onChange={e => setGlobalSettings({...globalSettings, poster_message: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded py-1.5 px-3 text-xs resize-none h-20" /></div>
                   <button onClick={handleSaveGlobal} className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg font-bold text-xs transition">Save Poster</button>
                 </div>
               </div>
            </div>
         )}
         
         {/* MASTER DATA GRID */}
         <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col min-w-0 overflow-hidden">
            <div className="overflow-auto flex-1 custom-scrollbar relative">
               <table className="w-full text-left whitespace-nowrap min-w-[1200px]">
                  <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-500 sticky top-0 z-10">
                     <tr>
                        <th className="p-3 pl-4 sticky left-0 bg-slate-950 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Constituency</th>
                        <th className="p-3 text-center border-l border-slate-800/50 bg-slate-900/40" colSpan={4}>Hard DB Overrides (Votes)</th>
                        <th className="p-3 text-center border-l border-r border-slate-800/50 bg-indigo-900/20" colSpan={5}>Live Simulation Speeds (Votes/Min)</th>
                        <th className="p-3 text-center">Action</th>
                     </tr>
                     <tr className="bg-slate-900 border-b border-slate-800/50">
                        <td className="p-2 border-r border-slate-800 sticky left-0 bg-slate-900 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]"></td>
                        <td className="p-2 text-red-500 text-center font-bold">LDF</td>
                        <td className="p-2 text-green-500 text-center font-bold">UDF</td>
                        <td className="p-2 text-orange-500 text-center font-bold">NDA</td>
                        <td className="p-2 text-slate-400 text-center font-bold border-r border-slate-800">OTH</td>
                        
                        <td className="p-2 text-center text-indigo-400 border-r border-slate-800">SIM</td>
                        <td className="p-2 text-red-400 text-center">Inc L</td>
                        <td className="p-2 text-green-400 text-center">Inc U</td>
                        <td className="p-2 text-orange-400 text-center">Inc N</td>
                        <td className="p-2 text-slate-400 text-center border-r border-slate-800">Inc O</td>
                        <td className="p-2"></td>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {sortedRows.length === 0 ? (
                       <tr><td colSpan={11} className="p-8 text-center text-slate-500">No constituencies found. Check database.</td></tr>
                    ) : sortedRows.map(row => (
                       <tr key={row.id} className="hover:bg-slate-800/20 transition-colors">
                          <td className="p-3 border-r border-slate-800 sticky left-0 bg-slate-900 hover:bg-slate-800 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                             <div className="font-bold text-white text-xs">{row.name}</div>
                             <div className="text-[9px] text-slate-500 uppercase">{row.district} · AC {row.id}</div>
                          </td>
                          
                          {/* DB Overrides */}
                          <td className="p-2"><input type="number" min="0" value={row.db_ldf} onChange={e => handleChange(row.id, 'db_ldf', parseInt(e.target.value) || 0)} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs focus:border-red-500 text-center text-white" /></td>
                          <td className="p-2"><input type="number" min="0" value={row.db_udf} onChange={e => handleChange(row.id, 'db_udf', parseInt(e.target.value) || 0)} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs focus:border-green-500 text-center text-white" /></td>
                          <td className="p-2"><input type="number" min="0" value={row.db_nda} onChange={e => handleChange(row.id, 'db_nda', parseInt(e.target.value) || 0)} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs focus:border-orange-500 text-center text-white" /></td>
                          <td className="p-2 border-r border-slate-800"><input type="number" min="0" value={row.db_oth} onChange={e => handleChange(row.id, 'db_oth', parseInt(e.target.value) || 0)} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs focus:border-slate-500 text-center text-white" /></td>
                          
                          {/* Sim Configs */}
                          <td className="p-2 border-r border-slate-800 text-center bg-indigo-950/10">
                              <input type="checkbox" checked={row.sim_enabled} onChange={e => handleChange(row.id, 'sim_enabled', e.target.checked)} className="w-4 h-4 accent-indigo-500 cursor-pointer" />
                          </td>
                          <td className="p-2 bg-indigo-950/10"><input type="number" step="0.1" min="0" value={row.inc_ldf} onChange={e => handleChange(row.id, 'inc_ldf', parseFloat(e.target.value) || 0)} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs focus:border-red-400 text-center text-rose-300" /></td>
                          <td className="p-2 bg-indigo-950/10"><input type="number" step="0.1" min="0" value={row.inc_udf} onChange={e => handleChange(row.id, 'inc_udf', parseFloat(e.target.value) || 0)} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs focus:border-green-400 text-center text-emerald-300" /></td>
                          <td className="p-2 bg-indigo-950/10"><input type="number" step="0.1" min="0" value={row.inc_nda} onChange={e => handleChange(row.id, 'inc_nda', parseFloat(e.target.value) || 0)} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs focus:border-orange-400 text-center text-amber-300" /></td>
                          <td className="p-2 border-r border-slate-800 bg-indigo-950/10"><input type="number" step="0.1" min="0" value={row.inc_oth} onChange={e => handleChange(row.id, 'inc_oth', parseFloat(e.target.value) || 0)} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs focus:border-slate-400 text-center text-slate-300" /></td>
                          
                          <td className="p-2 text-center">
                             <button onClick={() => handleBakeAndSaveRow(row.id)} disabled={savingRows[row.id]} className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors min-w-[80px]">
                                {savingRows[row.id] ? 'Saving...' : 'Bake & Save'}
                             </button>
                          </td>
                       </tr>
                    ))}
                  </tbody>
               </table>
            </div>
         </div>

      </div>
    </div>
  );
}
