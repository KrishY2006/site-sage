import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, Globe, Bot, User, Loader2, ArrowLeft, CheckCircle2, AlertCircle, Link2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

const WELCOME = { role: 'assistant', content: 'Hello! I am Site Sage. Paste a URL on the left to ingest knowledge, then ask me questions about your ingested sites.', sources: [] };

export default function ChatPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [url, setUrl] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const endRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const projects = await apiFetch('/api/projects', { token });
        setProject(projects.find(p => p._id === id) || null);
      } catch {}
    }
    load();
  }, [id, token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const statusBadge = (s) => {
    const map = {
      idle: { bg: 'bg-slate-800 text-slate-300', label: 'Idle' },
      ingesting: { bg: 'bg-indigo-900/60 text-indigo-300 animate-pulse', label: 'Ingesting...' },
      ready: { bg: 'bg-emerald-900/60 text-emerald-300', label: 'Ready' },
      error: { bg: 'bg-rose-900/60 text-rose-300', label: 'Error' }
    };
    return map[s] || map.idle;
  };

  const handleIngest = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setIngesting(true);
    setIngestStatus({ type: 'info', message: 'Scraping and vectorizing content... This may take a moment.' });
    try {
      const data = await apiFetch(`/api/projects/${id}/ingest`, { method: 'POST', body: { url }, token });
      setIngestStatus({ type: 'success', message: `Ingested ${data.pageCount} page(s) into ${data.chunkCount} searchable chunks.` });
      setProject(prev => prev ? { ...prev, pageCount: data.pageCount, status: data.status } : prev);
      setUrl('');
    } catch (err) {
      setIngestStatus({ type: 'error', message: err.message });
    } finally {
      setIngesting(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch(`http://localhost:4000/api/projects/${id}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question: text })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const answerRef = { current: '' };
      const sourcesRef = { current: [] };

      setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [] }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const payload = part.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) answerRef.current += parsed.text;
            if (parsed.done) sourcesRef.current = parsed.sources || [];
          } catch {}
        }

        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: answerRef.current, sources: [] };
          return next;
        });
      }

      const finalSources = sourcesRef.current;
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: answerRef.current, sources: finalSources };
        return next;
      });
    } catch (err) {
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: `Error: ${err.message}`, sources: [] };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between overflow-y-auto shrink-0">
        <div className="space-y-6">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h1 className="text-lg font-bold tracking-tight truncate">{project?.name || 'Loading...'}</h1>
            </div>
            {project && (
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className={`px-2 py-0.5 rounded-full font-medium ${statusBadge(project.status).bg}`}>
                  {statusBadge(project.status).label}
                </span>
                <span>{project.pageCount || 0} pages</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ingest Website</h2>
            <form onSubmit={handleIngest} className="space-y-2">
              <div className="relative">
                <Globe className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <button type="submit" disabled={ingesting} className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition">
                {ingesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                {ingesting ? 'Ingesting...' : 'Ingest Site'}
              </button>
            </form>

            {ingestStatus && (
              <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                ingestStatus.type === 'success' ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                  : ingestStatus.type === 'error' ? 'bg-rose-950/60 border border-rose-800 text-rose-300'
                  : 'bg-indigo-950/60 border border-indigo-800 text-indigo-300'
              }`}>
                {ingestStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                {ingestStatus.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                {ingestStatus.type === 'info' && <Loader2 className="w-4 h-4 shrink-0 animate-spin mt-0.5" />}
                <span>{ingestStatus.message}</span>
              </div>
            )}
          </div>
        </div>

        {project?.sourceUrls?.length > 0 && (
          <div className="mt-6 space-y-2">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Indexed Sources</h2>
            <ul className="space-y-1">
              {project.sourceUrls.map((u, i) => (
                <li key={i} className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                  <Link2 className="w-3 h-3 shrink-0" /> {u}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-indigo-400 border border-slate-700'
              }`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`p-4 rounded-2xl space-y-3 max-w-[75%] ${
                msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
              }`}>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
                {msg.sources?.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 text-xs">
                    <p className="text-slate-400 font-medium mb-1 flex items-center gap-1">
                      <Link2 className="w-3.5 h-3.5" /> Sources
                    </p>
                    <ul className="space-y-0.5">
                      {msg.sources.map((src, j) => (
                        <li key={j}>
                          <a href={src} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline truncate block">{src}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/30">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto relative flex items-center">
            <input
              type="text"
              placeholder="Ask anything about your ingested sites..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full pl-4 pr-12 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button type="submit" disabled={loading || !question.trim()} className="absolute right-2 p-2 text-slate-400 hover:text-white disabled:opacity-40 transition">
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
