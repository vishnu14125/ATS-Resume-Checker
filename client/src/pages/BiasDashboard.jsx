import React, { useEffect, useState } from 'react';
import axios from 'axios';

function BiasDashboard() {
  const [report, setReport] = useState([]);

  useEffect(() => {
    async function fetchReport() {
      const res = await axios.get('/api/resume/bias-report');
      setReport(res.data.biasReport);
    }
    fetchReport();
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Bias Report by Gender</h2>
      <table className="mt-4 w-full border">
        <thead>
          <tr>
            <th className="border px-4 py-2">Gender</th>
            <th className="border px-4 py-2">Avg. Score</th>
            <th className="border px-4 py-2">Count</th>
          </tr>
        </thead>
        <tbody>
          {report.map((row, i) => (
            <tr key={i}>
              <td className="border px-4 py-2">{row._id}</td>
              <td className="border px-4 py-2">{row.avgScore.toFixed(2)}</td>
              <td className="border px-4 py-2">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default BiasDashboard;
