import { CardSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <section className="payment-transfer">
      <div className="space-y-2 mb-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-gray-200" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-gray-200" />
      </div>
      <CardSkeleton />
    </section>
  );
}
