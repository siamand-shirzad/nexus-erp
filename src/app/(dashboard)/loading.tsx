import { Card, CardSkeleton, Skeleton } from "@/components/ui";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="h-[300px] p-5 xl:col-span-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-6 h-[220px] w-full" />
        </Card>
        <Card className="h-[300px] p-5">
          <Skeleton className="h-4 w-32" />
          <div className="mt-8 flex justify-center">
            <Skeleton className="h-44 w-44 rounded-full" />
          </div>
        </Card>
      </div>
    </div>
  );
}
