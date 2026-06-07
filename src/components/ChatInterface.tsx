import React, { useState, useRef, useEffect } from "react";
import { Message, UserProfile, Task } from "../types";
import { generateAdaptiveResponseStream, generateBenchmarkComparison, generateProactiveInsights } from "../services/gemini";
import { geminiService } from "../services/geminiService";
import { Send, Bot, User, Loader2, Sparkles, BrainCircuit, Paperclip, ImageIcon, FileText, X, Accessibility, Menu, Download, Mic, MicOff, RefreshCw, Volume2, ListTodo, Plus, Trash2, CheckCircle2, Circle, Scale, Lightbulb } from "lucide-react";
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from "motion/react";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { ref as firebaseStorageRef, uploadString, getDownloadURL } from "firebase/storage";
import { db, storage, handleFirestoreError, OperationType, cleanDataForFirestore } from "../lib/firebase";
import { getTranslation } from "../lib/translations";
import { toast } from "./Toast";

const cleanMessagesForFirestore = (newHistory: Message[]) => {
  return newHistory.map(m => {
    const item: any = {
      id: m.id,
      role: m.role,
      content: m.content || "",
      timestamp: m.timestamp
    };
    if (m.attachments !== undefined && m.attachments !== null) {
      item.attachments = m.attachments.map((a: any) => {
        const att: any = { name: a.name || "", type: a.type || "" };
        if (a.url !== undefined && a.url !== null) att.url = a.url;
        if (a.data !== undefined && a.data !== null) att.data = a.data;
        return att;
      });
    }
    if (m.comparisons !== undefined && m.comparisons !== null) {
      item.comparisons = m.comparisons.map((c: any) => ({
        modelName: c.modelName || "",
        content: c.content || ""
      }));
    }
    return item;
  });
};

interface ChatInterfaceProps {
  profile: UserProfile;
  onQuestionEvaluated: (score: number, lastMessageSnippet: string) => void;
  onMenuClick?: () => void;
  syncMessages?: (messages: Message[]) => void;
  externalMessage?: string;
  onStreamingUpdate?: (text: string) => void;
  isEmbedded?: boolean;
  onSTTStateChange?: (active: boolean) => void;
  setProfile?: (profile: UserProfile) => void;
}

export interface ChatInterfaceRef {
  toggleSTT: () => void;
}

const ChatInterface = React.forwardRef<ChatInterfaceRef, ChatInterfaceProps>(({ profile, onQuestionEvaluated, onMenuClick, syncMessages, externalMessage, onStreamingUpdate, isEmbedded, onSTTStateChange, setProfile }, ref) => {
  const activeThread = profile.chatThreads?.find(t => t.id === profile.activeThreadId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [showTasks, setShowTasks] = useState(false);
  const [newTaskInput, setNewTaskInput] = useState("");
  const [showInsights, setShowInsights] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  const currentThreadId = profile.activeThreadId || Date.now().toString();

  const ensureThreadExists = () => {
    if (!profile.activeThreadId) {
      const newThread = {
        id: currentThreadId,
        title: "New Chat",
        updatedAt: new Date().toISOString()
      };
      const updatedThreads = [...(profile.chatThreads || []), newThread];
      if (setProfile) {
        setProfile({
            ...profile,
            chatThreads: updatedThreads,
            activeThreadId: currentThreadId
        });
      } else {
        profile.chatThreads = updatedThreads;
        profile.activeThreadId = currentThreadId;
      }
      if (profile.uid) {
         setDoc(doc(db, `users/${profile.uid}`), cleanDataForFirestore({ 
           chatThreads: updatedThreads, 
           activeThreadId: currentThreadId 
         }), { merge: true });
      }
    }
  };

  const handleGenerateInsights = async () => {
    if (!profile.uid) return;
    ensureThreadExists();
    setIsGeneratingInsights(true);
    const result = await generateProactiveInsights(profile, messages);
    setInsights(result);
    setIsGeneratingInsights(false);
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.uid || !newTaskInput.trim()) return;
    ensureThreadExists();

    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      threadId: currentThreadId,
      content: newTaskInput.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };

    const updatedTasks = [...(profile.tasks || []), newTask];
    
    setDoc(doc(db, `users/${profile.uid}`), { tasks: updatedTasks }, { merge: true }).catch(err => {
      console.error("Error adding task", err);
    });
    
    setNewTaskInput("");
  };

  const handleToggleTask = (taskId: string) => {
    if (!profile.uid) return;
    const updatedTasks = (profile.tasks || []).map(t => 
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );
    setDoc(doc(db, `users/${profile.uid}`), { tasks: updatedTasks }, { merge: true }).catch(err => {
      console.error("Error toggling task", err);
    });
  };

  const handleDeleteTask = (taskId: string) => {
    if (!profile.uid) return;
    const updatedTasks = (profile.tasks || []).filter(t => t.id !== taskId);
    setDoc(doc(db, `users/${profile.uid}`), { tasks: updatedTasks }, { merge: true }).catch(err => {
      console.error("Error deleting task", err);
    });
  };

  const currentThreadTasks = (profile.tasks || []).filter(t => t.threadId === currentThreadId);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Handle external message injection
  useEffect(() => {
    if (externalMessage && !isLoading) {
      if (profile.accessibilityMode === 'Vocal-Deaf' || profile.accessibilityMode === 'Sign-Only') {
        handleSubmit(undefined, externalMessage);
      } else {
        setInput(externalMessage);
      }
    }
  }, [externalMessage]);

  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<{ name: string, type: string, data: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string, type: string, data: string } | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isReadingDocument, setIsReadingDocument] = useState(false);

  const handleSpeak = (m: Message) => {
    if (speakingMessageId === m.id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
    } else {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(m.id);
      
      const cleanText = m.content.replace(/\[Signs:.*?\]/g, '').replace(/[*+#_`~\[\]()]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      const hasArabic = /[\u0600-\u06FF]/.test(cleanText);
      const langMap: Record<string, string> = {
        'English': 'en-US',
        'Arabic': 'ar-SA',
        'Egyptian Ammiya': 'ar-EG',
        'French': 'fr-FR',
        'Spanish': 'es-ES',
        'German': 'de-DE',
        'Italian': 'it-IT',
        'Portuguese': 'pt-BR',
        'Russian': 'ru-RU',
        'Chinese': 'zh-CN',
        'Japanese': 'ja-JP'
      };
      
      if (hasArabic) {
        const isEgyptian = profile.language === 'Egyptian Ammiya' || 
                           cleanText.includes('يا باشا') || 
                           cleanText.includes('تمام') || 
                           cleanText.includes('ازيك');
        utterance.lang = isEgyptian ? 'ar-EG' : 'ar-SA';
      } else {
        utterance.lang = langMap[profile.language || 'English'] || 'en-US';
      }
      
      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const readDocument = async (file: {name: string, type: string, data: string}) => {
    if (isLoading || isReadingDocument) return;
    setIsReadingDocument(true);
    
    try {
      const prompt = `You are an accessibility auditor for the blind. 
      Task: Read and extract all important text and meaningful information from this document: "${file.name}".
      Style: Narrate it slowly and clearly as if reading it to a blind person. 
      Mirror the user's dialect (Standard Arabic, Egyptian Ammiya, or English).
      If it's an image, describe it in high detail. 
      If it's a PDF/Text, read the key chapters and paragraphs.
      Return the full narrated text.`;
      
      handleSubmit(undefined, prompt, [file]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsReadingDocument(false);
      setPreviewFile(null);
    }
  };

  // STT Logic
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    onSTTStateChange?.(isListening);
  }, [isListening, onSTTStateChange]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      const langMap: Record<string, string> = {
        'Arabic': 'ar-SA',
        'Egyptian Ammiya': 'ar-EG',
        'English': 'en-US',
        'French': 'fr-FR',
        'Spanish': 'es-ES',
        'German': 'de-DE'
      };
      recognition.lang = langMap[profile.language || 'English'] || 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = (event: any) => {
        let finalStr = '';
        let interimStr = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalStr += text;
          } else {
            interimStr += text;
          }
        }

        if (finalStr) {
          setInput(prev => {
            const newVal = (prev.trim() + " " + finalStr).trim();
            return newVal;
          });
          setInterimTranscript("");
        } else {
          setInterimTranscript(interimStr);
        }
      };

      recognitionRef.current = recognition;
    }
  }, [profile.language]);

  const toggleListening = () => {
    if (isListening) {
      const finalFullText = (input + (input && interimTranscript ? " " : "") + interimTranscript).trim();
      setInput(finalFullText);
      setInterimTranscript("");
      recognitionRef.current?.stop();
      if (finalFullText && profile.accessibilityMode === 'Visual') {
        const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
        const confirmMsg = isArabic ? "تم الإرسال: " + finalFullText : "Sent: " + finalFullText;
        const confirmUtterance = new SpeechSynthesisUtterance(confirmMsg);
        const langMap: Record<string, string> = {
          'English': 'en-US', 'Arabic': 'ar-SA', 'Egyptian Ammiya': 'ar-EG',
          'French': 'fr-FR', 'Spanish': 'es-ES', 'German': 'de-DE',
          'Italian': 'it-IT', 'Portuguese': 'pt-BR', 'Russian': 'ru-RU',
          'Chinese': 'zh-CN', 'Japanese': 'ja-JP'
        };
        confirmUtterance.lang = langMap[profile.language || 'English'] || 'en-US';
        window.speechSynthesis.speak(confirmUtterance);
      }
      if (finalFullText) {
        handleSubmit(undefined, finalFullText);
      }
    } else {
      setInterimTranscript("");
      recognitionRef.current?.start();
    }
  };

  React.useImperativeHandle(ref, () => ({
    toggleSTT: toggleListening
  }));

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Sync with active thread by fetching from subcollection
  useEffect(() => {
    if (!profile.uid || !profile.activeThreadId) {
      const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
      const welcomeMsg = isArabic 
        ? `كوجنيفي جاهز. كيف يمكنني مساعدتك في دراساتك في مجال ${profile.field} اليوم؟`
        : `Cognify Ready. How can I assist your ${profile.field} studies today?`;
        
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: welcomeMsg,
          timestamp: new Date().toISOString()
        }
      ]);
      return;
    }

    setMessagesLoading(true);
    const path = `users/${profile.uid}/threads/${profile.activeThreadId}`;
    
    const unsubscribe = onSnapshot(doc(db, path), (snapshot) => {
      if (snapshot.exists() && snapshot.data().messages?.length > 0) {
        const data = snapshot.data();
        const incomingMessages = data.messages as Message[] || [];
        setMessages(incomingMessages);
      } else {
        // If thread exists in metadata but no document, or no messages
        const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
        const welcomeMsg = isArabic 
          ? `كوجنيفي جاهز. كيف يمكنني مساعدتك في دراساتك في مجال ${profile.field} اليوم؟`
          : `Cognify Ready. How can I assist your ${profile.field} studies today?`;
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: welcomeMsg,
            timestamp: new Date().toISOString()
          }
        ]);
      }
      setMessagesLoading(false);
    }, (err) => {
      console.error("Error fetching messages:", err);
      setMessagesLoading(false);
    });

    return () => unsubscribe();
  }, [profile.uid, profile.activeThreadId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, streamingText, selectedFiles]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    if (!profile.uid) {
         alert("Please login first");
         return;
    }

    const newFiles: { name: string, type: string, data: string, url?: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Limit file size to 5MB to prevent memory crashes (System Sync Errors)
      if (file.size > 5 * 1024 * 1024) {
        alert(`الملف "${file.name}" كبير جداً، الحد الأقصى 5 ميجا.`);
        continue;
      }

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const dataStr = base64.split(',')[1];
      
      let downloadUrl = "";
      try {
        const storageRef = firebaseStorageRef(storage, `users/${profile.uid}/attachments/${Date.now()}_${file.name}`);
        await uploadString(storageRef, dataStr, 'base64', { contentType: file.type });
        downloadUrl = await getDownloadURL(storageRef);
      } catch (err) {
        console.error("Storage upload error", err);
      }

      newFiles.push({
        name: file.name,
        type: file.type,
        data: dataStr,
        url: downloadUrl
      });
    }
    setSelectedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input to allow adding same file if needed
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

  const handleSubmit = async (e?: React.FormEvent, directInput?: string, overrideAttachments?: { name: string, type: string, data: string }[]) => {
    if (e) e.preventDefault();
    const finalInput = directInput || input;
    const finalAttachments = overrideAttachments || selectedFiles;
    if ((!finalInput.trim() && finalAttachments.length === 0) || isLoading) return;

    const qualityScore = evaluateQuestionQuality(finalInput);
    
    let currentThreadId = profile.activeThreadId;
    let isCreatingNewThread = false;

    // Auto-create thread if it doesn't exist
    if (!currentThreadId) {
      currentThreadId = Date.now().toString();
      isCreatingNewThread = true;
      const suggestedTitle = finalInput.slice(0, 30) + (finalInput.length > 30 ? '...' : '');
      const newThread = {
        id: currentThreadId,
        title: suggestedTitle,
        updatedAt: new Date().toISOString()
      };
      
      const updatedThreads = [...(profile.chatThreads || []), newThread];
      if (setProfile) {
        setProfile({
            ...profile,
            chatThreads: updatedThreads,
            activeThreadId: currentThreadId
        });
      } else {
        profile.chatThreads = updatedThreads;
        profile.activeThreadId = currentThreadId;
      }
      
      // Persist the new thread creation immediately to the user document
      if (profile.uid) {
         setDoc(doc(db, `users/${profile.uid}`), cleanDataForFirestore({ 
           chatThreads: updatedThreads, 
           activeThreadId: currentThreadId 
         }), { merge: true });
      }
    } else if (
      activeThread &&
      finalInput.trim() &&
      activeThread.title === 'New Chat' &&
      messages.filter(m => m.id !== 'welcome' && m.role === 'user').length === 0
    ) {
      const suggestedTitle = finalInput.slice(0, 30) + (finalInput.length > 30 ? '...' : '');
      const updatedThreads = (profile.chatThreads || []).map(t => 
        t.id === activeThread.id ? { ...t, title: suggestedTitle } : t
      );
      
      if (setProfile) {
        setProfile({ ...profile, chatThreads: updatedThreads });
      } else {
        profile.chatThreads = updatedThreads; // Immediate local update
      }
      
      if (profile.uid) {
         setDoc(doc(db, `users/${profile.uid}`), cleanDataForFirestore({ chatThreads: updatedThreads }), { merge: true });
      }
    }

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: finalInput || "Analyzed attached media.",
      timestamp: new Date().toISOString(),
      attachments: finalAttachments
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    
    // Save locally to appropriate Firestore document
    if (profile.uid && currentThreadId) {
      const threadPath = `users/${profile.uid}/threads/${currentThreadId}`;
      const historyToSave = cleanMessagesForFirestore(newHistory);
      setDoc(doc(db, threadPath), { messages: historyToSave }, { merge: true }).catch(err => {
         handleFirestoreError(err, OperationType.UPDATE, threadPath);
      });
    }
    
    const submittedMessage = finalInput;
    setInput("");
    setIsLoading(true);
    setStreamingText("");
    const attachmentsToSubmit = [...finalAttachments];
    if (!overrideAttachments) setSelectedFiles([]);

    try {
      const stream = generateAdaptiveResponseStream(submittedMessage, profile, newHistory, attachmentsToSubmit);
      
      let lastText = "";
      let finalAttachments: any[] = [];
      
      for await (const chunk of stream) {
        if (chunk.text) {
          lastText = chunk.text;
          setStreamingText(lastText);
        }
        if (chunk.attachments) {
          finalAttachments = chunk.attachments;
        }
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: lastText,
        timestamp: new Date().toISOString(),
        attachments: finalAttachments
      };
      
      const updatedHistory = [...newHistory, assistantMessage];
      setMessages(updatedHistory);
      setStreamingText("");
      if (onStreamingUpdate) {
        // Trigger TTS directly with the finalized AI text
        onStreamingUpdate(""); // force reset
        setTimeout(() => onStreamingUpdate(lastText), 50);
      }

      // Final persistence
      if (profile.uid && currentThreadId) {
        const threadPath = `users/${profile.uid}/threads/${currentThreadId}`;
        const historyToSave = cleanMessagesForFirestore(updatedHistory);
        setDoc(doc(db, threadPath), { messages: historyToSave }, { merge: true }).catch(err => {
           handleFirestoreError(err, OperationType.UPDATE, threadPath);
        });
      }

      onQuestionEvaluated(qualityScore, lastText.slice(0, 100));
    } catch (error: any) {
      console.error(error);
      setMessages(messages);
      if (syncMessages) syncMessages(messages);

      const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
      toast.error(
        isArabic
          ? `عذراً، حدث خطأ أثناء الاتصال بالخادم: ${error.message || 'يرجى مراجعة حالة الاتصال وإعادة المحاولة'}`
          : `Sorry, an error occurred communicating with the server: ${error.message || 'Please verify connection and retry'}`,
        isArabic ? "فشل الاتصال بالذكاء الاصطناعي" : "AI Core Disconnection",
        8000,
        {
          label: isArabic ? "إعادة المحاولة" : "Retry Now",
          onClick: () => {
            handleSubmit(undefined, submittedMessage, attachmentsToSubmit);
          }
        }
      );
    } finally {
      setIsLoading(false);
      setStreamingText("");
    }
  };

  const [comparingId, setComparingId] = useState<string | null>(null);

  const handleCompareAI = async (message: Message) => {
    if (!profile.uid || !profile.activeThreadId) return;
    setComparingId(message.id);

    // Find the previous user message
    const messageIndex = messages.findIndex(m => m.id === message.id);
    let userPrompt = "Provide an optimal response.";
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userPrompt = messages[i].content;
        break;
      }
    }

    const comparisonText = await generateBenchmarkComparison(message.content, userPrompt, profile);
    
    const updatedMessages = messages.map(m => {
      if (m.id === message.id) {
        const existing = m.comparisons || [];
        return {
          ...m,
          comparisons: [...existing, { modelName: "ChatGPT Assessment", content: comparisonText }]
        };
      }
      return m;
    });

    setMessages(updatedMessages);
    setComparingId(null);

    const threadPath = `users/${profile.uid}/threads/${profile.activeThreadId}`;
    const historyToSave = cleanMessagesForFirestore(updatedMessages);
    setDoc(doc(db, threadPath), { messages: historyToSave }, { merge: true }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, threadPath);
    });
  };

  const handleDownload = (file: {name: string, type: string, data: string}) => {
    if (!file || !file.data) return;
    const link = document.createElement("a");
    link.href = `data:${file.type};base64,${file.data}`;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`flex-1 flex flex-col bg-bg-card overflow-hidden relative ${isEmbedded ? 'h-full' : 'h-[100dvh]'}`}>
      {/* File Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-10"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPreviewFile(null);
            }}
          >
            <div className="absolute top-10 right-10 flex gap-4">
              {previewFile.data && (
                <>
                  <button 
                    title="Narrate Document (Blind Accessibility)" 
                    onClick={() => readDocument(previewFile)} 
                    className="text-white hover:text-emerald-400 transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur border border-white/20 flex items-center gap-2 px-4"
                  >
                    <Volume2 className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Hear Content</span>
                  </button>
                  <button title="Download" onClick={() => handleDownload(previewFile)} className="text-white hover:text-primary transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur">
                    <Download className="w-8 h-8" />
                  </button>
                </>
              )}
              <button title="Close" onClick={() => setPreviewFile(null)} className="text-white hover:text-primary transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur">
                <X className="w-8 h-8" />
              </button>
            </div>
            {previewFile.type.startsWith('image/') ? (
              <img 
                src={`data:${previewFile.type};base64,${previewFile.data}`} 
                alt={previewFile.name} 
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              />
            ) : previewFile.type.startsWith('video/') ? (
              <video 
                src={`data:${previewFile.type};base64,${previewFile.data}`} 
                controls
                autoPlay
                className="max-w-full max-h-full shadow-2xl rounded-lg"
              />
            ) : (
              <div className="bg-white p-12 rounded-[40px] max-w-2xl w-full text-center space-y-6">
                <div className="relative inline-block">
                  <FileText className="w-20 h-20 text-primary mx-auto" />
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-primary/20 blur-xl rounded-full"
                  />
                </div>
                <h3 className="text-2xl font-black text-slate-900">{previewFile.name}</h3>
                <p className="text-slate-500 font-medium italic">Full AI analysis of document content is active. For blind users, tap "Hear Content" to have the AI narrate this document.</p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                   <button 
                    onClick={() => readDocument(previewFile)} 
                    disabled={isReadingDocument}
                    className="px-8 py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                   >
                     {isReadingDocument ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                     Narrate Document
                   </button>
                   <button onClick={() => setPreviewFile(null)} className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest">Close Preview</button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Info */}
      {!isEmbedded && (
        <div className="bg-bg-card border-b border-border h-[60px] px-4 md:px-8 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              onClick={onMenuClick}
              className="lg:hidden p-2 -ms-2 text-slate-500 hover:bg-slate-100 rounded-lg active:scale-95"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-primary tracking-tight">Cognify</span>
              <span className="text-sm md:text-lg font-light text-text-muted truncate max-w-[120px] md:max-w-xs">| {activeThread?.title || 'AI Session'}</span>
            </div>
            {profile.accessibilityMode !== 'None' && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-primary/5 text-primary border border-primary/10 rounded-full text-[10px] font-black uppercase tracking-wider">
                 <Accessibility className="w-3 h-3" /> {profile.accessibilityMode} Mode
              </div>
            )}
            {(profile.accessibilityMode === 'Vocal-Deaf' || profile.accessibilityMode === 'Sign-Only') && (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-wider animate-pulse">
                 <Sparkles className="w-3 h-3" /> Sign Interpretation Active
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => {
                setShowInsights(!showInsights);
                if (!insights && !showInsights) handleGenerateInsights();
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase transition-colors ${
                showInsights ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'bg-slate-100 text-amber-600 hover:bg-amber-50'
              }`}
            >
              <Lightbulb className={`w-4 h-4 ${showInsights ? 'text-white' : 'text-amber-500'}`} />
              <span className="hidden sm:inline">{getTranslation(profile.language, 'insights')}</span>
            </button>
            
            <button 
              onClick={() => setShowTasks(!showTasks)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase transition-colors ${
                showTasks ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ListTodo className="w-4 h-4" />
              <span className="hidden sm:inline">{getTranslation(profile.language, 'tasks')}</span>
              {currentThreadTasks.length > 0 && (
                <span className="bg-white/20 px-1.5 rounded-md">{currentThreadTasks.length}</span>
              )}
            </button>
            <span className="hidden sm:flex text-[11px] font-bold uppercase py-1 px-3 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 items-center gap-2">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              AI Assistant v1.5
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex flex-1 overflow-hidden relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 flex flex-col items-center custom-scrollbar">
        {messagesLoading && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
             <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="w-full max-w-3xl space-y-10">
          <AnimatePresence mode="popLayout">
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={`flex flex-col w-full group ${
                  profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya'
                    ? (m.role === 'user' ? 'items-start text-start' : 'items-end text-end')
                    : (m.role === 'user' ? 'items-end text-end' : 'items-start text-start')
                }`}
              >
                {m.role === 'user' ? (
                  <div className="space-y-4 max-w-[90%] md:max-w-[80%]">
                    <div className={`${
                      profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya' ? 'border-e-4' : 'border-s-4'
                    } bg-[#f1f5f9] p-6 rounded-xl border-primary italic text-text-main shadow-sm flex flex-col gap-2`}>
                       {m.content.split('\n').map((line, i) => {
                          if (line.match(/^\[Signs:\s(.+)\]$/)) {
                            const signsMatch = line.match(/^\[Signs:\s(.+)\]$/);
                            return (
                               <div key={i} className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-200/60 not-italic">
                                 <span className="text-3xl bg-white border border-slate-100 p-2 rounded-xl inline-flex w-max shadow-sm">{signsMatch![1]}</span>
                               </div>
                            );
                          }
                          return <span key={i}>"{line}"</span>;
                       })}
                    </div>
                    {m.attachments?.length ? m.attachments.map((file, idx) => (
                      <div key={`${m.id}-att-${idx}`} className="relative group max-w-sm">
                        <button 
                          onClick={() => file.data && setPreviewFile(file)}
                          className={`w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl transition-all ${file.data ? 'hover:border-primary hover:shadow-md cursor-pointer' : 'opacity-80 cursor-default'}`}
                        >
                           {!file.data ? (
                             <div className="w-10 h-10 shrink-0 rounded-lg bg-orange-50 flex items-center justify-center border border-orange-100">
                               <FileText className="w-4 h-4 text-orange-400" />
                             </div>
                           ) : file.type.startsWith('image/') ? (
                             <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                               <img src={`data:${file.type};base64,${file.data}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                             </div>
                           ) : file.type.startsWith('video/') ? (
                             <div className="w-10 h-10 shrink-0 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-200 overflow-hidden relative">
                               <video src={`data:${file.type};base64,${file.data}`} className="w-full h-full object-cover opacity-50" />
                               <div className="absolute inset-0 flex items-center justify-center">
                                 <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-white border-b-[4px] border-b-transparent ml-0.5"></div>
                               </div>
                             </div>
                           ) : (
                             <div className="w-10 h-10 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center">
                               <FileText className="w-5 h-5 text-primary" />
                             </div>
                           )}
                           <div className="text-left flex-1 min-w-0">
                             <p className="text-xs font-bold text-slate-700 truncate w-full">{file.name}</p>
                             <p className={`text-[10px] font-bold uppercase tracking-widest ${file.data ? 'text-slate-400' : 'text-orange-400'}`}>
                               {file.data ? 'Click to View' : 'Media Expired'}
                             </p>
                           </div>
                        </button>
                        {file.data && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                readDocument(file);
                              }}
                              className="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white p-2 rounded-full transition-all"
                              title={getTranslation(profile.language, 'hearContent')}
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(file);
                              }}
                              className="bg-slate-100 hover:bg-primary hover:text-white p-2 rounded-full text-slate-500 transition-all"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )) : null}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border shadow-sm ${
                        evaluateQuestionQuality(m.content) >= 8 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        evaluateQuestionQuality(m.content) >= 5 ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        'bg-slate-50 text-slate-500 border-slate-100'
                      }`}>
                        {evaluateQuestionQuality(m.content) >= 8 ? getTranslation(profile.language, 'excellentQuestion') :
                         evaluateQuestionQuality(m.content) >= 5 ? getTranslation(profile.language, 'goodQuestion') : getTranslation(profile.language, 'basicQuestion')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-[90%] md:max-w-[85%]">
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                        profile.level === 'Advanced' ? 'bg-purple-100 text-purple-800' :
                        profile.level === 'Intermediate' ? 'bg-blue-100 text-blue-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {getTranslation(profile.language, 'difficultyLevel')}: {profile.level} ({profile.role})
                      </span>
                      {('speechSynthesis' in window) && (
                        <button 
                          onClick={() => handleSpeak(m)}
                          className={`text-[10px] font-bold uppercase transition-colors px-2 py-0.5 rounded border flex items-center gap-1.5 ${speakingMessageId === m.id ? 'bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100' : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'}`}
                        >
                          {speakingMessageId === m.id ? (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                              {profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya' ? 'إيقاف' : 'Stop'}
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                              {profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya' ? 'استماع' : 'Speak'}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="relative p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100/80 dark:border-slate-800 text-text-main leading-relaxed adaptive-response text-base space-y-4 shadow-sm w-full group/bubble">
                      {('speechSynthesis' in window) && (
                        <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-100/60 dark:border-slate-800">
                          <div className="flex items-center gap-1.5 opacity-60">
                            <Bot className="w-4 h-4 text-primary" />
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              {profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya' ? 'إجابة كوجنيفي الذكية' : 'Cognify Guidance'}
                            </span>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSpeak(m);
                            }}
                            className={`px-2.5 py-1 rounded-lg border text-[10px] font-black transition-all flex items-center gap-1.5 ${
                              speakingMessageId === m.id
                                ? 'bg-rose-500 text-white border-rose-500 shadow-sm animate-pulse'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-slate-200/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
                            }`}
                            aria-label={speakingMessageId === m.id ? "Stop Reading" : "Read Aloud"}
                          >
                            <Volume2 className="w-3.5 h-3.5 animate-bounce" />
                            <span>{speakingMessageId === m.id ? (profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya' ? 'إيقاف' : 'Stop') : (profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya' ? 'استماع بصوت عالٍ' : 'Read Aloud')}</span>
                          </button>
                        </div>
                      )}
                      {(profile.accessibilityMode === 'Vocal-Deaf' || profile.accessibilityMode === 'Sign-Only') && (
                        <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                           <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                              <Bot className="w-6 h-6 text-primary relative z-10" />
                              <motion.div 
                                animate={{ 
                                  scale: [1, 1.5, 1],
                                  opacity: [0.1, 0.3, 0.1]
                                }}
                                transition={{ repeat: Infinity, duration: 2 }}
                                className="absolute inset-0 bg-primary"
                              />
                           </div>
                           <div>
                             <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Visual Sign Translation</p>
                             <p className="text-xs text-slate-500 font-medium italic">Translating response to sign language visuals...</p>
                           </div>
                           <motion.div 
                             animate={{ x: [0, 5, -5, 0], y: [0, -2, 2, 0] }}
                             transition={{ repeat: Infinity, duration: 3 }}
                             className="ml-auto"
                           >
                             <BrainCircuit className="w-6 h-6 text-emerald-400 opacity-50" />
                           </motion.div>
                        </div>
                      )}
                      {m.content.split('\n').map((line, i) => {
                        const lineKey = `${m.id}-line-${i}`;
                        if (line.startsWith('## ')) return <h2 key={lineKey} className="text-xl font-bold text-primary border-b-2 border-primary/5 pb-1 mb-2 pt-4">{line.replace('## ', '')}</h2>;
                        if (line.startsWith('* ')) return <li key={lineKey} className="ml-5 list-square marker:text-primary mb-1">{line.replace('* ', '')}</li>;
                        
                        if (line.match(/^\[Signs:\s(.+)\]$/)) {
                           const signsMatch = line.match(/^\[Signs:\s(.+)\]$/);
                           return (
                             <div key={lineKey} className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-200/60 not-italic">
                               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sign Translation</span>
                               <span className="text-3xl bg-slate-50 border border-slate-100 p-3 rounded-xl inline-flex w-max">{signsMatch![1]}</span>
                             </div>
                           );
                        }

                        return <p key={lineKey} className="mb-4">{line}</p>;
                      })}
                    </div>
                    
                    {/* Assistant Attachments (Generated Images/Videos) */}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-4 mt-6">
                        {m.attachments.map((file, idx) => (
                          <div key={`${m.id}-gen-att-${idx}`} className="relative group">
                            <button 
                              onClick={() => file.data && setPreviewFile(file)}
                              className={`flex flex-col items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl transition-all overflow-hidden ${file.data ? 'hover:border-primary hover:shadow-md cursor-pointer' : 'opacity-80 cursor-default'}`}                             >
                               {!file.data ? (
                                 <div className="w-48 h-48 rounded-lg bg-orange-50 flex items-center justify-center border border-orange-100 flex-col gap-2">
                                   <FileText className="w-10 h-10 text-orange-400" />
                                   <span className="text-[10px] font-bold text-orange-500 uppercase">Media Expired</span>
                                 </div>
                               ) : file.type.startsWith('image/') ? (
                                 <div className="w-48 h-48 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                                   <img src={`data:${file.type};base64,${file.data}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                 </div>
                               ) : file.type.startsWith('video/') ? (
                                 <div className="w-48 h-48 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-200 overflow-hidden relative">
                                   <video src={`data:${file.type};base64,${file.data}`} className="w-full h-full object-cover opacity-70" />
                                   <div className="absolute inset-0 flex items-center justify-center group-hover:scale-110 transition-transform">
                                     <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[15px] border-l-white border-b-[10px] border-b-transparent ml-1 drop-shadow-lg"></div>
                                   </div>
                                 </div>
                               ) : null}
                               <div className="text-center w-full px-2">
                                 <p className="text-[10px] font-bold text-slate-700 truncate w-full">{file.name}</p>
                                 <p className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${file.data ? 'text-slate-400' : 'text-orange-400'}`}>
                                   {file.data ? 'Click to Enlarge' : 'Media Removed (Size Limit)'}
                                 </p>
                               </div>
                            </button>
                            {file.data && (
                              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    readDocument(file);
                                  }}
                                  className="bg-emerald-500/80 hover:bg-emerald-600 text-white p-2 rounded-full backdrop-blur-sm transition-all"
                                  title="Hear Content"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(file);
                                  }}
                                  className="bg-black/60 hover:bg-black p-2 rounded-full text-white backdrop-blur-sm transition-all"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Benchmark comparisons */}
                    {m.comparisons && m.comparisons.map((comp, idx) => (
                      <div key={idx} className="mt-6 p-6 bg-slate-900 text-slate-200 rounded-2xl border border-slate-700 shadow-xl">
                        <div className="flex items-center gap-3 mb-4 border-b border-slate-700 pb-4">
                          <Scale className="w-5 h-5 text-indigo-400" />
                          <h4 className="font-bold text-white tracking-widest uppercase text-xs">{comp.modelName}</h4>
                        </div>
                        <div className="space-y-3 text-sm opacity-90 font-mono leading-relaxed">
                          {comp.content.split('\n').map((line, lidx) => (
                            <p key={lidx}>{line}</p>
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className="mt-4 flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleCompareAI(m)}
                        disabled={comparingId === m.id}
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-transparent hover:border-indigo-100 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {comparingId === m.id ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Benchmarking...</>
                        ) : (
                          <><Scale className="w-3.5 h-3.5" /> Benchmark vs ChatGPT</>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              key="streaming-block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3">
                <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                  profile.level === 'Advanced' ? 'bg-purple-100 text-purple-800' :
                  profile.level === 'Intermediate' ? 'bg-blue-100 text-blue-800' :
                  'bg-orange-100 text-orange-800'
                }`}>
                  Level: {profile.level} ({profile.role})
                </span>
              </div>
              
              {streamingText ? (
                <div className="text-text-main leading-relaxed adaptive-response text-base space-y-4">
                  {streamingText.split('\n').map((line, i) => {
                    const lineKey = `streaming-line-${i}`;
                    if (line.startsWith('## ')) return <h2 key={lineKey} className="text-xl font-bold text-primary border-b-2 border-primary/5 pb-1 mb-2 pt-4">{line.replace('## ', '')}</h2>;
                    if (line.startsWith('* ')) return <li key={lineKey} className="ml-5 list-square marker:text-primary mb-1">{line.replace('* ', '')}</li>;
                    
                    if (line.match(/^\[Signs:\s(.+)\]$/)) {
                       const signsMatch = line.match(/^\[Signs:\s(.+)\]$/);
                       return (
                         <div key={lineKey} className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-200/60 not-italic">
                           <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sign Translation</span>
                           <span className="text-3xl bg-slate-50 border border-slate-100 p-3 rounded-xl inline-flex w-max">{signsMatch![1]}</span>
                         </div>
                       );
                    }

                    return <p key={lineKey} className="mb-4">{line}</p>;
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-6 bg-bg-main rounded-xl border border-border italic text-text-muted">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>{getTranslation(profile.language, 'analyzing')}</span>
                </div>
              )}
            </motion.div>
          )}
          </div>
        )}
        </div>

        {/* Task Panel */}
        <AnimatePresence>
          {showTasks && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isEmbedded ? '100%' : (window.innerWidth < 768 ? '100%' : 320), opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              style={{ right: 0, top: 0, bottom: 0, zIndex: 40 }}
              className={`bg-slate-50 border-s border-border overflow-y-auto flex flex-col shadow-xl shrink-0 ${isEmbedded ? 'absolute' : 'absolute md:relative'}`}
            >
              <div className="p-4 border-b border-border bg-white flex justify-between items-center shrink-0">
                <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                  <ListTodo className="w-5 h-5 text-primary" /> Thread Tasks
                </h3>
                <button onClick={() => setShowTasks(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                <form onSubmit={handleAddTask} className="flex gap-2">
                  <input
                    type="text"
                    value={newTaskInput}
                    onChange={(e) => setNewTaskInput(e.target.value)}
                    placeholder="New task..."
                    className="flex-1 bg-white border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary shadow-sm"
                  />
                  <button type="submit" disabled={!newTaskInput.trim()} className="bg-primary hover:bg-blue-700 text-white p-2 rounded-lg disabled:opacity-50 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                  </button>
                </form>
                <div className="space-y-2">
                  {currentThreadTasks.length === 0 ? (
                     <div className="text-center p-6 text-slate-400 italic text-sm border-2 border-dashed border-slate-200 rounded-xl">
                       No tasks for this thread yet.
                     </div>
                  ) : (
                    currentThreadTasks.map(task => (
                      <div key={task.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${task.completed ? 'bg-slate-100 border-transparent opacity-60' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <button onClick={() => handleToggleTask(task.id)} className={`mt-0.5 shrink-0 transition-colors ${task.completed ? 'text-emerald-500' : 'text-slate-400 hover:text-primary'}`}>
                          {task.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                        </button>
                        <p className={`flex-1 text-sm ${task.completed ? 'line-through text-slate-500' : 'text-slate-700 font-medium'}`}>
                          {task.content}
                        </p>
                        <button onClick={() => handleDeleteTask(task.id)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Insights Panel */}
        <AnimatePresence>
          {showInsights && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isEmbedded ? '100%' : (window.innerWidth < 768 ? '100%' : 340), opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              style={{ right: 0, top: 0, bottom: 0, zIndex: 40 }}
              className={`bg-amber-50 border-s border-amber-200 overflow-y-auto flex flex-col shadow-xl shrink-0 ${isEmbedded ? 'absolute' : 'absolute md:relative'}`}
            >
              <div className="p-4 border-b border-amber-200 bg-amber-100/50 flex justify-between items-center shrink-0">
                <h3 className="font-extrabold text-amber-900 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-600" /> {getTranslation(profile.language, 'proactiveInsights')}
                </h3>
                <button onClick={() => setShowInsights(false)} className="p-1 hover:bg-amber-200/50 rounded-lg text-amber-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar text-amber-950">
                {isGeneratingInsights ? (
                  <div className="flex flex-col items-center justify-center p-8 text-amber-600 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-sm font-medium text-amber-800">Analyzing thread & profile...</span>
                  </div>
                ) : (
                  <>
                    <div className="prose prose-base prose-slate max-w-none leading-relaxed p-6 rounded-2xl shadow-xl text-slate-900 border-2 border-amber-400 bg-white" style={{ boxShadow: '0 10px 25px -5px rgba(251, 191, 36, 0.2)' }}>
                      {insights ? (
                        <div className="markdown-body font-medium">
                          <Markdown>{insights}</Markdown>
                        </div>
                      ) : (
                        <span className="text-slate-800 font-bold tracking-tight">Click refresh to generate new insights.</span>
                      )}
                    </div>
                    
                    <button 
                      onClick={handleGenerateInsights}
                      className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-colors shadow-md shadow-amber-500/20"
                    >
                      <RefreshCw className="w-4 h-4" /> {getTranslation(profile.language, 'regenerateInsights')}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
              accept="image/*,video/mp4,video/webm,video/quicktime,application/pdf,.doc,.docx,.txt"
            />
            
            <div className="relative w-full">
              <div className="absolute start-4 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                 <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-50"
                 >
                   <Paperclip className="w-5 h-5" />
                 </button>
                 
                 <button
                   type="button"
                   onClick={toggleListening}
                   className={`p-2 transition-colors rounded-lg ${
                     isListening ? 'text-rose-500 bg-rose-50 hover:bg-rose-100 animate-pulse' : 'text-slate-400 hover:text-primary hover:bg-slate-50'
                   }`}
                   title={isListening ? "Listening... (Tap to stop and send)" : "Tap to Speak (Real-time Live Caption)"}
                 >
                   {isListening ? (
                     <MicOff className="w-5 h-5" />
                   ) : (
                     <Mic className="w-5 h-5" />
                   )}
                 </button>
              </div>

              <input
                type="text"
                value={input + (interimTranscript ? (input ? " " : "") + interimTranscript : "")}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                placeholder={isListening ? (profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya' ? 'جاري الاستماع...' : "Listening...") : getTranslation(profile.language, 'typeMessage')}
                className={`w-full bg-white border border-border rounded-2xl ps-24 py-4 pe-14 shadow-md focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all placeholder:text-text-muted/50 disabled:opacity-50 relative z-0 ${isListening ? 'border-primary outline-primary ring-4 ring-primary/5' : ''}`}
              />
              {interimTranscript && (
                <div className="absolute end-14 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                  <span className="flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                </div>
              )}
              <button
                type="submit"
                disabled={(!input.trim() && selectedFiles.length === 0) || isLoading}
                className="absolute end-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary text-white rounded-lg flex items-center justify-center hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-md active:scale-95 z-10"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
});

export default ChatInterface;
