import { UserProfile } from "../types";
import { getTranslation } from "../lib/translations";

interface RightPanelProps {
  profile: UserProfile;
}

export default function RightPanel({ profile }: RightPanelProps) {
  return (
    <div className="w-[240px] h-full bg-bg-main border-s border-border p-5 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
      {/* Level Card (violet feature card) */}
      <div className="bg-primary text-white rounded-2xl p-6 flex flex-col items-center justify-center shadow-lg shadow-primary/25 text-center">
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-widest mb-2">{getTranslation(profile.language, 'intelligenceLevel')}</span>
        <span className="text-2xl font-extrabold tracking-tight">{profile.level || 'Intermediate'}</span>
        <span className="mt-3 text-[11px] font-semibold py-1 px-3 bg-white/15 text-white rounded-full">
          {getTranslation(profile.language, 'totalPoints')}: {profile.points ?? 0}
        </span>
      </div>

      {/* Progress / Points Card */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 flex flex-col items-center justify-center">
        <span className="text-[10px] font-bold text-success uppercase tracking-widest mb-1">{getTranslation(profile.language, 'totalPoints')}</span>
        <div className="text-3xl font-black text-success tracking-tighter">{profile.points ?? 0}</div>
        <p className="text-[9px] font-bold text-success/70 uppercase mt-2 text-center">{getTranslation(profile.language, 'progressIncreasing')}</p>
      </div>

      {/* Growth Suggestion Card */}
      <div className="bg-surface-2 border border-border rounded-2xl p-5">
        <h3 className="text-[13px] font-bold text-primary mb-3 uppercase tracking-tight">{getTranslation(profile.language, 'growthSuggestion')}</h3>
        <p className="text-[12px] leading-relaxed text-text-muted">
          {getTranslation(profile.language, 'growthText').replace('{field}', profile.field)}
        </p>
      </div>
    </div>
  );
}
