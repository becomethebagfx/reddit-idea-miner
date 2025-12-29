import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'data', 'reddit.db'));

const stats = {
  posts: db.prepare('SELECT COUNT(*) as count FROM posts').get().count,
  comments: db.prepare('SELECT COUNT(*) as count FROM comments').get().count,
  insights: db.prepare('SELECT COUNT(*) as count FROM insights').get().count,
  clusters: db.prepare('SELECT COUNT(*) as count FROM clusters').get().count,
  ideas: db.prepare('SELECT COUNT(*) as count FROM ideas').get().count,
};

const ideas = db.prepare(`
  SELECT i.*, c.name as cluster_name, c.description as cluster_description
  FROM ideas i
  LEFT JOIN clusters c ON i.cluster_id = c.id
  ORDER BY i.generated_at DESC
`).all();

const data = { stats, ideas };
writeFileSync(join(__dirname, 'dashboard', 'public', 'data.json'), JSON.stringify(data, null, 2));
console.log('Exported', ideas.length, 'ideas to dashboard/public/data.json');
