import { UserProfile } from "../types";

interface RightPanelProps {
  profile: UserProfile;
}

export default function RightPanel({ profile }: RightPanelProps) {
  return (
    <div className="w-[240px] h-full bg-bg-main border-l border-border p-5 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
      {/* Quality Score Card */}
      <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col items-center justify-center shadow-lg">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Estimated IQ Score</span>
        <div className="text-5xl font-extrabold mb-1 tracking-tighter">
          {profile.iqScore || '--'}
        </div>
        <div className="text-[9px] text-blue-400 uppercase font-black tracking-[0.2em] mb-3">Intelligence Level</div>
        <span className="text-[11px] font-bold uppercase py-1 px-3 bg-blue-500/20 text-blue-300 rounded text-center">
          {profile.level || 'Standard'}
        </span>
      </div>

      {/* Progress / Points Card */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex flex-col items-center justify-center">
        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total Points</span>
        <div className="text-3xl font-black text-emerald-700 tracking-tighter">{profile.points}</div>
        <p className="text-[9px] font-bold text-emerald-600/70 uppercase mt-2 text-center">Progress Increasing</p>
      </div>

      {/* Growth Engine Card */}
      <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-xl p-5">
        <h3 className="text-[13px] font-bold text-[#92400e] mb-3 uppercase tracking-tight">Growth Suggestion</h3>
        <p className="text-[12px] leading-relaxed text-[#92400e]/80">
          Your current engagement shows high technical maturity. Consider exploring how <strong>Cognitive Load Theory</strong> could further refine your interactions in the {profile.field} domain.
        </p>
      </div>
    </div>
  );
}
