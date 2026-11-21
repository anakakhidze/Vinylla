// Music assistant route: signed-in users chat here; the question goes to the Python agent (agent/main.py) and the answer comes back.
const express = require('express');
const assistantJson = express.json({ limit: '64kb' });
const chatLog = new Map();
function chatLimited(uid) {
  const now = Date.now();
  const a = (chatLog.get(uid) || []).filter(t => now - t < 600000);
  if (a.length >= 25) { chatLog.set(uid, a); return true; }
  a.push(now); chatLog.set(uid, a); return false;
}
const AGENT_URL = process.env.AGENT_URL || 'http://127.0.0.1:8001/agent';

module.exports = function mountAssistant(app) {
  app.post('/api/assistant', assistantJson, async (req, res) => {
    const me = await require('./accounts').currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in to chat with the assistant.' });
    if (chatLimited(me.id)) return res.status(429).json({ error: 'You have asked a lot in a short time. Try again in a few minutes.' });
    const msgs = (Array.isArray(req.body.messages) ? req.body.messages : [])
      .slice(-12)
      .map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: String(m && m.content || '').slice(0, 2000) }))
      .filter(m => m.content);
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return res.status(400).json({ error: 'Send a message first.' });
    try {
      const r = await fetch(AGENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, cookie: req.headers.cookie || '' }),
        signal: AbortSignal.timeout(60000)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ error: 'The assistant could not answer right now.' });
      res.json({ reply: j.reply || '', songs: Array.isArray(j.songs) ? j.songs : [] });
    } catch (e) {
      res.status(503).json({ error: 'The assistant is starting up. Try again in a moment.' });
    }
  });
};
