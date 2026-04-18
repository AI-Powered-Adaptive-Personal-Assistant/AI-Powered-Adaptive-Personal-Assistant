import React, { useState, useRef, useEffect } from "react";
import { Message, UserProfile } from "../types";
import { generateAdaptiveResponse } from "../services/gemini";
import { Send, Bot, User, Loader2, Sparkles, BrainCircuit, Paperclip, Image as ImageIcon, FileText, X, Accessibility, Menu } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ChatInterfaceProps {
  profile: UserProfile;
  onQuestionEvaluated: (score: number, updatedHistory: Message[]) => void;
  onMenuClick?: () => void;
  syncMessages?: (messages: Message[]) => void;
}

export default function ChatInterface({ profile, onQuestionEvaluated, onMenuClick, syncMessages }: ChatInterfaceProps) {
  const activeThread = profile.chatThreads?.find(t => t.id === profile.activeThreadId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<{ name: string, type: string, data: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string, type: string, data: string } | null>(null);

  // Sync with active thread
  useEffect(() => {
    if (activeThread) {
      setMessages(activeThread.messages);
    } else {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `AI Assistant Ready. How can I assist your ${profile.field} studies today?`,
          timestamp: new Date().toISOString()
        }
      ]);
    }
  }, [profile.activeThreadId, activeThread?.messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, selectedFiles]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: { name: string, type: string, data: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newFiles.push({
        name: file.name,
        type: file.type,
        data: base64.split(',')[1] // Just the bytes
      });
    }
    setSelectedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const evaluateQuestionQuality = (text: string): number => {
    const length = text.length;
    let score = 3; 

    // Logic for Arabic and English complexity
    const isArabic = /[\u0600-\u06FF]/.test(text);
    const wordCount = text.split(/\s+/).length;

    if (length > 30) score += 1;
    if (length > 60) score += 2;
    if (wordCount > 5) score += 1;
    if (wordCount > 15) score += 2;

    const analyticalTerms = ['how', 'why', 'analyze', 'compare', 'evaluate', 'كيف', 'لماذا', 'حلل', 'قارن', 'قيم'];
    if (analyticalTerms.some(term => text.toLowerCase().includes(term))) {
      score += 3;
    }
    
    return Math.min(10, score);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && selectedFiles.length === 0) || isLoading) return;

    const qualityScore = evaluateQuestionQuality(input);
    
    // Auto-title thread if it's new
    if (activeThread && activeThread.messages.length === 0 && input.trim()) {
      const suggestedTitle = input.slice(0, 30) + (input.length > 30 ? '...' : '');
      const updatedThreads = (profile.chatThreads || []).map(t => 
        t.id === activeThread.id ? { ...t, title: suggestedTitle } : t
      );
      profile.chatThreads = updatedThreads; // Immediate local update
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input || "Analyzed attached media.",
      timestamp: new Date().toISOString(),
      attachments: selectedFiles
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    if (syncMessages) {
      syncMessages(newHistory);
    }
    
    setInput("");
    setIsLoading(true);
    const attachmentsToSubmit = [...selectedFiles];
    setSelectedFiles([]);

    try {
      const response = await generateAdaptiveResponse(input, profile, attachmentsToSubmit);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response || "AI communication error. Please try again.",
        timestamp: new Date().toISOString()
      };
      
      const updatedHistory = [...newHistory, assistantMessage];
      setMessages(updatedHistory);
      onQuestionEvaluated(qualityScore, updatedHistory);
    } catch (error) {
      console.error(error);
      // rollback history visually
      setMessages(messages);
      if (syncMessages) syncMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-bg-card overflow-hidden relative">
      {/* File Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-10"
            onClick={() => setPreviewFile(null)}
          >
            <button className="absolute top-10 right-10 text-white hover:text-primary transition-colors">
              <X className="w-10 h-10" />
            </button>
            {previewFile.type.startsWith('image/') ? (
              <img 
                src={`data:${previewFile.type};base64,${previewFile.data}`} 
                alt={previewFile.name} 
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              />
            ) : (
              <div className="bg-white p-12 rounded-[40px] max-w-2xl w-full text-center space-y-6">
                <FileText className="w-20 h-20 text-primary mx-auto" />
                <h3 className="text-2xl font-black text-slate-900">{previewFile.name}</h3>
                <p className="text-slate-500 font-medium italic">Full AI analysis of document content is active. Refer to AI-LA for deep insights.</p>
                <button className="px-8 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest">Close Preview</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Info */}
      <div className="bg-bg-card border-b border-border h-[60px] px-4 md:px-8 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg active:scale-95"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-primary tracking-tight">AI-LA</span>
            <span className="text-sm md:text-lg font-light text-text-muted truncate max-w-[120px] md:max-w-xs">| {activeThread?.title || 'AI Session'}</span>
          </div>
          {profile.accessibilityMode !== 'None' && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-primary/5 text-primary border border-primary/10 rounded-full text-[10px] font-black uppercase tracking-wider">
               <Accessibility className="w-3 h-3" /> {profile.accessibilityMode} Mode
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:flex text-[11px] font-bold uppercase py-1 px-3 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            AI Assistant v1.5
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 flex flex-col items-center custom-scrollbar">
        <div className="w-full max-w-3xl space-y-10">
          <AnimatePresence mode="popLayout">
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={`flex flex-col w-full`}
              >
                {m.role === 'user' ? (
                  <div className="space-y-4">
                    <div className="bg-[#f1f5f9] p-6 rounded-xl border-l-4 border-primary italic text-text-main shadow-sm">
                      "{m.content}"
                    </div>
                    {m.attachments?.map((file, idx) => (
                      <button 
                        key={idx} 
                        onClick={() => setPreviewFile(file)}
                        className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl max-w-sm hover:border-primary hover:shadow-md transition-all group"
                      >
                         {file.type.startsWith('image/') ? (
                           <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                             <img src={`data:${file.type};base64,${file.data}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                           </div>
                         ) : (
                           <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                             <FileText className="w-5 h-5 text-primary" />
                           </div>
                         )}
                         <div className="text-left">
                           <p className="text-xs font-bold text-slate-700 truncate w-32">{file.name}</p>
                           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Click to View</p>
                         </div>
                      </button>
                    ))}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border shadow-sm ${
                        evaluateQuestionQuality(m.content) >= 8 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        evaluateQuestionQuality(m.content) >= 5 ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        'bg-slate-50 text-slate-500 border-slate-100'
                      }`}>
                        {evaluateQuestionQuality(m.content) >= 8 ? 'Excellent Question' :
                         evaluateQuestionQuality(m.content) >= 5 ? 'Good Question' : 'Basic Question'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                        profile.level === 'Advanced' ? 'bg-purple-100 text-purple-800' :
                        profile.level === 'Intermediate' ? 'bg-blue-100 text-blue-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        Level: {profile.level} ({profile.role})
                      </span>
                    </div>
                    <div className="text-text-main leading-relaxed adaptive-response text-base space-y-4">
                      {m.content.split('\n').map((line, i) => {
                        if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold text-primary border-b-2 border-primary/5 pb-1 mb-2 pt-4">{line.replace('## ', '')}</h2>;
                        if (line.startsWith('* ')) return <li key={i} className="ml-5 list-square marker:text-primary mb-1">{line.replace('* ', '')}</li>;
                        return <p key={i} className="mb-4">{line}</p>;
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 p-6 bg-bg-main rounded-xl border border-border italic text-text-muted"
            >
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Analyzing and typing response...</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 md:p-8 border-t border-border bg-bg-main relative shadow-[0_-10px_20px_-15px_rgba(0,0,0,0.05)]">
        <div className="max-w-3xl mx-auto space-y-4">
          <AnimatePresence>
            {selectedFiles.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-wrap gap-2 mb-2"
              >
                {selectedFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 group">
                    <span className="text-[10px] font-bold text-slate-700 truncate max-w-[100px]">{file.name}</span>
                    <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-rose-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          
          <form onSubmit={handleSubmit} className="relative group">
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              multiple
              accept="image/*,application/pdf,.doc,.docx,.txt"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
               <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-50"
               >
                 <Paperclip className="w-4 h-4" />
               </button>
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              placeholder="Ask a question..."
              className="w-full bg-white border border-border rounded-2xl px-14 py-4 pr-14 shadow-md focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all placeholder:text-text-muted/50 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={(!input.trim() && selectedFiles.length === 0) || isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary text-white rounded-lg flex items-center justify-center hover:bg-blue-700 disabled:bg-border disabled:text-text-muted transition-all shadow-md active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
