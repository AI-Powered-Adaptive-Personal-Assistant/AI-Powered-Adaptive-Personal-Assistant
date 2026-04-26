import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Mic, MicOff, Video, VideoOff, Brain, Sparkles, MessageSquare, Eye, Camera, RefreshCw, Hand, Heart, HelpCircle, ThumbsUp, ThumbsDown, Smile, Frown, Clock, Ear, MessageCircle, Home, Briefcase, Octagon, User } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getSignIconForWord = (word: string) => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  switch (w) {
    case 'hello': case 'hi': case 'hey': return <Hand className="w-5 h-5 text-emerald-500" />;
    case 'bye': case 'goodbye': return <Hand className="w-5 h-5 text-rose-500" />;
    case 'love': case 'like': return <Heart className="w-5 h-5 text-rose-500" />;
    case 'you': case 'your': case 'yours': return <User className="w-5 h-5 text-blue-500" />;
    case 'i': case 'me': case 'my': case 'mine': return <User className="w-5 h-5 text-amber-500" />;
    case 'what': case 'why': case 'how': case 'who': case 'where': case 'when': return <HelpCircle className="w-5 h-5 text-purple-500" />;
    case 'yes': case 'yeah': case 'yup': case 'ok': case 'okay': return <ThumbsUp className="w-5 h-5 text-emerald-500" />;
    case 'no': case 'nah': case 'nope': return <ThumbsDown className="w-5 h-5 text-rose-500" />;
    case 'good': case 'great': case 'awesome': return <Smile className="w-5 h-5 text-emerald-500" />;
    case 'bad': case 'terrible': case 'awful': return <Frown className="w-5 h-5 text-rose-500" />;
    case 'time': case 'wait': case 'soon': case 'later': return <Clock className="w-5 h-5 text-slate-500" />;
    case 'see': case 'look': case 'watch': return <Eye className="w-5 h-5 text-blue-500" />;
    case 'hear': case 'listen': case 'sound': return <Ear className="w-5 h-5 text-amber-500" />;
    case 'speak': case 'say': case 'talk': case 'tell': return <MessageCircle className="w-5 h-5 text-primary" />;
    case 'home': case 'house': return <Home className="w-5 h-5 text-amber-600" />;
    case 'work': case 'job': return <Briefcase className="w-5 h-5 text-slate-600" />;
    case 'stop': case 'halt': case 'end': return <Octagon className="w-5 h-5 text-rose-600" />;
    default: return <span className="font-black text-slate-400 text-sm uppercase">{w.charAt(0) || '?'}</span>;
  }
};

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}
