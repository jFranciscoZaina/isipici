export default function StatsGrid({
    totalClients,
    clientsWithDebt,
    monthlyIncome,
  }: {
    totalClients: number
    clientsWithDebt: number
    monthlyIncome: number
  }) {
    return (
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard title="Total Clientes" value={totalClients.toString()} />
        <StatCard title="Clientes con deuda" value={clientsWithDebt.toString()} />
        <StatCard
          title="Ingresos Mensuales"
          value={
            "$" + monthlyIncome.toLocaleString("es-AR", { maximumFractionDigits: 0 })
          }
        />
      </div>
    )
  }
  
  function StatCard({ title, value }: { title: string; value: string }) {
    return (
      <div className="rounded-lg bg-white p-4 shadow-sm border">
        <div className="text-xs text-slate-500">{title}</div>
        <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      </div>
    )
  }
  