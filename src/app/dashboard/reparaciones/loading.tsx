export default function ReparacionesLoading() {
  return (
    <div className="py-4 space-y-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-6 bg-gray-200 rounded-xl w-52" />
          <div className="h-4 bg-gray-200 rounded-xl w-72" />
        </div>
        <div className="h-9 bg-gray-200 rounded-xl w-20" />
      </div>
      <div className="flex gap-2">
        {[80, 96, 96, 96].map((w, i) => <div key={i} className="h-8 bg-gray-200 rounded-xl" style={{ width: w }} />)}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}
      </div>
    </div>
  )
}
