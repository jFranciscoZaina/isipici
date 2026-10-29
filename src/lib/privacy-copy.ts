import type {Locale} from "./i18n"

type PrivacySection={title:string;paragraphs?:string[];items?:string[]}
type PrivacyCopy={title:string;updated:string;intro:string;sections:PrivacySection[];contactPrefix:string}

export const privacyCopy:Record<Locale,PrivacyCopy>={
 en:{
  title:"Privacy Policy",
  updated:"Last updated: October 29, 2026.",
  intro:"This Privacy Policy explains how ISIPICI collects, uses and protects information when a person creates an account, signs in or uses the platform to manage clients, plans, payments, debt and business communications.",
  contactPrefix:"For privacy questions or requests related to the use of your data, you can write to",
  sections:[
   {title:"1. Scope",paragraphs:["This policy applies to the use of ISIPICI by business owners and authorised users, as well as to information those businesses store about their clients."]},
   {title:"2. Information we collect",paragraphs:["We may process the following categories of information:"],items:[
    "Account data: name, email address, authentication identifiers and basic profile information.",
    "Business data: business name, contact email, country, business type, currency, time zone and workspace configuration.",
    "Client data uploaded by a business: name, email, phone number, address, plans, installments, payments, debt and other information needed for day-to-day management.",
    "Technical and security data: sessions, access records, audit events and information needed to prevent abuse or unauthorised access.",
    "Communication data: information required to send receipts, reminders or operational messages requested through the platform."
   ]},
   {title:"3. Sign in with Google",paragraphs:["ISIPICI allows users to sign in with Google. When you choose this option, we receive only the information authorised for account authentication, currently your name, profile image and email address. ISIPICI does not request access to Gmail, Google Drive, contacts or other content in your Google account."]},
   {title:"4. How we use information",paragraphs:["We use information to:"],items:[
    "create and protect accounts and workspaces;",
    "provide client, plan, installment, payment and debt management features;",
    "send operational emails and verification messages requested by the user;",
    "maintain security and audit records;",
    "diagnose errors, maintain the service and improve how it works;",
    "comply with legal obligations and respond to valid authority requests when required."
   ]},
   {title:"5. Client data managed by each business",paragraphs:["Clients registered inside ISIPICI do not automatically become ISIPICI platform users. Each business decides what client information it enters into ISIPICI and is responsible for having a valid basis to collect and use that information. ISIPICI processes this data only to provide the functions requested by the business."]},
   {title:"6. Service providers",paragraphs:["ISIPICI uses technology providers that may process information on our behalf:"],items:[
    "Supabase, for authentication and database services.",
    "Vercel, for application hosting and delivery.",
    "Resend, for transactional and verification emails.",
    "Google, when you choose Sign in with Google."
   ]},
   {title:"7. Cookies and sessions",paragraphs:["ISIPICI uses cookies and session technologies required to keep users signed in, maintain authorised workspace access, protect authentication and prevent unauthorised access. We do not use these cookies for the purpose of selling personal information to advertisers."]},
   {title:"8. Retention and security",paragraphs:["We retain information for as long as necessary to provide the service, maintain operational and security records, meet legal obligations or resolve disputes. We apply access controls, authentication, business-level data isolation and other reasonable technical safeguards. No system can guarantee absolute security."]},
   {title:"9. Access, correction and deletion",paragraphs:["You may request access to, correction of or deletion of information associated with your account, subject to applicable legal and retention requirements. If the request relates to information a business stored about one of its clients, you may need to contact the business that controls that information first."]},
   {title:"10. Children",paragraphs:["ISIPICI is designed as a business management tool and is not directed at children for the purpose of creating platform administration accounts."]},
   {title:"11. Changes to this policy",paragraphs:["We may update this Privacy Policy when product features, service providers or applicable requirements change. The current version will always be published on this page with its last-updated date."]},
   {title:"12. Contact"}
  ]
 },
 es:{
  title:"Política de Privacidad",
  updated:"Última actualización: 29 de octubre de 2026.",
  intro:"Esta Política de Privacidad explica cómo ISIPICI recopila, utiliza y protege información cuando una persona crea una cuenta, inicia sesión o utiliza la plataforma para gestionar clientes, planes, pagos, deudas y comunicaciones de un negocio.",
  contactPrefix:"Para consultas relacionadas con privacidad o con el uso de tus datos podés escribir a",
  sections:[
   {title:"1. Alcance",paragraphs:["Esta política se aplica al uso de ISIPICI por owners y usuarios autorizados de negocios, y también a la información que esos negocios registran sobre sus clientes."]},
   {title:"2. Información que recopilamos",paragraphs:["Podemos procesar las siguientes categorías de información:"],items:[
    "Datos de cuenta: nombre, dirección de correo electrónico, identificadores de autenticación y datos básicos de perfil.",
    "Datos del negocio: nombre, email de contacto, país, actividad, moneda, zona horaria y configuración del espacio.",
    "Datos cargados por el negocio sobre sus clientes: nombre, email, teléfono, dirección, planes, cuotas, pagos, deuda y otra información necesaria para la gestión cotidiana.",
    "Datos técnicos y de seguridad: sesiones, registros de acceso, eventos de auditoría y datos necesarios para prevenir abuso o accesos no autorizados.",
    "Datos de comunicaciones: información necesaria para enviar comprobantes, recordatorios o mensajes operativos solicitados desde la plataforma."
   ]},
   {title:"3. Inicio de sesión con Google",paragraphs:["ISIPICI permite iniciar sesión con Google. Cuando utilizás esta opción, recibimos de Google únicamente la información autorizada para autenticar tu cuenta, actualmente nombre, imagen de perfil y dirección de correo electrónico. ISIPICI no solicita acceso a Gmail, Google Drive, contactos ni otros contenidos de tu cuenta de Google."]},
   {title:"4. Cómo utilizamos la información",paragraphs:["Utilizamos la información para:"],items:[
    "crear y proteger cuentas y espacios de trabajo;",
    "permitir la gestión de clientes, planes, cuotas, pagos y deudas;",
    "enviar emails operativos y verificaciones solicitadas por el usuario;",
    "mantener registros de auditoría y seguridad;",
    "diagnosticar errores, mantener el servicio y mejorar su funcionamiento;",
    "cumplir obligaciones legales y responder a solicitudes válidas de autoridades cuando corresponda."
   ]},
   {title:"5. Datos de los clientes de cada negocio",paragraphs:["Los clientes registrados dentro de ISIPICI no se convierten automáticamente en usuarios de la plataforma. Cada negocio decide qué información de sus clientes incorpora a ISIPICI y es responsable de contar con una base válida para recopilarla y utilizarla. ISIPICI utiliza esos datos únicamente para prestar las funciones solicitadas por el negocio dentro de la plataforma."]},
   {title:"6. Proveedores que utilizamos",paragraphs:["Para operar ISIPICI utilizamos proveedores tecnológicos que pueden procesar información en nuestro nombre:"],items:[
    "Supabase, para autenticación y base de datos.",
    "Vercel, para alojamiento y entrega de la aplicación.",
    "Resend, para el envío de emails transaccionales y de verificación.",
    "Google, cuando elegís iniciar sesión con Google."
   ]},
   {title:"7. Cookies y sesiones",paragraphs:["ISIPICI utiliza cookies y tecnologías de sesión necesarias para mantener el inicio de sesión, seleccionar el espacio autorizado, proteger la autenticación y prevenir accesos indebidos. No utilizamos estas cookies con el objetivo de vender información personal a anunciantes."]},
   {title:"8. Conservación y seguridad",paragraphs:["Conservamos la información mientras sea necesaria para prestar el servicio, mantener registros operativos y de seguridad, cumplir obligaciones legales o resolver disputas. Aplicamos controles de acceso, autenticación, aislamiento por negocio y otras medidas técnicas razonables para proteger la información. Ningún sistema puede garantizar seguridad absoluta."]},
   {title:"9. Acceso, corrección y eliminación",paragraphs:["Podés solicitar acceso, corrección o eliminación de información asociada a tu cuenta, sujeto a las obligaciones legales y de conservación que correspondan. Si la solicitud se refiere a información que un negocio registró sobre uno de sus clientes, puede ser necesario contactar primero al negocio que administra esos datos."]},
   {title:"10. Menores de edad",paragraphs:["ISIPICI está diseñado como una herramienta de gestión para negocios y no está dirigido a menores para que creen cuentas de administración de la plataforma."]},
   {title:"11. Cambios en esta política",paragraphs:["Podemos actualizar esta Política de Privacidad cuando cambien las funciones del producto, los proveedores utilizados o los requisitos aplicables. La versión vigente estará publicada siempre en esta página con su fecha de actualización."]},
   {title:"12. Contacto"}
  ]
 }
}
