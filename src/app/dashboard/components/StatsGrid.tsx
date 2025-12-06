"use client";

import { useState } from "react";
import { Eye, EyeOff, ChevronUp, ChevronDown } from "react-feather";

type Props = {
  totalClients: number;
  clientsWithDebt: number;
  monthlyIncome: number;
};

type HiddenState = {
  totalClients: boolean;
  clientsWithDebt: boolean;
  monthlyIncome: boolean;
};

export default function StatsGrid({
  totalClients,
  clientsWithDebt,
  monthlyIncome,
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [hidden, setHidden] = useState<HiddenState>({
    totalClients: false,
    clientsWithDebt: false,
    monthlyIncome: true,
  });

  const toggleHidden = (key: keyof HiddenState) => {
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="mb-1">
      {/* Fila cuando está colapsado */}
      {isCollapsed && (
        <div
          className="group mb-4 flex items-center justify-between border-b border-n2 pb-3 pl-5 pr-3 hover:cursor-pointer transition-colors"
          onClick={() => setIsCollapsed(false)}
        >
          <span
            className="
      fs-14
      text-app-secondary
      transition-colors
      group-hover:text-[color:var(--color-text)]
    "
          >
            Ver métricas del negocio
          </span>

          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="
      p-1
      text-app-secondary
      transition-colors
      group-hover:text-[color:var(--color-text)]
    "
            aria-label="Mostrar métricas del negocio"
          >
            <ChevronDown className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Contenido animado */}
      <div
        className={`overflow-hidden transition-all  ${
          isCollapsed
            ? " duration-700 max-h-0 opacity-0 scale-95"
            : "duration-1000 max-h-[400px] opacity-100 scale-100"
        }`}
      >
        <div className="flex items-start justify-between gap-p10 h-auto">
          <div className="grid flex-1 grid-cols-1 gap-p10 md:grid-cols-3">
            <StatCard
              title="Total Clientes"
              value={totalClients.toString()}
              isHidden={hidden.totalClients}
              onToggleHidden={() => toggleHidden("totalClients")}
            />

            <StatCard
              title="Clientes con deuda"
              value={clientsWithDebt.toString()}
              isHidden={hidden.clientsWithDebt}
              onToggleHidden={() => toggleHidden("clientsWithDebt")}
            />

            <StatCard
              title="Ingresos Mensuales"
              value={monthlyIncome.toLocaleString("es-AR", {
                maximumFractionDigits: 0,
              })}
              isHidden={hidden.monthlyIncome}
              onToggleHidden={() => toggleHidden("monthlyIncome")}
            />
          </div>

          {/* Botón de colapsar */}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="mt-1 flex h-9 w-9 items-center justify-center rounded-br10 bg-[color:var(--color-accent-primary)] text-[color:var(--color-text-on-primary)] transition-colors hover:bg-[#3f3fbb]"
            aria-label="Ocultar métricas del negocio"
          >
            <ChevronUp className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

type StatCardProps = {
  title: string;
  value: string;
  isHidden: boolean;
  onToggleHidden: () => void;
};

function StatCard({ title, value, isHidden, onToggleHidden }: StatCardProps) {
  const displayValue = isHidden ? "***" : value;
  const Icon = isHidden ? Eye : EyeOff;

  return (
    <div className="flex flex-col justify-between rounded-br25 border border-n2 bg-bg0 px-p30 py-p20">
      <div className="flex items-start justify-between gap-p10">
        <div className="fs-12 text-app-secondary">{title}</div>

        <button
          type="button"
          onClick={onToggleHidden}
          className="p-1 text-app-secondary transition-colors hover:text-app"
          aria-label={isHidden ? "Mostrar valor" : "Ocultar valor"}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-4 fs-48 leading-none text-app">{displayValue}</div>
    </div>
  );
}
