export default async function handler(req, res) {
  const { id } = req.query;

  try {
    if (req.method === 'PATCH') {
      const response = await fetch(`http://167.71.169.85:3007/api/ideas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(200).json(data);
    } else if (req.method === 'GET') {
      const response = await fetch(`http://167.71.169.85:3007/api/ideas/${id}/evidence`);
      const data = await response.json();
      res.status(200).json(data);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
