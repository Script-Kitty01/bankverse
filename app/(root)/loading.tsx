import { DashboardSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <div className="home">
      <div className="home-content p-8">
        <DashboardSkeleton />
      </div>
    </div>
  );
}
