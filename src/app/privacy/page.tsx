import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Política de Privacidad · ISIPICI",
  description: "Cómo ISIPICI recopila, utiliza y protege la información de sus usuarios y negocios.",
  alternates: { canonical: "/privacy" },
}

const sectionClass="flex flex-col gap-p10"
const headingClass="fs-20 font-semibold text-app"
const textClass="fs-14 text-app-secondary leading-relaxed"

export default function PrivacyPage(){
 return (
  <main className="min-h-screen bg-bg1 text-app" style={{padding:"var(--p20)"}}>
   <article
    className="mx-auto flex w-full max-w-[900px] flex-col gap-p30 rounded-br25 border border-n1 bg-bg0 shadow-lg"
    style={{padding:"var(--p30)"}}
   >
    <header className="flex flex-col gap-p10 border-b border-n1" style={{paddingBottom:"var(--p20)"}}>
     <Link href="/" className="fs-12 text-app-secondary underline-offset-4 hover:underline">← Volver a ISIPICI</Link>
     <div>
      <p className="fs-12 font-medium text-app-secondary">ISIPICI</p>
      <h1 className="font-semibold text-app" style={{fontSize:"var(--fs-28)"}}>Política de Privacidad</h1>
      <p className={textClass} style={{marginTop:"var(--p5)"}}>Última actualización: 29 de octubre de 2026.</p>
     </div>
    </header>

    <section className={sectionClass}>
     <h2 className={headingClass}>1. Alcance</h2>
     <p className={textClass}>
      Esta Política de Privacidad explica cómo ISIPICI recopila, utiliza y protege información cuando una persona crea una cuenta,
      inicia sesión o utiliza la plataforma para gestionar clientes, planes, pagos, deudas y comunicaciones de un negocio.
     </p>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>2. Información que recopilamos</h2>
     <div className={textClass}>
      <p>Podemos procesar las siguientes categorías de información:</p>
      <ul className="list-disc space-y-p5" style={{paddingLeft:"var(--p20)",marginTop:"var(--p10)"}}>
       <li>Datos de cuenta: nombre, dirección de correo electrónico, identificadores de autenticación y datos básicos de perfil.</li>
       <li>Datos del negocio: nombre, email de contacto, país, actividad, moneda, zona horaria y configuración del espacio.</li>
       <li>Datos cargados por el negocio sobre sus clientes: nombre, email, teléfono, dirección, planes, cuotas, pagos, deuda y otra información necesaria para la gestión cotidiana.</li>
       <li>Datos técnicos y de seguridad: sesiones, registros de acceso, eventos de auditoría y datos necesarios para prevenir abuso o accesos no autorizados.</li>
       <li>Datos de comunicaciones: información necesaria para enviar comprobantes, recordatorios o mensajes operativos solicitados desde la plataforma.</li>
      </ul>
     </div>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>3. Inicio de sesión con Google</h2>
     <p className={textClass}>
      ISIPICI permite iniciar sesión con Google. Cuando utilizás esta opción, recibimos de Google únicamente la información autorizada
      para autenticar tu cuenta, actualmente nombre, imagen de perfil y dirección de correo electrónico. ISIPICI no solicita acceso a Gmail,
      Google Drive, contactos ni otros contenidos de tu cuenta de Google.
     </p>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>4. Cómo utilizamos la información</h2>
     <div className={textClass}>
      <p>Utilizamos la información para:</p>
      <ul className="list-disc space-y-p5" style={{paddingLeft:"var(--p20)",marginTop:"var(--p10)"}}>
       <li>crear y proteger cuentas y espacios de trabajo;</li>
       <li>permitir la gestión de clientes, planes, cuotas, pagos y deudas;</li>
       <li>enviar emails operativos y verificaciones solicitadas por el usuario;</li>
       <li>mantener registros de auditoría y seguridad;</li>
       <li>diagnosticar errores, mantener el servicio y mejorar su funcionamiento;</li>
       <li>cumplir obligaciones legales y responder a solicitudes válidas de autoridades cuando corresponda.</li>
      </ul>
     </div>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>5. Datos de los clientes de cada negocio</h2>
     <p className={textClass}>
      Los clientes registrados dentro de ISIPICI no se convierten automáticamente en usuarios de la plataforma. Cada negocio decide qué
      información de sus clientes incorpora a ISIPICI y es responsable de contar con una base válida para recopilarla y utilizarla. ISIPICI
      utiliza esos datos únicamente para prestar las funciones solicitadas por el negocio dentro de la plataforma.
     </p>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>6. Proveedores que utilizamos</h2>
     <div className={textClass}>
      <p>Para operar ISIPICI utilizamos proveedores tecnológicos que pueden procesar información en nuestro nombre:</p>
      <ul className="list-disc space-y-p5" style={{paddingLeft:"var(--p20)",marginTop:"var(--p10)"}}>
       <li><strong className="text-app">Supabase</strong>, para autenticación y base de datos.</li>
       <li><strong className="text-app">Vercel</strong>, para alojamiento y entrega de la aplicación.</li>
       <li><strong className="text-app">Resend</strong>, para el envío de emails transaccionales y de verificación.</li>
       <li><strong className="text-app">Google</strong>, cuando elegís iniciar sesión con Google.</li>
      </ul>
      <p style={{marginTop:"var(--p10)"}}>Estos proveedores procesan información de acuerdo con sus propios términos, medidas de seguridad y políticas aplicables.</p>
     </div>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>7. Cookies y sesiones</h2>
     <p className={textClass}>
      ISIPICI utiliza cookies y tecnologías de sesión necesarias para mantener el inicio de sesión, seleccionar el espacio autorizado,
      proteger la autenticación y prevenir accesos indebidos. No utilizamos estas cookies con el objetivo de vender información personal a anunciantes.
     </p>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>8. Conservación y seguridad</h2>
     <p className={textClass}>
      Conservamos la información mientras sea necesaria para prestar el servicio, mantener registros operativos y de seguridad, cumplir obligaciones
      legales o resolver disputas. Aplicamos controles de acceso, autenticación, aislamiento por negocio y otras medidas técnicas razonables para proteger
      la información. Ningún sistema puede garantizar seguridad absoluta.
     </p>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>9. Acceso, corrección y eliminación</h2>
     <p className={textClass}>
      Podés solicitar acceso, corrección o eliminación de información asociada a tu cuenta, sujeto a las obligaciones legales y de conservación que correspondan.
      Si la solicitud se refiere a información que un negocio registró sobre uno de sus clientes, puede ser necesario contactar primero al negocio que administra esos datos.
     </p>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>10. Menores de edad</h2>
     <p className={textClass}>
      ISIPICI está diseñado como una herramienta de gestión para negocios y no está dirigido a menores para que creen cuentas de administración de la plataforma.
     </p>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>11. Cambios en esta política</h2>
     <p className={textClass}>
      Podemos actualizar esta Política de Privacidad cuando cambien las funciones del producto, los proveedores utilizados o los requisitos aplicables.
      La versión vigente estará publicada siempre en esta página con su fecha de actualización.
     </p>
    </section>

    <section className={sectionClass}>
     <h2 className={headingClass}>12. Contacto</h2>
     <p className={textClass}>
      Para consultas relacionadas con privacidad o con el uso de tus datos podés escribir a{" "}
      <a className="font-medium text-app underline underline-offset-4" href="mailto:juanfranciscozaina@gmail.com">juanfranciscozaina@gmail.com</a>.
     </p>
    </section>
   </article>
  </main>
 )
}
