"use client";

import Dither from "./dashboard/components/Dither";
import Image from "next/image";
import isipiciLogo from "../../public/isipici.svg";
import ablelogo from "../../public/abllle-logo-o.png";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg8 text-app">
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
        {/* Fondo animado + contenido inside Dither so interactions are tracked */}
        <Dither
          waveColor={[0.12, 0.12, 0.12]}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={2}
          colorNum={40}
          waveAmplitude={0}
          waveFrequency={1.5}
          waveSpeed={0.05}
        >
          {/* Contenedor centrado (rendered as children overlay) */}
          <div
            className="
              relative z-10
              w-full max-w-[1120px]
              items-center justify-center
              flex
              flex-col
              min-h-screen
              py-p50
            "
          >
            <div
              className="
                rounded-br25
                border border-n1
                bg-[var(--nt8)]
                
                backdrop-blur-sm
                px-p30 py-p30
                flex flex-col gap-p50
                w-full
                items-center justify-center
              "
            >
              <div className="flex flex-col gap-p50 text-center max-w-[600px]">
                <p className="fs-12 tracking-[0.18em] uppercase text-[color:var(--n8)]">
                  CLIENT & PAYMENT MANAGER
                </p>
                <span className="text-sm font-semibold tracking-[0.18em]  uppercase flex justify-center">
                  <Image
                    src={isipiciLogo}
                    alt="ISIPICI"
                    width={44}
                    height={44}
                    color="000000"
                    className="h-18 w-60 "
                  />
                </span>{" "}
                <div className=" flex-col gap-p10 flex">
                  <h1 className="fs-32 font-black text-[color:var(--n8)] uppercase ">
                    control total de tus cuotas
                  </h1>
                  <p className="fs-14 text-[color:var(--n8)]">
                    Administra clientes, pagos y deudas en un dashboard pensado
                    para el día a día del gimnasio. Datos claros, decisiones
                    rápidas.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-p10">
                <button
                  type="button"
                  className=" 
                    rounded-full
                    fs-14
                    
                    btn-primary2
                    text-[color:var(--n1)]
                    w-fit 
                    flex
                    max-w-[350px] items-center justify-center "
                  onClick={() => {
                    window.location.href = "/login";
                  }}
                >
                  Iniciar sesión
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
                    transition-all duration-300 ease-in-out
                    hover:bg-[color:var(--n2)] hover:text-[color:var(--n8)] hover:cursor-pointer
                  "
                  onClick={() => {
                    window.location.href = "https://w.app/oievhw";
                  }}
                >
                  Abrir cuenta
                </button>
              </div>
            </div>
            <a
              className="fs-12 text-[color:var(--n4)] mt-p10 flex flex-wrap items-center gap-p10 w-fit pt-p30"
              target="_blank"
              rel="noopener noreferrer"
              href="https://abllle.com"
            >
              powered by
              <Image
                src={ablelogo}
                alt="Able Software"
                width={40}
                height={6}
                className="h-6 w-auto mt-p10 mx-auto"
                priority
              />
            </a>
          </div>
        </Dither>
      </section>
    </main>
  );
}
