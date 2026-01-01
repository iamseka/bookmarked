import React, { useState, useEffect } from 'react';
import { Upload, Search, Tag, FileText, Download, Trash2, RefreshCw, Sparkles, Filter, ArrowUpDown, Check, X, AlertCircle } from 'lucide-react';

export default function TwitterBookmarkManager() {
  const [bookmarks, setBookmarks] = useState([]);
  const [themes, setThemes] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
  const [sortBy, setSortBy] = useState('date');
  const [view, setView] = useState('dashboard');
  const [selectedBookmarks, setSelectedBookmarks] = useState(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('twitterBookmarks');
    if (saved) {
      const data = JSON.parse(saved);
      setBookmarks(data.bookmarks || []);
      setThemes(data.themes || []);
    }
  }, []);

  useEffect(() => {
    if (bookmarks.length > 0 || themes.length > 0) {
      localStorage.setItem('twitterBookmarks', JSON.stringify({ bookmarks, themes }));
    }
  }, [bookmarks, themes]);

  // IMPROVED: Batched AI Analysis
  const analyzeBookmarks = async (bookmarksToAnalyze) => {
    setIsAnalyzing(true);
    const BATCH_SIZE = 20; // Process 20 bookmarks at a time
    const batches = [];
    
    // Split into batches
    for (let i = 0; i < bookmarksToAnalyze.length; i += BATCH_SIZE) {
      batches.push(bookmarksToAnalyze.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`Processing ${bookmarksToAnalyze.length} bookmarks in ${batches.length} batches...`);
    setAnalysisProgress({ current: 0, total: batches.length });
    
    const allThemes = new Map();
    const analyzedBookmarks = [];
    
    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} bookmarks)...`);
        setAnalysisProgress({ current: i + 1, total: batches.length });
        
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 4000, // Increased from 1000
              messages: [{
                role: 'user',
                content: `Analyze these ${batch.length} Twitter bookmarks and categorize them into themes. For each bookmark, provide:
1. A theme/category (max 3 words)
2. A brief insight or key takeaway (1 sentence)
3. One actionable next step
4. Whether it's likely a thread (based on text patterns, ellipsis, numbering, "thread" mentions)

Return ONLY valid JSON in this exact format with no markdown, preamble, or explanation:
{
  "themes": [
    {
      "name": "Theme Name",
      "description": "Brief description",
      "color": "#hexcolor"
    }
  ],
  "bookmarks": [
    {
      "id": "original_id",
      "theme": "Theme Name",
      "insight": "Key takeaway",
      "action": "Next step",
      "isLikelyThread": true/false
    }
  ]
}

Bookmarks to analyze:
${JSON.stringify(batch.map(b => ({
  id: b.id,
  text: b.text?.substring(0, 280), // Truncate long tweets
  author: b.author,
  replies: b.engagement?.replies || '0'
})))}`
              }]
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`API Error (batch ${i + 1}):`, response.status, errorText);
            throw new Error(`API returned ${response.status}: ${errorText}`);
          }

          const data = await response.json();
          
          // Check for error in response
          if (data.error) {
            console.error(`API Error (batch ${i + 1}):`, data.error);
            throw new Error(data.error.message || 'API error');
          }
          
          const textContent = data.content?.find(item => item.type === 'text')?.text || '';
          
          if (!textContent) {
            console.error(`No text content in response for batch ${i + 1}`);
            continue;
          }
          
          // Clean and parse JSON
          const cleanJson = textContent.replace(/```json|```/g, '').trim();
          const analysis = JSON.parse(cleanJson);

          // Collect themes
          analysis.themes?.forEach(theme => {
            if (!allThemes.has(theme.name)) {
              allThemes.set(theme.name, theme);
            }
          });

          // Merge analyzed data with batch
          const updatedBatch = batch.map(bookmark => {
            const analyzed = analysis.bookmarks?.find(b => b.id === bookmark.id);
            return analyzed ? { ...bookmark, ...analyzed } : bookmark;
          });
          
          analyzedBookmarks.push(...updatedBatch);
          
          console.log(`✅ Batch ${i + 1}/${batches.length} complete`);
          
          // Small delay between batches to avoid rate limiting
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (batchError) {
          console.error(`Error processing batch ${i + 1}:`, batchError);
          // Continue with next batch even if one fails
          analyzedBookmarks.push(...batch); // Add unanalyzed bookmarks
        }
      }

      // Update bookmarks state
      setBookmarks(prev => {
        const existingIds = new Set(prev.map(b => b.id));
        const newBookmarks = analyzedBookmarks.filter(b => !existingIds.has(b.id));
        const updatedExisting = prev.map(existing => {
          const update = analyzedBookmarks.find(u => u.id === existing.id);
          return update || existing;
        });
        return [...updatedExisting, ...newBookmarks];
      });

      // Update themes
      setThemes(prev => {
        const existing = new Map(prev.map(t => [t.name, t]));
        allThemes.forEach((theme, name) => {
          if (!existing.has(name)) {
            existing.set(name, theme);
          }
        });
        return Array.from(existing.values());
      });

      console.log('✅ All batches processed!');
      alert(`Analysis complete! Processed ${analyzedBookmarks.length} bookmarks into ${allThemes.size} themes.`);

    } catch (error) {
      console.error('Analysis error:', error);
      alert(`Error analyzing bookmarks: ${error.message}\n\nCheck console for details. You may need to try again or reduce batch size.`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress({ current: 0, total: 0 });
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        setBookmarks(prev => {
          const existingIds = new Set(prev.map(b => b.id));
          const newBookmarks = data.filter(b => !existingIds.has(b.id));
          return [...prev, ...newBookmarks];
        });
        
        alert(`Successfully imported ${data.length} bookmarks!`);
      } catch (error) {
        alert('Error reading file. Please ensure it\'s valid JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handlePasteBookmarks = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text);
      
      setBookmarks(prev => {
        const existingIds = new Set(prev.map(b => b.id));
        const newBookmarks = data.filter(b => !existingIds.has(b.id));
        return [...prev, ...newBookmarks];
      });
      
      alert(`Successfully imported ${data.length} bookmarks!`);
    } catch (error) {
      alert('Error parsing clipboard data. Please ensure it\'s valid JSON.');
    }
  };

  const exportToJSON = () => {
    const dataStr = JSON.stringify({ bookmarks, themes }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bookmarks-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const exportToNewsletter = () => {
    const markdown = generateNewsletterContent();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `newsletter-content-${new Date().toISOString().split('T')[0]}.md`;
    link.click();
  };

  const generateNewsletterContent = () => {
    let content = `# Twitter Bookmarks Digest\n\n`;
    
    themes.forEach(theme => {
      const themeBookmarks = bookmarks.filter(b => b.theme === theme.name);
      if (themeBookmarks.length === 0) return;

      content += `## ${theme.name}\n\n`;
      content += `${theme.description}\n\n`;
      
      themeBookmarks.forEach(bookmark => {
        content += `### ${bookmark.author}\n`;
        content += `${bookmark.text}\n\n`;
        if (bookmark.insight) content += `**Key Insight:** ${bookmark.insight}\n\n`;
        if (bookmark.action) content += `**Action Step:** ${bookmark.action}\n\n`;
        if (bookmark.isLikelyThread) content += `🧵 *Likely a thread - check full conversation*\n\n`;
        content += `[View Tweet](${bookmark.url})\n\n`;
        content += `---\n\n`;
      });
    });

    return content;
  };

  const filteredBookmarks = bookmarks
    .filter(b => {
      const matchesSearch = searchQuery === '' || 
        b.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.author?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTheme = selectedTheme === 'all' || b.theme === selectedTheme;
      return matchesSearch && matchesTheme;
    })
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.date) - new Date(a.date);
      if (sortBy === 'author') return (a.author || '').localeCompare(b.author || '');
      if (sortBy === 'theme') return (a.theme || '').localeCompare(b.theme || '');
      return 0;
    });

  const handleSelectAll = () => {
    if (selectedBookmarks.size === filteredBookmarks.length) {
      setSelectedBookmarks(new Set());
    } else {
      setSelectedBookmarks(new Set(filteredBookmarks.map(b => b.id)));
    }
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedBookmarks.size} bookmarks?`)) return;
    setBookmarks(prev => prev.filter(b => !selectedBookmarks.has(b.id)));
    setSelectedBookmarks(new Set());
  };

  const handleBulkTag = async () => {
    const theme = prompt('Enter theme name for selected bookmarks:');
    if (!theme) return;
    
    setBookmarks(prev => prev.map(b => 
      selectedBookmarks.has(b.id) ? { ...b, theme } : b
    ));
    setSelectedBookmarks(new Set());
  };

  const stats = {
    total: bookmarks.length,
    themes: themes.length,
    analyzed: bookmarks.filter(b => b.insight).length,
    pending: bookmarks.filter(b => !b.insight).length,
    threads: bookmarks.filter(b => b.isLikelyThread).length
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#e8e8e8',
      fontFamily: '"Space Mono", "Courier New", monospace',
      padding: '0'
    }}>
      <header style={{
        background: 'rgba(15, 15, 30, 0.95)',
        backdropFilter: 'blur(10px)',
        borderBottom: '2px solid #00d9ff',
        padding: '1.5rem 2rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 4px 20px rgba(0, 217, 255, 0.1)'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '700',
              margin: 0,
              background: 'linear-gradient(135deg, #00d9ff 0%, #00ff88 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              📚 Bookmark Archive
            </h1>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <label style={{
                background: 'linear-gradient(135deg, #00d9ff 0%, #00ff88 100%)',
                color: '#0f0f1e',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 15px rgba(0, 217, 255, 0.3)'
              }}>
                <Upload size={18} />
                Upload JSON
                <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
              <button
                onClick={handlePasteBookmarks}
                style={{
                  background: 'rgba(0, 217, 255, 0.1)',
                  color: '#00d9ff',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  border: '2px solid #00d9ff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontFamily: 'inherit'
                }}>
                <FileText size={18} />
                Paste JSON
              </button>
            </div>
          </div>
          
          <nav style={{ display: 'flex', gap: '1rem', borderTop: '1px solid rgba(0, 217, 255, 0.2)', paddingTop: '1rem' }}>
            {['dashboard', 'bookmarks', 'themes'].map(tab => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                style={{
                  background: view === tab ? 'rgba(0, 217, 255, 0.2)' : 'transparent',
                  color: view === tab ? '#00d9ff' : '#888',
                  padding: '0.5rem 1.5rem',
                  borderRadius: '6px',
                  border: view === tab ? '2px solid #00d9ff' : '2px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  fontSize: '0.85rem'
                }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        {view === 'dashboard' && (
          <div>
            {/* Progress Bar */}
            {isAnalyzing && (
              <div style={{
                background: 'rgba(0, 217, 255, 0.1)',
                border: '2px solid #00d9ff',
                borderRadius: '12px',
                padding: '1.5rem',
                marginBottom: '2rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#00d9ff', fontWeight: '600' }}>
                    Analyzing... Batch {analysisProgress.current}/{analysisProgress.total}
                  </span>
                  <span style={{ color: '#888' }}>
                    {Math.round((analysisProgress.current / analysisProgress.total) * 100)}%
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: 'rgba(0, 217, 255, 0.2)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(analysisProgress.current / analysisProgress.total) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #00d9ff 0%, #00ff88 100%)',
                    transition: 'width 0.3s'
                  }} />
                </div>
                <p style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.5rem', marginBottom: 0 }}>
                  Processing 20 bookmarks per batch. This may take a few minutes...
                </p>
              </div>
            )}

            {/* Stats Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
              marginBottom: '2rem'
            }}>
              {[
                { label: 'Total Bookmarks', value: stats.total, icon: '📖', color: '#00d9ff' },
                { label: 'Themes Detected', value: stats.themes, icon: '🏷️', color: '#00ff88' },
                { label: 'Analyzed', value: stats.analyzed, icon: '✨', color: '#ff6b9d' },
                { label: 'Pending', value: stats.pending, icon: '⏳', color: '#ffd93d' },
                { label: 'Likely Threads', value: stats.threads, icon: '🧵', color: '#a78bfa' }
              ].map((stat, i) => (
                <div key={i} style={{
                  background: 'rgba(15, 15, 30, 0.6)',
                  border: `2px solid ${stat.color}`,
                  borderRadius: '12px',
                  padding: '1.5rem',
                  boxShadow: `0 4px 20px ${stat.color}33`
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700', color: stat.color, marginBottom: '0.25rem' }}>
                    {stat.value}
                  </div>
                  <div style={{ color: '#888', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div style={{
              background: 'rgba(15, 15, 30, 0.6)',
              border: '2px solid rgba(0, 217, 255, 0.3)',
              borderRadius: '12px',
              padding: '2rem',
              marginBottom: '2rem'
            }}>
              <h2 style={{
                fontSize: '1.5rem',
                marginBottom: '1.5rem',
                color: '#00d9ff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Sparkles size={24} />
                Quick Actions
              </h2>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => analyzeBookmarks(bookmarks.filter(b => !b.insight))}
                  disabled={isAnalyzing || stats.pending === 0}
                  style={{
                    background: 'linear-gradient(135deg, #ff6b9d 0%, #ff8fab 100%)',
                    color: '#fff',
                    padding: '1rem 2rem',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: isAnalyzing || stats.pending === 0 ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: isAnalyzing || stats.pending === 0 ? 0.5 : 1,
                    boxShadow: '0 4px 15px rgba(255, 107, 157, 0.3)'
                  }}>
                  {isAnalyzing ? <RefreshCw size={18} className="spinning" /> : <Sparkles size={18} />}
                  {isAnalyzing ? `Analyzing (${analysisProgress.current}/${analysisProgress.total})...` : `Analyze ${stats.pending} Bookmarks`}
                </button>
                <button
                  onClick={exportToJSON}
                  disabled={bookmarks.length === 0}
                  style={{
                    background: 'rgba(0, 217, 255, 0.1)',
                    color: '#00d9ff',
                    padding: '1rem 2rem',
                    borderRadius: '8px',
                    border: '2px solid #00d9ff',
                    cursor: bookmarks.length === 0 ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: bookmarks.length === 0 ? 0.5 : 1
                  }}>
                  <Download size={18} />
                  Export JSON
                </button>
                <button
                  onClick={exportToNewsletter}
                  disabled={bookmarks.length === 0}
                  style={{
                    background: 'rgba(0, 255, 136, 0.1)',
                    color: '#00ff88',
                    padding: '1rem 2rem',
                    borderRadius: '8px',
                    border: '2px solid #00ff88',
                    cursor: bookmarks.length === 0 ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: bookmarks.length === 0 ? 0.5 : 1
                  }}>
                  <FileText size={18} />
                  Export Newsletter
                </button>
              </div>
            </div>

            {/* Recent Bookmarks with Thread Indicator */}
            {bookmarks.length > 0 && (
              <div style={{
                background: 'rgba(15, 15, 30, 0.6)',
                border: '2px solid rgba(0, 217, 255, 0.3)',
                borderRadius: '12px',
                padding: '2rem'
              }}>
                <h2 style={{
                  fontSize: '1.5rem',
                  marginBottom: '1.5rem',
                  color: '#00d9ff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  Recent Bookmarks
                  <button
                    onClick={() => setView('bookmarks')}
                    style={{
                      background: 'transparent',
                      color: '#888',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem'
                    }}>
                    View All →
                  </button>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {bookmarks.slice(0, 5).map((bookmark, i) => (
                    <div key={i} style={{
                      background: 'rgba(0, 217, 255, 0.05)',
                      border: '1px solid rgba(0, 217, 255, 0.2)',
                      borderRadius: '8px',
                      padding: '1rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ color: '#00d9ff', fontWeight: '600' }}>@{bookmark.author}</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {bookmark.isLikelyThread && (
                            <span style={{
                              background: 'rgba(167, 139, 250, 0.2)',
                              color: '#a78bfa',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              border: '1px solid rgba(167, 139, 250, 0.3)'
                            }}>
                              🧵 THREAD
                            </span>
                          )}
                          {bookmark.theme && (
                            <span style={{
                              background: themes.find(t => t.name === bookmark.theme)?.color || '#00d9ff',
                              color: '#0f0f1e',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: '600'
                            }}>
                              {bookmark.theme}
                            </span>
                          )}
                        </div>
                      </div>
                      <p style={{ color: '#e8e8e8', margin: '0.5rem 0', lineHeight: '1.6' }}>
                        {bookmark.text?.substring(0, 150)}{bookmark.text?.length > 150 ? '...' : ''}
                      </p>
                      {bookmark.insight && (
                        <p style={{
                          color: '#00ff88',
                          fontSize: '0.9rem',
                          margin: '0.5rem 0 0 0',
                          fontStyle: 'italic'
                        }}>
                          💡 {bookmark.insight}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bookmarks View - Same as before but add thread indicators */}
        {view === 'bookmarks' && (
          <div>
            <div style={{
              background: 'rgba(15, 15, 30, 0.6)',
              border: '2px solid rgba(0, 217, 255, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '2rem',
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
              alignItems: 'center'
            }}>
              <div style={{ flex: '1', minWidth: '250px', position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
                <input
                  type="text"
                  placeholder="Search bookmarks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 3rem',
                    background: 'rgba(0, 217, 255, 0.05)',
                    border: '1px solid rgba(0, 217, 255, 0.3)',
                    borderRadius: '8px',
                    color: '#e8e8e8',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
              <select
                value={selectedTheme}
                onChange={(e) => setSelectedTheme(e.target.value)}
                style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(0, 217, 255, 0.05)',
                  border: '1px solid rgba(0, 217, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#e8e8e8',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  minWidth: '150px'
                }}>
                <option value="all">All Themes</option>
                {themes.map(theme => (
                  <option key={theme.name} value={theme.name}>{theme.name}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(0, 217, 255, 0.05)',
                  border: '1px solid rgba(0, 217, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#e8e8e8',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  minWidth: '120px'
                }}>
                <option value="date">Date</option>
                <option value="author">Author</option>
                <option value="theme">Theme</option>
              </select>
            </div>

            {selectedBookmarks.size > 0 && (
              <div style={{
                background: 'rgba(255, 107, 157, 0.1)',
                border: '2px solid #ff6b9d',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                marginBottom: '2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ color: '#ff6b9d', fontWeight: '600' }}>
                  {selectedBookmarks.size} selected
                </span>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={handleBulkTag}
                    style={{
                      background: 'rgba(0, 255, 136, 0.1)',
                      color: '#00ff88',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #00ff88',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                    <Tag size={16} />
                    Tag All
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    style={{
                      background: 'rgba(255, 107, 157, 0.1)',
                      color: '#ff6b9d',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #ff6b9d',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedBookmarks(new Set())}
                    style={{
                      background: 'transparent',
                      color: '#888',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #888',
                      cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}>
                    Clear
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredBookmarks.length > 0 ? (
                <>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0 0.5rem',
                    color: '#888',
                    fontSize: '0.9rem'
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedBookmarks.size === filteredBookmarks.length && filteredBookmarks.length > 0}
                        onChange={handleSelectAll}
                        style={{ cursor: 'pointer' }}
                      />
                      Select All
                    </label>
                    <span>{filteredBookmarks.length} bookmarks</span>
                  </div>
                  {filteredBookmarks.map((bookmark, i) => (
                    <div key={i} style={{
                      background: 'rgba(15, 15, 30, 0.6)',
                      border: selectedBookmarks.has(bookmark.id) ? '2px solid #ff6b9d' : '2px solid rgba(0, 217, 255, 0.2)',
                      borderRadius: '12px',
                      padding: '1.5rem'
                    }}>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedBookmarks.has(bookmark.id)}
                          onChange={() => {
                            const newSelected = new Set(selectedBookmarks);
                            if (newSelected.has(bookmark.id)) {
                              newSelected.delete(bookmark.id);
                            } else {
                              newSelected.add(bookmark.id);
                            }
                            setSelectedBookmarks(newSelected);
                          }}
                          style={{ cursor: 'pointer', marginTop: '0.25rem' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                              <span style={{ color: '#00d9ff', fontWeight: '600', fontSize: '1.1rem' }}>
                                @{bookmark.author}
                              </span>
                              {bookmark.isLikelyThread && (
                                <span style={{
                                  background: 'rgba(167, 139, 250, 0.2)',
                                  color: '#a78bfa',
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                  border: '1px solid rgba(167, 139, 250, 0.3)'
                                }}>
                                  🧵 THREAD
                                </span>
                              )}
                              {bookmark.theme && (
                                <span style={{
                                  background: themes.find(t => t.name === bookmark.theme)?.color || '#00d9ff',
                                  color: '#0f0f1e',
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem',
                                  fontWeight: '600'
                                }}>
                                  {bookmark.theme}
                                </span>
                              )}
                            </div>
                            <span style={{ color: '#888', fontSize: '0.85rem' }}>
                              {bookmark.date ? new Date(bookmark.date).toLocaleDateString() : ''}
                            </span>
                          </div>
                          <p style={{ color: '#e8e8e8', margin: '0.75rem 0', lineHeight: '1.6', fontSize: '1rem' }}>
                            {bookmark.text}
                          </p>
                          {bookmark.insight && (
                            <div style={{
                              background: 'rgba(0, 255, 136, 0.1)',
                              border: '1px solid rgba(0, 255, 136, 0.3)',
                              borderRadius: '6px',
                              padding: '0.75rem',
                              marginTop: '0.75rem'
                            }}>
                              <div style={{ color: '#00ff88', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                                💡 Key Insight
                              </div>
                              <p style={{ color: '#e8e8e8', margin: 0, fontSize: '0.95rem' }}>
                                {bookmark.insight}
                              </p>
                            </div>
                          )}
                          {bookmark.action && (
                            <div style={{
                              background: 'rgba(255, 211, 61, 0.1)',
                              border: '1px solid rgba(255, 211, 61, 0.3)',
                              borderRadius: '6px',
                              padding: '0.75rem',
                              marginTop: '0.75rem'
                            }}>
                              <div style={{ color: '#ffd93d', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                                ⚡ Action Step
                              </div>
                              <p style={{ color: '#e8e8e8', margin: 0, fontSize: '0.95rem' }}>
                                {bookmark.action}
                              </p>
                            </div>
                          )}
                          {bookmark.url && (
                            <a
                              href={bookmark.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-block',
                                marginTop: '0.75rem',
                                color: '#00d9ff',
                                textDecoration: 'none',
                                fontSize: '0.9rem'
                              }}>
                              View on Twitter →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{
                  background: 'rgba(15, 15, 30, 0.6)',
                  border: '2px dashed rgba(0, 217, 255, 0.3)',
                  borderRadius: '12px',
                  padding: '3rem',
                  textAlign: 'center',
                  color: '#888'
                }}>
                  <FileText size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '1.1rem', margin: 0 }}>
                    {bookmarks.length === 0 
                      ? 'No bookmarks yet. Upload or paste your Twitter bookmarks to get started!'
                      : 'No bookmarks match your filters.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'themes' && (
          <div>
            <div style={{
              background: 'rgba(15, 15, 30, 0.6)',
              border: '2px solid rgba(0, 217, 255, 0.3)',
              borderRadius: '12px',
              padding: '2rem'
            }}>
              <h2 style={{
                fontSize: '1.5rem',
                marginBottom: '1rem',
                color: '#00d9ff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Tag size={24} />
                Detected Themes
              </h2>
              <p style={{ color: '#888', marginBottom: '1.5rem' }}>
                AI has automatically categorized your bookmarks into these themes.
              </p>
              
              {themes.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                  {themes.map((theme, i) => {
                    const themeBookmarks = bookmarks.filter(b => b.theme === theme.name);
                    return (
                      <div key={i} style={{
                        background: 'rgba(15, 15, 30, 0.8)',
                        border: `2px solid ${theme.color}`,
                        borderRadius: '12px',
                        padding: '1.5rem',
                        boxShadow: `0 4px 20px ${theme.color}33`,
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        setSelectedTheme(theme.name);
                        setView('bookmarks');
                      }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          background: theme.color,
                          borderRadius: '8px',
                          marginBottom: '1rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem'
                        }}>
                          🏷️
                        </div>
                        <h3 style={{ color: theme.color, fontSize: '1.3rem', marginBottom: '0.5rem', fontWeight: '700' }}>
                          {theme.name}
                        </h3>
                        <p style={{ color: '#e8e8e8', fontSize: '0.95rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                          {theme.description}
                        </p>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingTop: '1rem',
                          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                          <span style={{ color: '#888', fontSize: '0.9rem' }}>
                            {themeBookmarks.length} bookmark{themeBookmarks.length !== 1 ? 's' : ''}
                          </span>
                          <span style={{ color: theme.color, fontSize: '0.9rem', fontWeight: '600' }}>
                            View →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  background: 'rgba(15, 15, 30, 0.6)',
                  border: '2px dashed rgba(0, 217, 255, 0.3)',
                  borderRadius: '12px',
                  padding: '3rem',
                  textAlign: 'center',
                  color: '#888'
                }}>
                  <Tag size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '1.1rem', margin: 0 }}>
                    No themes detected yet. Analyze your bookmarks to automatically generate themes.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
        
        ::-webkit-scrollbar {
          width: 10px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(15, 15, 30, 0.6);
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(0, 217, 255, 0.3);
          border-radius: 5px;
        }
        
        ::selection {
          background: rgba(0, 217, 255, 0.3);
          color: #fff;
        }
      `}</style>
    </div>
  );
}
