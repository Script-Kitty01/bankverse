"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
);

interface NetWorthChartProps {
  data: { month: string; netWorth: number }[];
}

const NetWorthChart = ({ data }: NetWorthChartProps) => {
  const chartData = {
    labels: data.map((d) => d.month),
    datasets: [
      {
        label: "Net Worth",
        data: data.map((d) => d.netWorth),
        fill: true,
        borderColor: "#0747b6",
        backgroundColor: "rgba(7, 71, 182, 0.1)",
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: "#0747b6",
      },
    ],
  };

  return (
    <div className="w-full glass-card rounded-2xl p-6">
      <h3 className="text-18 font-semibold text-slate-100 mb-4">
        Net Worth Over Time
      </h3>
      <Line
        data={chartData}
        options={{
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `₹${ctx.parsed.y.toFixed(2)}`,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: false,
              ticks: {
                callback: (value) => `₹${value}`,
              },
            },
          },
        }}
      />
    </div>
  );
};

export default NetWorthChart;
