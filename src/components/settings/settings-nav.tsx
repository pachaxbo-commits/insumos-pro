import Link from "next/link";

const sections = [
  { href: "/configuracion", title: "General" },
  { href: "/configuracion/productos", title: "Agregar / Configurar productos" },
  { href: "/configuracion/parametrizacion", title: "Parametrización" },
  { href: "/configuracion/datos-prueba", title: "Datos de prueba" },
];

export function SettingsNav({ current }: { current: string }) {
  return <nav aria-label="Secciones de configuración" className="flex flex-wrap gap-2 border-b pb-3">
    {sections.map((section) => <Link key={section.href} href={section.href} aria-current={current === section.href ? "page" : undefined}
      className={`rounded-md px-3 py-2 text-sm ${current === section.href ? "bg-emerald-900 text-white" : "border bg-white text-slate-700 hover:bg-slate-50"}`}>
      {section.title}
    </Link>)}
  </nav>;
}
