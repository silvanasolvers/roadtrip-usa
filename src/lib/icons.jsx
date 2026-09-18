// Familia de iconos del tablero.
//
// Una sola familia, dibujada con las mismas proporciones ópticas: viewBox 24,
// trazo 1.75, uniones y remates redondeados, `currentColor` para heredar color.
// Reemplaza la mezcla anterior de símbolos unicode (◎ ≡ ⌖ ✈) y emoji a color
// (🧳 📄): mezclar esas dos lenguas se ve improvisado, y el emoji a color se
// renderiza distinto (o como emoji del sistema) en cada plataforma.
//
// Los nombres están en inglés para que coincidan con las claves de uso.

const P = {
  // --- navegación principal -------------------------------------------------
  // Ruta: dos bordes que convergen + línea discontinua al centro.
  route: (
    <>
      <path d="M6.5 21 9 3" />
      <path d="M17.5 21 15 3" />
      <path d="M12 3.5v3.2M12 10.4v3.2M12 17.3v3.2" />
    </>
  ),
  // Itinerario: paradas numeradas sobre una guía vertical.
  itinerary: (
    <>
      <path d="M4.5 5.5h15M4.5 12h15M4.5 18.5h15" />
      <circle cx="8" cy="5.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="8" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6Z" />
    </>
  ),
  // Avión: silueta de jet, reconocible a 16px.
  plane: (
    <path d="M12 2c1.1 0 2 .9 2 2v5.2l7 4.1v2.1l-7-2.1v3.9l2.5 1.9v2l-4.5-1.4-4.5 1.4v-2l2.5-1.9v-3.9l-7 2.1v-2.1l7-4.1V4c0-1.1.9-2 2-2Z" />
  ),
  clipboard: (
    <>
      <path d="M9 4.5h6v2.2H9z" />
      <path d="M15 5.6h2.4A1.6 1.6 0 0 1 19 7.2v12.2A1.6 1.6 0 0 1 17.4 21H6.6A1.6 1.6 0 0 1 5 19.4V7.2a1.6 1.6 0 0 1 1.6-1.6H9" />
      <path d="m9 13.6 2.1 2.1L15.4 11.4" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 8.6A2.6 2.6 0 0 1 5.6 6H18a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" />
      <path d="M3 8.6V7a2 2 0 0 1 2-2h9.5" />
      <circle cx="16.4" cy="13" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  luggage: (
    <>
      <path d="M4 9h16v9.4A2.6 2.6 0 0 1 17.4 21H6.6A2.6 2.6 0 0 1 4 18.4Z" />
      <path d="M9 9V6.4A3.4 3.4 0 0 1 12.4 3h-.8A3.4 3.4 0 0 1 15 6.4V9" />
      <path d="M9.5 9v12M14.5 9v12" />
    </>
  ),
  // Hospedaje: cama doble vista de frente, mismo trazo que el resto.
  bed: (
    <>
      <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
      <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
      <path d="M2 18h20" />
      <path d="M12 4v6" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7.6A1.6 1.6 0 0 0 6 4.6v14.8A1.6 1.6 0 0 0 7.6 21h8.8a1.6 1.6 0 0 0 1.6-1.6V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13.2h6M9 16.8h4" />
    </>
  ),
  guidebook: (
    <>
      <path d="M4 5.8A2.8 2.8 0 0 1 6.8 3H19v14.4H6.8A2.8 2.8 0 0 0 4 20.2Z" />
      <path d="M4 20.2A2.8 2.8 0 0 1 6.8 17.4H19V21H6.8A2.8 2.8 0 0 1 4 20.2Z" />
    </>
  ),

  // --- estado y avisos ------------------------------------------------------
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  check: <path d="m4.5 12.6 5 5L19.5 7.4" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.4 2.7 2.7 5-5.4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.6 21 19.4H3Z" />
      <path d="M12 9.6v4.2" />
      <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.2" />
      <circle cx="12" cy="7.9" r=".95" fill="currentColor" stroke="none" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8.4A1.4 1.4 0 0 1 4.4 7h15.2A1.4 1.4 0 0 1 21 8.4v2a2.2 2.2 0 0 0 0 4.2v1A1.4 1.4 0 0 1 19.6 17H4.4A1.4 1.4 0 0 1 3 15.6v-1a2.2 2.2 0 0 0 0-4.2Z" />
      <path d="M14 7v10" />
    </>
  ),
  shuttle: (
    <>
      <path d="M4 6.4A2.4 2.4 0 0 1 6.4 4h11.2A2.4 2.4 0 0 1 20 6.4V15H4Z" />
      <path d="M4 11h16" />
      <path d="M7.5 15v2M16.5 15v2" />
      <circle cx="7.6" cy="18.4" r="1.5" />
      <circle cx="16.4" cy="18.4" r="1.5" />
    </>
  ),
  van: (
    <>
      <path d="M2.5 15.2V8.6A1.6 1.6 0 0 1 4.1 7h11.2l3.4 3.2 2.3 1a1.6 1.6 0 0 1 1 1.5v2.5Z" />
      <path d="M15.3 7v4.2h6.7" />
      <circle cx="7" cy="17.6" r="1.7" />
      <circle cx="17" cy="17.6" r="1.7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.6" cy="9.6" r="1.5" />
      <path d="m4 17 4.6-4.3 3.4 3 3-2.6L20.5 17" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.4" r="3.7" />
      <path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.2 12a8.2 8.2 0 1 1-2.6-6" />
      <path d="M20.6 4.2v5h-5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.6v11" />
      <path d="m7.6 10.2 4.4 4.4 4.4-4.4" />
      <path d="M4.4 19.8h15.2" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4.5 12h14" />
      <path d="m13.4 7 5 5-5 5" />
    </>
  ),
  external: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14.4v3.8a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2V7.8a2 2 0 0 1 2-2h3.8" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  pin: (
    <>
      <path d="M12 21s6.5-6 6.5-10.6A6.5 6.5 0 0 0 5.5 10.4C5.5 15 12 21 12 21Z" />
      <circle cx="12" cy="10.2" r="2.4" />
    </>
  ),
  mountain: <path d="m2.5 19.5 6.2-9.6 3.6 5 2.4-3.2 6.8 7.8Z" />,
}

const SIZES = { sm: 16, md: 20, lg: 24, xl: 32 }

export function Icon({ name, size = 'md', className = '', strokeWidth = 1.75, title }) {
  const d = P[name]
  if (!d) return null
  const px = typeof size === 'number' ? size : (SIZES[size] ?? 20)
  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      className={'ic ' + className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {d}
    </svg>
  )
}

export const ICON_NAMES = Object.keys(P)
