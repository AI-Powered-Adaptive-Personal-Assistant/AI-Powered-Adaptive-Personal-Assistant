import { localize } from '../lib/translations';
import React, { useMemo, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { Brain, TrendingUp, Star, ShieldCheck, Activity, Menu, Zap, Target, GitCommit, Search, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, Cell } from 'recharts';
import { formatDate } from '../lib/utils';
import { getTranslation } from '../lib/translations';

interface IntelligenceHubProps {
  profile: UserProfile;
  onMenuClick?: () => void;
}

const IntelligenceHub = React.memo(({ profile, onMenuClick }: IntelligenceHubProps) => {
  // Simulated Radar Data for "Advanced" look
  const radarData = useMemo(() => [
    { subject: 'Logic', A: profile.level === 'Advanced' ? 120 : profile.level === 'Intermediate' ? 80 : 40, fullMark: 150 },
    { subject: 'Creativity', A: 98, fullMark: 150 },
    { subject: 'Speed', A: 86, fullMark: 150 },
    { subject: 'Retention', A: 99, fullMark: 150 },
    { subject: 'Adaptability', A: profile.level === 'Basic' ? 65 : 100, fullMark: 150 },
    { subject: 'Focus', A: 85, fullMark: 150 },
  ], [profile.level]);

  // Area Chart Data
  const chartData = useMemo(() =>
    (profile.questionHistory || []).map((h, i) => ({
      name: `Q${i + 1}`,
      score: h.score,
      fullDate: formatDate(h.date)
    })), [profile.questionHistory]
  );
  
  // Weekly Activity Simulation for Bar Chart
  const activityData = useMemo(() => [
    { day: 'Mon', count: 12 },
    { day: 'Tue', count: 19 },
    { day: 'Wed', count: 15 },
    { day: 'Thu', count: 22 },
    { day: 'Fri', count: 8 },
    { day: 'Sat', count: 30 },
    { day: 'Sun', count: 25 },
  ], []);

  const growthIndex = useMemo(() => 
    ((profile.points / 2000) * 100).toFixed(1), 
    [profile.points]
  );

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-bg-main dark:bg-slate-950 p-4 md:p-8 flex flex-col gap-6 custom-scrollbar text-text-main dark:text-slate-100 transition-colors">
      <header className="flex flex-col md:flex-row justify-between lg:items-end gap-4 shrink-0">
        <div className="flex items-start gap-4">
          <button 
            onClick={onMenuClick}
            className="lg:hidden p-2 text-text-muted bg-bg-card dark:bg-[#0E0E12] shadow-sm border border-border hover:bg-bg-main rounded-lg active:scale-95 transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase flex items-center gap-3">
              <Brain className="w-7 h-7 text-primary" />
              {getTranslation(profile.language, 'dashboard') || 'Intelligence Hub'}
            </h1>
            <p className="text-xs font-mono text-text-muted dark:text-faint mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              SYSTEM.ANALYTICS.ONLINE
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-bg-card dark:bg-[#0E0E12] rounded-full border border-border shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Live Sync</span>
          <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Top KPI Metrics - Bento Style */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <BentoMetric 
            label="Cognitive Score" 
            value={profile.iqScore || 0} 
            icon={Target} 
            color="text-primary" 
            bg="bg-primary-soft dark:bg-primary/10" 
            trend={`+${((profile.questionHistory?.length || 0) * 0.5).toFixed(1)} pts`}
          />
          <BentoMetric 
            label="Merit Points" 
            value={profile.points} 
            icon={Star} 
            color="text-accent" 
            bg="bg-accent-soft dark:bg-accent/10" 
            trend="Rank Up" 
          />
          <BentoMetric 
            label="Growth Velocity" 
            value={`${growthIndex}%`} 
            icon={TrendingUp} 
            color="text-emerald-500" 
            bg="bg-primary-soft dark:bg-emerald-500/10" 
            trend="Optimal" 
          />
          <BentoMetric 
            label="Certification" 
            value={profile.level} 
            icon={ShieldCheck} 
            color="text-purple-500" 
            bg="bg-accent-soft dark:bg-purple-500/10" 
            trend="Verified" 
          />
        </div>

        {/* Main Analytics Grid container */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Main Chart Area */}
          <div className="xl:col-span-8 bg-bg-card dark:bg-[#0E0E12] rounded-[28px] border border-border shadow-sm p-6 flex flex-col min-h-[380px] relative overflow-hidden group">
            <div className="flex justify-between items-center mb-6 relative z-10">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-text-main dark:text-slate-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Progression Curve
                </h3>
                <p className="text-xs font-mono text-faint mt-1">HISTORICAL.PERFORMANCE.DATA</p>
              </div>
              <div className="text-xs font-mono bg-surface-3 px-3 py-1 rounded-lg text-text-muted">
                LATEST_Q: {profile.questionHistory.length}
              </div>
            </div>
            
            <div className="flex-1 w-full relative z-10">
              {chartData.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-faint dark:text-text-muted gap-3">
                  <Search className="w-8 h-8 opacity-50" />
                  <p className="text-[10px] font-mono tracking-widest">AWAITING_DATA_INPUT</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorScoreBento" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-5 dark:opacity-10" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600, fontFamily: 'monospace' }}
                      dy={10} 
                    />
                    <YAxis hide domain={[0, 'dataMax + 2']} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-2xl border border-slate-700 font-mono">
                              <p className="text-[9px] text-faint uppercase mb-1">{payload[0].payload.fullDate}</p>
                              <p className="text-sm">EVAL: <span className="text-primary">{payload[0].value}</span></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#6366f1" 
                      strokeWidth={3}
                      fill="url(#colorScoreBento)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            {/* Decorative background element */}
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-1000 pointer-events-none" />
          </div>

          {/* Radar Chart (Skill Tree) */}
          <div className="xl:col-span-4 bg-bg-card dark:bg-[#0E0E12] rounded-[28px] border border-border shadow-sm p-6 flex flex-col min-h-[380px]">
            <h3 className="text-sm font-black uppercase tracking-widest text-text-main dark:text-slate-200 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" /> Neural Vector
            </h3>
            <p className="text-xs font-mono text-faint mb-6">COGNITIVE.DISTRIBUTION.RADAR</p>
            
            <div className="flex-1 w-full min-h-[200px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="currentColor" className="opacity-10 dark:opacity-20" />
                  <PolarAngleAxis 
                    dataKey="subject" 
                    tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }} 
                  />
                  <Radar 
                    name="Skill" 
                    dataKey="A" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    fill="#8b5cf6" 
                    fillOpacity={0.3} 
                    animationDuration={1500}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-900 text-white px-3 py-2 rounded-lg font-mono text-[10px] border border-slate-700">
                            {payload[0].payload.subject}: <span className="text-purple-400">{payload[0].value}</span> / {payload[0].payload.fullMark}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 flex flex-col gap-2">
               <div className="flex justify-between items-center text-[10px] font-mono border-t border-border pt-3">
                  <span className="text-faint">DOMINANT_TRAIT</span>
                  <span className="text-purple-500 font-bold tracking-widest mb-0.5">{radarData.reduce((prev, current) => (prev.A > current.A) ? prev : current).subject}</span>
               </div>
            </div>
          </div>
          
          {/* Bottom Bar Chart - Activity Heat */}
          <div className="xl:col-span-8 bg-bg-card dark:bg-[#0E0E12] rounded-[28px] border border-border shadow-sm p-6 flex flex-col">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-text-main dark:text-slate-200 flex items-center gap-2">
                  <GitCommit className="w-4 h-4 text-emerald-500" /> Engagement Frequency
                </h3>
              </div>
              <div className="flex-1 w-full min-h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-5 dark:opacity-10" />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }} 
                      dy={10}
                    />
                    <Tooltip cursor={{fill: 'currentColor', opacity: 0.05}} 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-900 text-white px-3 py-2 rounded-lg font-mono text-[10px] border border-slate-700">
                              {payload[0].payload.day}: <span className="text-emerald-400">{payload[0].value} OPS</span>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} animationDuration={1500}>
                      {activityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === activityData.length - 1 ? '#10b981' : '#cbd5e1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </div>

          {/* System Status Panel */}
          <div className="xl:col-span-4 bg-slate-900 rounded-[28px] text-white shadow-xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-faint">System Parameters</span>
              </div>
              
              <div className="space-y-4 flex-1">
                <SystemModule label="Core Engine" value="ONLINE" status="good" />
                <SystemModule label="Data Sync" value={profile.lastQuizDate ? 'STABLE' : 'PENDING'} status={profile.lastQuizDate ? 'good' : 'warn'} />
                <SystemModule label="Recalibration" value={profile.lastQuizDate ? new Date(new Date(profile.lastQuizDate).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString() : 'REQUIRED'} status="neutral" />
                <div className="pt-4 border-t border-white/10 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-3.5 h-3.5 text-accent" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-faint">Sustainability Path</span>
                  </div>
                  <div className="bg-bg-card/5 rounded-xl p-3 border border-emerald-500/20">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">UN Goal Alignment</p>
                    <p className="text-xs font-bold text-slate-100">{profile.sustainabilityGoal === 'climate' ? 'Climate Action' : profile.sustainabilityGoal === 'quality-edu' ? 'Quality Education' : profile.sustainabilityGoal === 'health' ? 'Health & Well-being' : profile.sustainabilityGoal === 'zero-hunger' ? 'Zero Hunger' : 'General Sustainability'}</p>
                  </div>
                </div>
              </div>

              <button onClick={() => window.location.hash = '#settings'} className="mt-6 w-full py-3 bg-bg-card/10 hover:bg-bg-card/20 transition-colors rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 group-hover:border-white/20 border border-transparent">
                Modify Parameters <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
});

export default IntelligenceHub;

function BentoMetric({ label, value, icon: Icon, color, bg, trend }: { label: string, value: string | number, icon: any, color: string, bg: string, trend: string }) {
  return (
    <div className="bg-bg-card dark:bg-[#0E0E12] p-4 sm:p-5 rounded-[24px] border border-border dark:border-white/10 shadow-sm flex flex-col justify-between gap-3 min-w-0 overflow-hidden group hover:border-border dark:hover:border-white/20 transition-colors">
      <div className="flex justify-between items-start gap-2">
        <div className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 ${bg} ${color} rounded-xl flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-[9px] font-mono px-2 py-1 bg-surface-3 text-text-main/80 rounded-md shrink-0 whitespace-nowrap">
          {trend.toUpperCase()}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-1 truncate">{label}</p>
        <p className={`font-mono text-text-main dark:text-white font-black tracking-tight break-words leading-tight ${typeof value === 'string' && value.length > 9 ? 'text-base sm:text-lg' : 'text-2xl'}`}>{value}</p>
      </div>
    </div>
  );
}

function SystemModule({ label, value, status }: { label: string, value: string, status: 'good' | 'warn' | 'neutral' }) {
  const statusColors = {
    good: 'text-emerald-400',
    warn: 'text-accent',
    neutral: 'text-primary'
  };
  
  return (
    <div className="flex justify-between items-center p-3 rounded-xl bg-bg-card/5 border border-white/5">
      <span className="text-xs font-medium text-faint">{label}</span>
      <span className={`text-[10px] font-mono tracking-widest ${statusColors[status]}`}>{value}</span>
    </div>
  );
}

