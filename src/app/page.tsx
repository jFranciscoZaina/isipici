import Link from 'next/link';

export default function LandingPage() {
  
  const imageUrl = 'https://images.pexels.com/photos/34623377/pexels-photo-34623377.jpeg';

  // Lista de beneficios adaptada al rubro
  const benefits = [
    "Integración Fácil: Empieza a operar y migra tus datos en minutos.",
    "UX Fluida y Clara: Diseñada para un flujo rápido en la gestión diaria.",
    "Recordatorios Automatizados: Envía emails personalizados y nunca pierdas un pago.",
    "Uso Gratuito: Comienza sin costo. Paga solo por funciones avanzadas a medida que creces.",
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-4">
      <div 
        className="flex max-w-8xl w-full bg-white dark:bg-zinc-900 shadow-2xl rounded-xl overflow-hidden"
        style={{ minHeight: '550px' }}
      >
        
        {/* Panel Izquierdo: Imagen de Fondo (siguiendo tu boceto: un bloque visual) */}
        <div 
          className="hidden lg:block w-1/2 relative bg-cover bg-center"
          style={{ 
            backgroundImage: `url('${imageUrl}')`,
          }}
        >
          {/* Overlay sutil para asegurar el impacto visual */}
          <div className="absolute inset-0 bg-black bg-opacity-40"></div>
        </div>

        {/* Panel Derecho: Beneficios y CTA */}
        <div className="w-full lg:w-1/2 p-12 flex flex-col justify-center dark:text-white">
          
          <header className="mb-8">
            <div className="text-sm font-semibold uppercase tracking-widest text-emerald-600 mb-2">
              isipici
            </div>
            <h1 className="text-4xl font-extrabold leading-tight text-zinc-900 dark:text-white">
              SIMPLIFICA LA GESTIÓN. <span className="text-emerald-500">ENFÓCATE EN CRECER.</span>
            </h1>
          </header>

          <p className="text-zinc-600 dark:text-zinc-400 mb-8 text-lg">
            La plataforma líder para gestionar clientes, pagos y finanzas de gimnasios, clubes y estudios.
          </p>

          <ul className="space-y-4 mb-10">
            {benefits.map((benefit, index) => (
              <li key={index} className="flex items-start">
                <span className="text-xl text-emerald-500 mr-3 mt-0.5">✅</span>
                <div className="text-zinc-700 dark:text-zinc-300">
                  <span className="font-semibold text-zinc-900 dark:text-white">{benefit.split(': ')[0]}</span>: {benefit.split(': ')[1]}
                </div>
              </li>
            ))}
          </ul>

          {/* Botón CTA que dirige a /login */}
          <Link href="/login" passHref legacyBehavior>
            <a 
              className="w-full text-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition duration-150 ease-in-out uppercase tracking-wider"
            >
              Iniciar Sesión / Registro
            </a>
          </Link>
          
          <div className="mt-6 text-center text-sm">
            ¿Necesitas ayuda?{' '}
            <a href="#" className="font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300">
              Contáctanos
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}