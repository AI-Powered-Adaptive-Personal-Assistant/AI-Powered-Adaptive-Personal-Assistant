import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle, RefreshCw } from "lucide-react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  duration?: number;
  action?: ToastAction;
}

// Global helper to trigger toasts from any file (including non-component files)
export const toast = {
  show: (type: ToastItem["type"], message: string, title?: string, duration = 6000, action?: ToastAction) => {
    let fallbackTitle = "";
    switch (type) {
      case "success": fallbackTitle = "Success"; break;
      case "error": fallbackTitle = "API Error"; break;
      case "warning": fallbackTitle = "Warning"; break;
      case "info": fallbackTitle = "Information"; break;
    }
    const event = new CustomEvent("cognify-toast", {
      detail: {
        id: Math.random().toString(36).substring(2, 9),
        type,
        title: title || fallbackTitle,
        message,
        duration,
        action
      } as ToastItem
    });
    window.dispatchEvent(event);
  },
  success: (message: string, title?: string, duration?: number) => {
    toast.show("success", message, title, duration);
  },
  error: (message: string, title?: string, duration?: number, action?: ToastAction) => {
    toast.show("error", message, title, duration, action);
  },
  warning: (message: string, title?: string, duration?: number) => {
    toast.show("warning", message, title, duration);
  },
  info: (message: string, title?: string, duration?: number) => {
    toast.show("info", message, title, duration);
  }
};

interface ToastContainerProps {
  rtl?: boolean;
}

export function ToastContainer({ rtl = false }: ToastContainerProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleAddToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastItem>;
      const newToast = customEvent.detail;
      setToasts(prev => [...prev, newToast]);

      if (newToast.duration !== 0) {
        setTimeout(() => {
          removeToast(newToast.id);
        }, newToast.duration || 6000);
      }
    };

    window.addEventListener("cognify-toast", handleAddToast);
    return () => {
      window.removeEventListener("cognify-toast", handleAddToast);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div 
      className={`fixed top-4 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none px-4 ${
        rtl ? "left-0 sm:left-4" : "right-0 sm:right-4"
      }`}
      style={{ direction: rtl ? "rtl" : "ltr" }}
    >
      <AnimatePresence>
        {toasts.map(item => {
          let Icon = Info;
          let bgColor = "bg-white dark:bg-slate-900 border-blue-500 shadow-blue-500/10";
          let iconColor = "text-blue-500";
          let alertRing = "focus:ring-blue-500";

          switch (item.type) {
            case "success":
              Icon = CheckCircle2;
              bgColor = "bg-white dark:bg-slate-900 border-emerald-500 shadow-emerald-500/10";
              iconColor = "text-emerald-500";
              alertRing = "focus:ring-emerald-500";
              break;
            case "error":
              Icon = AlertCircle;
              bgColor = "bg-white dark:bg-slate-900 border-rose-500 shadow-rose-500/10";
              iconColor = "text-rose-500";
              alertRing = "focus:ring-rose-500";
              break;
            case "warning":
              Icon = AlertTriangle;
              bgColor = "bg-white dark:bg-slate-900 border-amber-500 shadow-amber-500/10";
              iconColor = "text-amber-500";
              alertRing = "focus:ring-amber-500";
              break;
          }

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className={`pointer-events-auto flex w-full border-l-4 rounded-xl shadow-xl p-4 transition-all duration-300 hover:shadow-2xl ${bgColor}`}
            >
              <div className="flex gap-3 w-full">
                <div className="flex-shrink-0 mt-0.5">
                  <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-text-main dark:text-slate-100 flex items-center gap-1.5">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs text-text-muted dark:text-slate-300 break-words leading-relaxed">
                    {item.message}
                  </p>

                  {item.action && (
                    <button
                      onClick={() => {
                        item.action?.onClick();
                        removeToast(item.id);
                      }}
                      className="mt-2.5 flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-text-main dark:text-slate-200 rounded-lg border border-border dark:border-slate-700 transition"
                    >
                      <RefreshCw className="h-3 w-3 animate-pulse" />
                      {item.action.label}
                    </button>
                  )}
                </div>

                <div className="flex-shrink-0">
                  <button
                    onClick={() => removeToast(item.id)}
                    className="p-1 rounded-full text-text-muted hover:text-text-main hover:bg-slate-100 dark:hover:bg-slate-800 transition focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-slate-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
