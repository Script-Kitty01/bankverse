"use client";

const AnimatedCounter = ({ amount }: { amount: number }) => {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return (
    <div className="w-full">
      <span>{formatted}</span>
    </div>
  );
};

export default AnimatedCounter;
