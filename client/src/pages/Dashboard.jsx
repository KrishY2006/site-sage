import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Trash2, Loader2, Globe, Sparkles, FileText, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;
    async function loadProjects() {
      try {
        const data = await apiFetch('/api/projects', { token });
        if (!ignore) setProjects(data);
      } catch (err) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadProjects();
    return () => { ignore = true; };
  }, [token]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await apiFetch('/api/projects', {
        method: 'POST',
        body: { name: newName.trim() },
        token
      });
      setProjects(prev => [project, ...prev]);
      setNewName('');
      setShowNew(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this project?')) return;
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE', token });
      setProjects(prev => prev.filter(p => p._id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const fmt = (d) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const statusBadge = (s) => {
    const map = {
      idle: 'bg-slate-700 text-slate-300',
      ingesting: 'bg-indigo-900/60 text-indigo-300 animate-pulse',
      ready: 'bg-emerald-900/60 text-emerald-300',
      error: 'bg-rose-900/60 text-rose-300',
    };
    return map[s] || map.idle;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h1 className="text-lg font-bold tracking-tight">Site Sage</h1>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Projects</h2>
            <p className="text-slate-400 text-sm mt-1">
              Manage and chat with your ingested knowledge bases
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>

        {showNew && (
          <form
            onSubmit={handleCreate}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex gap-3 items-center"
          >
            <Globe className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              autoFocus
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowNew(false); setNewName(''); }}
              className="px-3 py-2 text-slate-400 hover:text-white text-sm transition"
            >
              Cancel
            </button>
          </form>
        )}

        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-sm rounded-lg flex justify-between items-center">
            {error}
            <button onClick={() => setError('')} className="text-rose-400 hover:text-rose-200 ml-4">
              dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 text-slate-500 space-y-3">
            <FileText className="w-12 h-12 mx-auto opacity-40" />
            <p className="text-lg font-medium">No projects yet</p>
            <p className="text-sm">Click "New Project" to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p._id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-100 truncate flex-1">{p.name}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusBadge(p.status)}`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" /> {p.pageCount || 0} pages
                    </span>
                    <span>{fmt(p.createdAt)}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-3 border-t border-slate-800/60">
                  <button
                    onClick={() => navigate(`/projects/${p._id}`)}
                    className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Open Chat
                  </button>
                  <button
                    onClick={() => handleDelete(p._id)}
                    className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition"
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
