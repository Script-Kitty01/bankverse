import { TableSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <section className="transactions">
      <div className="space-y-2 mb-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-gray-200" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-gray-200" />
      </div>
      <TableSkeleton rows={8} />
    </section>
  );
}
