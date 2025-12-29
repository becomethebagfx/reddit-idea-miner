export default async function handler(req, res) {
  try {
    const response = await fetch('http://167.71.169.85:3007/api/stats');
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
