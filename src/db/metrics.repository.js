const pool = require("../config/db");

async function getMetrics(startDate, endDate) {
  const [rows] = await pool.query(
    `
    SELECT 
      c.platform,
      c.name,
      SUM(d.clicks) AS total_clicks,
      SUM(d.impressions) AS total_impressions,
      SUM(d.cost) AS total_cost
    FROM daily_metrics d
    JOIN campaigns c ON d.campaign_id = c.id
    WHERE d.date BETWEEN ? AND ?
    GROUP BY c.platform, c.name
    `,
    [startDate, endDate],
  );

  return rows;
}

module.exports = {
  getMetrics,
};
