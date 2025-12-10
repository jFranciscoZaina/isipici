"use client";

import Dither from "./dashboard/components/Dither";
import Image from "next/image";
import isipiciLogo from "../../public/isipiciXL.svg";

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
            waveColor={[0.5, 0.5, 0.5]}
            disableAnimation={false}
            enableMouseInteraction={true}
            mouseRadius={0.3}
            colorNum={5}
            waveAmplitude={0.7}
            waveFrequency={0}
            waveSpeed={0.01}
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
              flex flex-col gap-p50
              w-full
              items-center justify-center
            "
          >
            <div className="flex flex-col gap-p50 text-center max-w-lg">
              <p className="fs-12 tracking-[0.18em] uppercase text-[color:var(--n0)]">
                CLIENT & PAYMENT MANAGER
              </p>
              
                <span className="text-sm font-semibold tracking-[0.18em]  uppercase flex justify-center">
                  <Image
                    src={isipiciLogo}
                    alt="ISIPICI"
                    width={44}
                    height={44}
                    color="FFFFFF"
                    className="h-18 w-60 "
                  />
                </span>{" "}
              
              <div className=" flex-col gap-p0 flex">
             <h1 className="fs-32 font-semibold text-[color:var(--n0)]">
                control total de tus cuotas
              </h1>
              <p className="fs-14 text-[color:var(--n0)] max-w-[460px]">
                Administra clientes, pagos y deudas en un dashboard pensado para
                el día a día del gimnasio. Datos claros, decisiones rápidas.
              </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-p10">
              <button
                type="button"
                className=" px-p30 py-p10
                  rounded-full
                  fs-14
                  border border-n2
                  bg-bg8
                  text-[color:var(--n1)]
                  w-fit 
                  flex
                  max-w-[350px] items-center justify-center "
                onClick={() => {
                  window.location.href = "/login";
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
                  w-fit 
                  flex
                  max-w-[350px] items-center justify-center 
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
