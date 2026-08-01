"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

interface SpendingChartProps {
  data: { category: string; amount: number }[];
}

const SpendingChart = ({ data }: SpendingChartProps) => {
  const chartData = {
    labels: data.map((d) => d.category),
    datasets: [
      {
        label: "Spending",
        data: data.map((d) => d.amount),
        backgroundColor: [
          "#0747b6",
          "#2265d8",
          "#2f91fa",
          "#5ba0fb",
          "#87bdfd",
        ],
        borderRadius: 8,
      },
    ],
  };

  return (
    <div className="w-full rounded-xl border border-gray-200 p-6">
      <h3 className="text-18 font-semibold text-gray-900 mb-4">
        Spending by Category
      </h3>
      <Bar
        data={chartData}
        options={{
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `$${ctx.parsed.y.toFixed(2)}`,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => `$${value}`,
              },
            },
          },
        }}
      />
    </div>
  );
};

export default SpendingChart;
