import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { Menu, Mail, RefreshCw, AlertCircle, Send, Loader2, Info } from 'lucide-react';
import { getAccessToken, signInWithGoogle } from '../lib/firebase';
import { formatDistanceToNow } from 'date-fns';

interface GmailMessage {
  id: string;
  snippet: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
  };
}

interface GmailIntegrationProps {
  profile: UserProfile;
  onMenuClick: () => void;
}

export default function GmailIntegration({ profile, onMenuClick }: GmailIntegrationProps) {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const fetchEmails = async () => {
    setLoading(true);
    setError(null);
    try {
      let token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        setLoading(false);
        return;
      }

      setNeedsAuth(false);
      
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setNeedsAuth(true);
          return;
        }
        throw new Error('Failed to fetch messages');
      }

      const data = await res.json();
      const messageList = data.messages || [];

      // Fetch details for each message
      const fullMessages = await Promise.all(
        messageList.map(async (msg: { id: string }) => {
          const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          return await msgRes.json();
        })
      );
      
      setMessages(fullMessages);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while fetching emails');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const handleLogin = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
      fetchEmails();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const getHeader = (message: GmailMessage, name: string) => {
    if (!message.payload || !message.payload.headers) return 'Unknown';
    const header = message.payload.headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : 'Unknown';
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden h-full">
      <header className="px-6 py-4 border-b border-border bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={onMenuClick}
            className="lg:hidden p-2 text-text-muted hover:bg-slate-100 rounded-lg active:scale-95"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-red-500" />
            <h1 className="font-extrabold text-slate-800 text-lg uppercase tracking-tight">Gmail Inbox</h1>
          </div>
        </div>
        
        {!needsAuth && (
          <button 
            onClick={fetchEmails}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700">
               <AlertCircle className="w-5 h-5" />
               <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {needsAuth ? ( // The user must explicitly re-grant the scopes if the token isn't in memory
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center">
               <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                 <Mail className="w-8 h-8 text-red-500" />
               </div>
               <h2 className="text-xl font-bold text-slate-800 mb-2">Connect Gmail</h2>
               <p className="text-sm text-slate-500 mb-6">Authorize Cognify to read and send emails on your behalf.</p>
               
               <button 
                 onClick={handleLogin} 
                 className="mx-auto flex items-center gap-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium px-4 py-3 rounded-xl transition-all shadow-sm"
               >
                 <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                   <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                   <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                   <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                   <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                   <path fill="none" d="M0 0h48v48H0z"></path>
                 </svg>
                 Sign in with Google
               </button>
            </div>
          ) : loading && messages.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-20 text-slate-400">
               <Loader2 className="w-8 h-8 animate-spin mb-4 text-red-500" />
               <p className="text-sm font-bold uppercase tracking-widest">Syncing Inbox...</p>
             </div>
          ) : (
            <div className="space-y-4">
              {messages.length === 0 ? (
                 <div className="text-center py-10">
                   <p className="text-slate-500 text-sm">No recent messages found.</p>
                 </div>
              ) : (
                 messages.map(msg => (
                   <div key={msg.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer">
                     <div className="flex items-start justify-between mb-2">
                       <h3 className="font-bold text-slate-900 truncate pr-4">{getHeader(msg, 'From')}</h3>
                       <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                         {formatDistanceToNow(parseInt(msg.internalDate), { addSuffix: true })}
                       </span>
                     </div>
                     <p className="text-sm font-bold text-slate-800 mb-1 truncate">{getHeader(msg, 'Subject')}</p>
                     <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.snippet }} />
                   </div>
                 ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
