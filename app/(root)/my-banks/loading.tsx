import { CardSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <section className="my-banks">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-md bg-gray-200" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-gray-200" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </section>
  );
}
