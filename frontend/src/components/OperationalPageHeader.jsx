export default function OperationalPageHeader({
  title,
  description,
  actions,
  children,
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-[0_12px_30px_rgba(17,24,39,0.05)] sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-blue-700" />
      <div className="relative flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-gray-950 sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 hidden max-w-3xl text-sm font-medium leading-6 text-gray-600 sm:block">
              {description}
            </p>
          )}
          {children}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}
