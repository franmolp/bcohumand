export default function DashboardLoading() {
  return (
    <div className="py-4 space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 bg-gray-200 rounded-xl w-44" />
        <div className="h-7 bg-gray-200 rounded-xl w-64" />
        <div className="h-3.5 bg-gray-200 rounded-xl w-36 mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 bg-gray-200 rounded-2xl" />
        <div className="h-28 bg-gray-200 rounded-2xl" />
      </div>
      <div className="h-36 bg-gray-200 rounded-2xl" />
      <div className="h-28 bg-gray-200 rounded-2xl" />
      <div className="h-28 bg-gray-200 rounded-2xl" />
    </div>
  )
}
