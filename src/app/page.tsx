"use client";

import Dither from "./dashboard/components/Dither";
import Image from "next/image";
import isipiciLogo from "./isipici.svg";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg1 text-app">
      <section
        className="
          relative
          w-full
          min-h-screen
          overflow-hidden
          flex
          items-center
          justify-center
        "
      >
        {/* Fondo animado */}
        <div className="absolute inset-0">
          <Dither
            waveColor={[0.0, 0.8, 0.8]}
            disableAnimation={false}
            enableMouseInteraction={true}
            mouseRadius={0.3}
            colorNum={5}
            waveAmplitude={0.3}
            waveFrequency={3}
            waveSpeed={0.03}
          />
        </div>

        {/* Contenedor centrado */}
        <div
          className="
            relative z-10
            w-full max-w-[1120px]
            px-p20
          "
        >
          <div
            className="
              rounded-br25
              border border-n1
              bg-bg0/70
              backdrop-blur-sm
              px-p30 py-p30
              flex flex-col gap-p20
            "
          >
            <div className="space-y-p10">
              <p className="fs-12 tracking-[0.18em] uppercase text-[color:var(--n0)]">
                GYM CLIENT & PAYMENT MANAGER
              </p>
              <h1 className="fs-32 font-semibold text-[color:var(--n0)]">
                <span className="text-sm font-semibold tracking-[0.18em] bg-[color:var(--n0)] uppercase">
                  <Image
                    src={isipiciLogo}
                    alt="ISIPICI"
                    width={24}
                    height={24}
                    className="h-6 w-20"
                  />
                </span>{" "}
                <span className="text-[color:var(--n0)]">
                  control total de tus cuotas
                </span>
              </h1>
              <p className="fs-14 text-[color:var(--n0)] max-w-[460px]">
                Administra clientes, pagos y deudas en un dashboard pensado para
                el día a día del gimnasio. Datos claros, decisiones rápidas.
              </p>
            </div>

            <div className="flex flex-wrap gap-p10">
              <button
                type="button"
                className="btn-primary px-p30 py-p10 rounded-full fs-14"
                onClick={() => {
                  window.location.href = "/dashboard";
                }}
              >
                Ir al dashboard
              </button>
              <button
                type="button"
                className="
                  px-p30 py-p10
                  rounded-full
                  fs-14
                  border border-n2
                  bg-bg1
                  text-[color:var(--n8)]
                "
              >
                Quiero una cuenta de negocio
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
