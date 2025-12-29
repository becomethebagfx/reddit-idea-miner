// Dashboard server for Reddit Idea Miner
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Database connection
const dbPath = process.env.DB_PATH || join(__dirname, '..', 'data', 'reddit.db');
let db;
try {
  db = new Database(dbPath);
} catch (e) {
  console.error('Database not found, using mock data');
  db = null;
}

// Get all ideas
app.get('/api/ideas', (req, res) => {
  try {
    const ideas = db.prepare(`
      SELECT
        i.*,
        c.name as cluster_name,
        c.description as cluster_description
      FROM ideas i
      LEFT JOIN clusters c ON i.cluster_id = c.id
      ORDER BY i.generated_at DESC
    `).all();
    res.json(ideas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update idea status
app.patch('/api/ideas/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    // Add status column if not exists
    try {
      db.exec(`ALTER TABLE ideas ADD COLUMN status TEXT DEFAULT 'pending'`);
    } catch (e) { /* column exists */ }

    try {
      db.exec(`ALTER TABLE ideas ADD COLUMN notes TEXT`);
    } catch (e) { /* column exists */ }

    const stmt = db.prepare(`UPDATE ideas SET status = ?, notes = ? WHERE id = ?`);
    stmt.run(status || 'pending', notes || '', id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = {
      posts: db.prepare('SELECT COUNT(*) as count FROM posts').get().count,
      comments: db.prepare('SELECT COUNT(*) as count FROM comments').get().count,
      insights: db.prepare('SELECT COUNT(*) as count FROM insights').get().count,
      clusters: db.prepare('SELECT COUNT(*) as count FROM clusters').get().count,
      ideas: db.prepare('SELECT COUNT(*) as count FROM ideas').get().count,
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get evidence for an idea
app.get('/api/ideas/:id/evidence', (req, res) => {
  try {
    const { id } = req.params;
    const idea = db.prepare('SELECT cluster_id FROM ideas WHERE id = ?').get(id);

    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    const cluster = db.prepare('SELECT insight_ids FROM clusters WHERE id = ?').get(idea.cluster_id);
    if (!cluster) {
      return res.json([]);
    }

    const insightIds = JSON.parse(cluster.insight_ids || '[]');
    const evidence = [];

    for (const insightId of insightIds.slice(0, 5)) {
      const insight = db.prepare('SELECT * FROM insights WHERE id = ?').get(insightId);
      if (insight) {
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(insight.thread_id);
        evidence.push({ insight, post });
      }
    }

    res.json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3007;
const HOST = '0.0.0.0'; // Listen on all interfaces for external access
app.listen(PORT, HOST, () => {
  console.log(`Dashboard running at http://0.0.0.0:${PORT}`);
});
